import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  Briefing,
  BriefingTemplate,
  BriefingField,
  BriefingVersion,
  BriefingChange,
  ValidationResult,
  ValidationError,
  TenantContext
} from '../types/index.js';

export class BriefingService {
  constructor(private db: Pool) {}

  async createBriefing(
    briefingData: Omit<Briefing, 'id' | 'version' | 'createdAt' | 'updatedAt'>,
    tenantContext: TenantContext
  ): Promise<Briefing> {
    const briefingId = uuidv4();
    const now = new Date();

    // Validate template exists and belongs to tenant
    const template = await this.getBriefingTemplate(briefingData.templateId, tenantContext);
    if (!template) {
      throw new Error('Template not found or not accessible');
    }

    // Validate briefing data against template
    const validation = await this.validateBriefingData(briefingData.fields, template);
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    const briefing: Briefing = {
      ...briefingData,
      id: briefingId,
      version: 1,
      tenantId: tenantContext.tenantId,
      createdAt: now,
      updatedAt: now
    };

    const query = `
      INSERT INTO briefings (
        id, title, type, template_id, fields, version, status, 
        tenant_id, client_id, created_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const values = [
      briefing.id,
      briefing.title,
      briefing.type,
      briefing.templateId,
      JSON.stringify(briefing.fields),
      briefing.version,
      briefing.status,
      briefing.tenantId,
      briefing.clientId,
      briefing.createdBy,
      briefing.createdAt,
      briefing.updatedAt
    ];

    const result = await this.db.query(query, values);
    
    // Create initial version record
    await this.createBriefingVersion(briefing, [], tenantContext);

    // Handle both PostgreSQL and SQLite result formats
    const row = result.rows && result.rows.length > 0 ? result.rows[0] : null;
    if (!row) {
      throw new Error('Failed to create briefing - no result returned');
    }
    
    return this.mapRowToBriefing(row);
  }

  async getBriefing(briefingId: string, tenantContext: TenantContext): Promise<Briefing | null> {
    const query = `
      SELECT * FROM briefings 
      WHERE id = $1 AND tenant_id = $2
    `;
    
    const result = await this.db.query(query, [briefingId, tenantContext.tenantId]);
    
    if (!result.rows || result.rows.length === 0) {
      return null;
    }

    // Handle both PostgreSQL and SQLite result formats
    const row = result.rows[0];
    return this.mapRowToBriefing(row);
  }

  async updateBriefing(
    briefingId: string,
    updates: Partial<Pick<Briefing, 'title' | 'fields' | 'status'>>,
    tenantContext: TenantContext
  ): Promise<Briefing> {
    const existingBriefing = await this.getBriefing(briefingId, tenantContext);
    if (!existingBriefing) {
      throw new Error('Briefing not found');
    }

    // Calculate changes for version history
    const changes: BriefingChange[] = [];
    let hasChanges = false;

    // Check for title changes
    if (updates.title && updates.title !== existingBriefing.title) {
      hasChanges = true;
    }

    // Check for status changes
    if (updates.status && updates.status !== existingBriefing.status) {
      hasChanges = true;
    }

    // Check for field changes
    if (updates.fields) {
      const fieldChanges = this.calculateFieldChanges(existingBriefing.fields, updates.fields);
      changes.push(...fieldChanges);
      if (fieldChanges.length > 0) {
        hasChanges = true;
      }
    }

    // If no changes, return existing briefing
    if (!hasChanges) {
      return existingBriefing;
    }

    const newVersion = existingBriefing.version + 1;
    const now = new Date();

    const query = `
      UPDATE briefings 
      SET title = ?,
          fields = ?,
          status = ?,
          version = ?,
          updated_at = ?
      WHERE id = ? AND tenant_id = ?
      RETURNING *
    `;

    const values = [
      updates.title || existingBriefing.title,
      updates.fields ? JSON.stringify(updates.fields) : JSON.stringify(existingBriefing.fields),
      updates.status || existingBriefing.status,
      newVersion,
      now,
      briefingId,
      tenantContext.tenantId
    ];

    const result = await this.db.query(query, values);
    // Handle both PostgreSQL and SQLite result formats
    const row = result.rows && result.rows.length > 0 ? result.rows[0] : null;
    if (!row) {
      throw new Error('Failed to update briefing - no result returned');
    }
    
    const updatedBriefing = this.mapRowToBriefing(row);

    // Create version record only if there were changes
    await this.createBriefingVersion(updatedBriefing, changes, tenantContext);

    return updatedBriefing;
  }

  async validateBriefing(briefingId: string, tenantContext: TenantContext): Promise<ValidationResult> {
    const briefing = await this.getBriefing(briefingId, tenantContext);
    if (!briefing) {
      return {
        isValid: false,
        errors: [{ field: 'briefing', message: 'Briefing not found', code: 'NOT_FOUND' }]
      };
    }

    const template = await this.getBriefingTemplate(briefing.templateId, tenantContext);
    if (!template) {
      return {
        isValid: false,
        errors: [{ field: 'template', message: 'Template not found', code: 'TEMPLATE_NOT_FOUND' }]
      };
    }

    return this.validateBriefingData(briefing.fields, template);
  }

  async getBriefingVersions(briefingId: string, tenantContext: TenantContext): Promise<BriefingVersion[]> {
    const query = `
      SELECT * FROM briefing_versions 
      WHERE briefing_id = $1 AND tenant_id = $2
      ORDER BY version DESC
    `;
    
    const result = await this.db.query(query, [briefingId, tenantContext.tenantId]);
    
    return (result.rows || []).map(row => ({
      id: row.id,
      briefingId: row.briefing_id || row.briefingId,
      version: row.version,
      fields: typeof row.fields === 'string' ? row.fields : JSON.stringify(row.fields || {}),
      changes: typeof row.changes === 'string' ? row.changes : JSON.stringify(row.changes || []),
      tenantId: row.tenant_id || row.tenantId,
      createdBy: row.created_by || row.createdBy,
      createdAt: row.created_at ? new Date(row.created_at) : new Date()
    }));
  }

  // Template Management
  async createBriefingTemplate(
    templateData: Omit<BriefingTemplate, 'id' | 'createdAt' | 'updatedAt'>,
    tenantContext: TenantContext
  ): Promise<BriefingTemplate> {
    const templateId = uuidv4();
    const now = new Date();

    const template: BriefingTemplate = {
      ...templateData,
      id: templateId,
      tenantId: tenantContext.tenantId,
      createdAt: now,
      updatedAt: now
    };

    const query = `
      INSERT INTO briefing_templates (
        id, name, description, fields, required_fields, tenant_id, 
        is_active, created_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const values = [
      template.id,
      template.name,
      template.description,
      JSON.stringify(template.fields),
      JSON.stringify(template.requiredFields),
      template.tenantId,
      template.isActive,
      template.createdBy,
      template.createdAt,
      template.updatedAt
    ];

    const result = await this.db.query(query, values);
    // Handle both PostgreSQL and SQLite result formats
    const row = result.rows && result.rows.length > 0 ? result.rows[0] : null;
    if (!row) {
      throw new Error('Failed to create briefing template - no result returned');
    }
    
    return this.mapRowToBriefingTemplate(row);
  }

  async getBriefingTemplate(templateId: string, tenantContext: TenantContext): Promise<BriefingTemplate | null> {
    const query = `
      SELECT * FROM briefing_templates 
      WHERE id = $1 AND tenant_id = $2 AND is_active = true
    `;
    
    const result = await this.db.query(query, [templateId, tenantContext.tenantId]);
    
    if (!result.rows || result.rows.length === 0) {
      return null;
    }

    // Handle both PostgreSQL and SQLite result formats
    const row = result.rows[0];
    return this.mapRowToBriefingTemplate(row);
  }

  async getBriefingTemplates(tenantContext: TenantContext): Promise<BriefingTemplate[]> {
    const query = `
      SELECT * FROM briefing_templates 
      WHERE tenant_id = $1 AND is_active = true
      ORDER BY name
    `;
    
    const result = await this.db.query(query, [tenantContext.tenantId]);
    
    return (result.rows || []).map(row => this.mapRowToBriefingTemplate(row));
  }

  // Private helper methods
  private async createBriefingVersion(
    briefing: Briefing,
    changes: BriefingChange[],
    tenantContext: TenantContext
  ): Promise<void> {
    const versionId = uuidv4();
    
    const query = `
      INSERT INTO briefing_versions (
        id, briefing_id, version, fields, changes, tenant_id, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    const values = [
      versionId,
      briefing.id,
      briefing.version,
      JSON.stringify(briefing.fields),
      JSON.stringify(changes),
      tenantContext.tenantId,
      briefing.createdBy,
      new Date()
    ];

    await this.db.query(query, values);
  }

  private calculateFieldChanges(oldFields: Record<string, any>, newFields: Record<string, any>): BriefingChange[] {
    const changes: BriefingChange[] = [];
    
    // Check for modified and removed fields
    for (const [field, oldValue] of Object.entries(oldFields)) {
      if (!(field in newFields)) {
        changes.push({ field, oldValue, newValue: null, changeType: 'removed' });
      } else if (JSON.stringify(oldValue) !== JSON.stringify(newFields[field])) {
        changes.push({ field, oldValue, newValue: newFields[field], changeType: 'modified' });
      }
    }

    // Check for added fields
    for (const [field, newValue] of Object.entries(newFields)) {
      if (!(field in oldFields)) {
        changes.push({ field, oldValue: null, newValue, changeType: 'added' });
      }
    }

    return changes;
  }

  private async validateBriefingData(fields: Record<string, any>, template: BriefingTemplate): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    // Check required fields
    for (const requiredField of template.requiredFields) {
      if (!fields[requiredField] || fields[requiredField] === '') {
        errors.push({
          field: requiredField,
          message: `Field '${requiredField}' is required`,
          code: 'REQUIRED_FIELD_MISSING'
        });
      }
    }

    // Validate field types and constraints
    for (const templateField of template.fields) {
      const value = fields[templateField.name];
      
      if (value !== undefined && value !== null && value !== '') {
        const fieldErrors = this.validateFieldValue(value, templateField);
        errors.push(...fieldErrors);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private validateFieldValue(value: any, field: BriefingField): ValidationError[] {
    const errors: ValidationError[] = [];

    switch (field.type) {
      case 'text':
      case 'textarea':
        if (typeof value !== 'string') {
          errors.push({
            field: field.name,
            message: `Field '${field.name}' must be a string`,
            code: 'INVALID_TYPE'
          });
        } else {
          if (field.validation?.minLength && value.length < field.validation.minLength) {
            errors.push({
              field: field.name,
              message: `Field '${field.name}' must be at least ${field.validation.minLength} characters`,
              code: 'MIN_LENGTH'
            });
          }
          if (field.validation?.maxLength && value.length > field.validation.maxLength) {
            errors.push({
              field: field.name,
              message: `Field '${field.name}' must be at most ${field.validation.maxLength} characters`,
              code: 'MAX_LENGTH'
            });
          }
          if (field.validation?.pattern && !new RegExp(field.validation.pattern).test(value)) {
            errors.push({
              field: field.name,
              message: `Field '${field.name}' does not match required pattern`,
              code: 'PATTERN_MISMATCH'
            });
          }
        }
        break;

      case 'number':
        if (typeof value !== 'number') {
          errors.push({
            field: field.name,
            message: `Field '${field.name}' must be a number`,
            code: 'INVALID_TYPE'
          });
        } else {
          if (field.validation?.min !== undefined && value < field.validation.min) {
            errors.push({
              field: field.name,
              message: `Field '${field.name}' must be at least ${field.validation.min}`,
              code: 'MIN_VALUE'
            });
          }
          if (field.validation?.max !== undefined && value > field.validation.max) {
            errors.push({
              field: field.name,
              message: `Field '${field.name}' must be at most ${field.validation.max}`,
              code: 'MAX_VALUE'
            });
          }
        }
        break;

      case 'select':
        if (field.options && !field.options.includes(value)) {
          errors.push({
            field: field.name,
            message: `Field '${field.name}' must be one of: ${field.options.join(', ')}`,
            code: 'INVALID_OPTION'
          });
        }
        break;

      case 'multiselect':
        if (!Array.isArray(value)) {
          errors.push({
            field: field.name,
            message: `Field '${field.name}' must be an array`,
            code: 'INVALID_TYPE'
          });
        } else if (field.options) {
          const invalidOptions = value.filter(v => !field.options!.includes(v));
          if (invalidOptions.length > 0) {
            errors.push({
              field: field.name,
              message: `Field '${field.name}' contains invalid options: ${invalidOptions.join(', ')}`,
              code: 'INVALID_OPTION'
            });
          }
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push({
            field: field.name,
            message: `Field '${field.name}' must be a boolean`,
            code: 'INVALID_TYPE'
          });
        }
        break;

      case 'date':
        if (!(value instanceof Date) && !Date.parse(value)) {
          errors.push({
            field: field.name,
            message: `Field '${field.name}' must be a valid date`,
            code: 'INVALID_DATE'
          });
        }
        break;
    }

    return errors;
  }

  private mapRowToBriefing(row: any): Briefing {
    if (!row) {
      throw new Error('Cannot map null or undefined row to Briefing');
    }
    
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      templateId: row.template_id || row.templateId,
      fields: typeof row.fields === 'string' ? JSON.parse(row.fields) : (row.fields || {}),
      version: row.version || 1,
      status: row.status || 'draft',
      tenantId: row.tenant_id || row.tenantId,
      clientId: row.client_id || row.clientId,
      createdBy: row.created_by || row.createdBy,
      createdAt: row.created_at ? new Date(row.created_at) : new Date(),
      updatedAt: row.updated_at ? new Date(row.updated_at) : new Date()
    };
  }

  private mapRowToBriefingTemplate(row: any): BriefingTemplate {
    if (!row) {
      throw new Error('Cannot map null or undefined row to BriefingTemplate');
    }
    
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      fields: typeof row.fields === 'string' ? JSON.parse(row.fields) : (row.fields || []),
      requiredFields: typeof row.required_fields === 'string' ? JSON.parse(row.required_fields) : (row.requiredFields || []),
      tenantId: row.tenant_id || row.tenantId,
      isActive: Boolean(row.is_active !== undefined ? row.is_active : row.isActive),
      createdBy: row.created_by || row.createdBy,
      createdAt: row.created_at ? new Date(row.created_at) : new Date(),
      updatedAt: row.updated_at ? new Date(row.updated_at) : new Date()
    };
  }
}