import { v4 as uuidv4 } from 'uuid';
import {
  Content,
  ContentData,
  AdaptedContent,
  Platform,
  ValidationResult,
  ValidationError,
  TenantContext,
  Briefing
} from '../types/index.js';
import { DatabasePool, DatabaseClient } from '../interfaces/database.js';
import { WorkflowEngine } from './workflow.js';
import { BriefingService } from './briefing.js';

export class ContentService {
  private db: DatabasePool;
  private workflowEngine: WorkflowEngine;
  private briefingService: BriefingService;

  constructor(db: DatabasePool) {
    this.db = db;
    this.workflowEngine = new WorkflowEngine(db);
    this.briefingService = new BriefingService(db);
  }

  async createContent(
    contentData: Omit<Content, 'id' | 'workflowId' | 'createdAt' | 'updatedAt'>,
    tenantContext: TenantContext
  ): Promise<Content> {
    // Validate briefing association requirement (Requirement 14.4)
    const briefing = await this.validateBriefingAssociation(contentData.briefingId, tenantContext);
    if (!briefing) {
      throw new Error('Content must be associated with an active briefing');
    }

    const contentId = uuidv4();
    const now = new Date();

    const client = this.db.connect ? await this.db.connect() : this.db as DatabaseClient;
    try {
      if (client.query !== this.db.query) {
        await client.query('BEGIN');
      }

      // Create content record
      const content: Content = {
        ...contentData,
        id: contentId,
        workflowId: '', // Will be set after workflow creation
        tenantId: tenantContext.tenantId,
        createdAt: now,
        updatedAt: now
      };

      await client.query(`
        INSERT INTO content (
          id, briefing_id, title, description, content_type, 
          base_content, adapted_content, tenant_id, client_id, 
          created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        content.id,
        content.briefingId,
        content.title,
        content.description,
        content.contentType,
        JSON.stringify(content.baseContent),
        JSON.stringify(content.adaptedContent),
        content.tenantId,
        content.clientId,
        content.createdBy,
        content.createdAt.toISOString(),
        content.updatedAt.toISOString()
      ]);
      // Create workflow for content
      const workflow = await this.workflowEngine.createWorkflow(contentId, tenantContext);
      
      // Update content with workflow ID
      await client.query(`
        UPDATE content SET workflow_id = ? WHERE id = ?
      `, [workflow.id, contentId]);

      content.workflowId = workflow.id;

      if (client.query !== this.db.query) {
        await client.query('COMMIT');
      }

      return content;
    } catch (error) {
      if (client.query !== this.db.query) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      if (client.release) {
        client.release();
      }
    }
  }

  async updateContent(
    contentId: string,
    updates: Partial<Pick<Content, 'title' | 'description' | 'baseContent' | 'adaptedContent'>>,
    tenantContext: TenantContext
  ): Promise<Content> {
    const now = new Date();
    
    // First, create a version history entry
    await this.createContentVersion(contentId, tenantContext);

    const client = this.db.connect ? await this.db.connect() : this.db as DatabaseClient;
    try {
      const setParts: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updates.title !== undefined) {
        setParts.push(`title = ?`);
        values.push(updates.title);
        paramIndex++;
      }
      if (updates.description !== undefined) {
        setParts.push(`description = ?`);
        values.push(updates.description);
        paramIndex++;
      }
      if (updates.baseContent !== undefined) {
        setParts.push(`base_content = ?`);
        values.push(JSON.stringify(updates.baseContent));
        paramIndex++;
      }
      if (updates.adaptedContent !== undefined) {
        setParts.push(`adapted_content = ?`);
        values.push(JSON.stringify(updates.adaptedContent));
        paramIndex++;
      }

      if (setParts.length === 0) {
        throw new Error('No valid updates provided');
      }

      setParts.push(`updated_at = ?`);
      values.push(now.toISOString());
      values.push(contentId);
      values.push(tenantContext.tenantId);

      const query = `
        UPDATE content 
        SET ${setParts.join(', ')}
        WHERE id = ? AND tenant_id = ?
      `;

      await client.query(query, values);

      // Return updated content
      return await this.getContent(contentId, tenantContext);
    } finally {
      if (client.release) {
        client.release();
      }
    }
  }

  async getContent(contentId: string, tenantContext: TenantContext): Promise<Content> {
    const result = await this.db.query(`
      SELECT 
        id, briefing_id, title, description, content_type,
        base_content, adapted_content, workflow_id, tenant_id,
        client_id, created_by, created_at, updated_at
      FROM content
      WHERE id = ? AND tenant_id = ?
    `, [contentId, tenantContext.tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Content not found');
    }

    const row = result.rows[0];
    return {
      id: row.id,
      briefingId: row.briefing_id,
      title: row.title,
      description: row.description,
      contentType: row.content_type,
      baseContent: JSON.parse(row.base_content),
      adaptedContent: JSON.parse(row.adapted_content),
      workflowId: row.workflow_id,
      tenantId: row.tenant_id,
      clientId: row.client_id,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  async listContent(
    tenantContext: TenantContext,
    filters?: {
      briefingId?: string;
      contentType?: string;
      clientId?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<Content[]> {
    let query = `
      SELECT 
        id, briefing_id, title, description, content_type,
        base_content, adapted_content, workflow_id, tenant_id,
        client_id, created_by, created_at, updated_at
      FROM content
      WHERE tenant_id = ?
    `;
    const params: any[] = [tenantContext.tenantId];
    let paramIndex = 2;

    if (filters?.briefingId) {
      query += ` AND briefing_id = ?`;
      params.push(filters.briefingId);
      paramIndex++;
    }
    if (filters?.contentType) {
      query += ` AND content_type = ?`;
      params.push(filters.contentType);
      paramIndex++;
    }
    if (filters?.clientId) {
      query += ` AND client_id = ?`;
      params.push(filters.clientId);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC`;

    if (filters?.limit) {
      query += ` LIMIT ?`;
      params.push(filters.limit);
      if (filters?.offset) {
        query += ` OFFSET ?`;
        params.push(filters.offset);
      }
    }

    const result = await this.db.query(query, params);

    return result.rows.map(row => ({
      id: row.id,
      briefingId: row.briefing_id,
      title: row.title,
      description: row.description,
      contentType: row.content_type,
      baseContent: JSON.parse(row.base_content),
      adaptedContent: JSON.parse(row.adapted_content),
      workflowId: row.workflow_id,
      tenantId: row.tenant_id,
      clientId: row.client_id,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }

  async deleteContent(contentId: string, tenantContext: TenantContext): Promise<void> {
    const client = this.db.connect ? await this.db.connect() : this.db as DatabaseClient;
    try {
      if (client.query !== this.db.query) {
        await client.query('BEGIN');
      }

      // Delete content (workflow will be deleted by cascade)
      const result = await client.query(`
        DELETE FROM content 
        WHERE id = ? AND tenant_id = ?
      `, [contentId, tenantContext.tenantId]);

      if (result.rowCount === 0) {
        throw new Error('Content not found');
      }

      if (client.query !== this.db.query) {
        await client.query('COMMIT');
      }
    } catch (error) {
      if (client.query !== this.db.query) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      if (client.release) {
        client.release();
      }
    }
  }

  private async validateBriefingAssociation(
    briefingId: string, 
    tenantContext: TenantContext
  ): Promise<Briefing | null> {
    try {
      const briefing = await this.briefingService.getBriefing(briefingId, tenantContext);
      return briefing && briefing.status === 'active' ? briefing : null;
    } catch (error) {
      return null;
    }
  }

  private async createContentVersion(contentId: string, tenantContext: TenantContext): Promise<void> {
    // Get current content
    const currentContent = await this.getContent(contentId, tenantContext);
    
    // Create version entry in content_versions table (we'll need to create this table)
    const versionId = uuidv4();
    const now = new Date();

    await this.db.query(`
      INSERT INTO content_versions (
        id, content_id, version_data, tenant_id, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
      versionId,
      contentId,
      JSON.stringify({
        title: currentContent.title,
        description: currentContent.description,
        baseContent: currentContent.baseContent,
        adaptedContent: currentContent.adaptedContent
      }),
      tenantContext.tenantId,
      tenantContext.user.id,
      now.toISOString()
    ]);
  }

  async getContentVersions(contentId: string, tenantContext: TenantContext): Promise<any[]> {
    const result = await this.db.query(`
      SELECT id, content_id, version_data, created_by, created_at
      FROM content_versions
      WHERE content_id = ? AND tenant_id = ?
      ORDER BY created_at DESC
    `, [contentId, tenantContext.tenantId]);

    return result.rows.map(row => ({
      id: row.id,
      contentId: row.content_id,
      versionData: JSON.parse(row.version_data),
      createdBy: row.created_by,
      createdAt: new Date(row.created_at)
    }));
  }
}