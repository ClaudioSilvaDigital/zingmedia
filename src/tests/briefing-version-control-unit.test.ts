import { describe, it, expect, beforeEach } from 'vitest';
import { BriefingService } from '../services/briefing';
import { 
  Briefing, 
  BriefingTemplate, 
  TenantContext, 
  User, 
  Tenant,
  BriefingField,
  BriefingChange
} from '../types';
import { v4 as uuidv4 } from 'uuid';

// Mock database for unit testing
class MockDatabase {
  private briefings: Map<string, any> = new Map();
  private templates: Map<string, any> = new Map();
  private versions: Map<string, any[]> = new Map();

  async query(sql: string, params: any[]): Promise<{ rows: any[] }> {
    // Simple mock implementation for testing version control logic
    if (sql.includes('INSERT INTO briefings')) {
      const [id, title, type, templateId, fields, version, status, tenantId, clientId, createdBy] = params;
      this.briefings.set(id, {
        id, title, type, template_id: templateId, fields, version, status,
        tenant_id: tenantId, client_id: clientId, created_by: createdBy,
        created_at: new Date(), updated_at: new Date()
      });
      return { rows: [this.briefings.get(id)] };
    }
    
    if (sql.includes('INSERT INTO briefing_templates')) {
      const [id, name, description, fields, requiredFields, tenantId, isActive, createdBy] = params;
      this.templates.set(id, {
        id, name, description, fields, required_fields: requiredFields,
        tenant_id: tenantId, is_active: isActive, created_by: createdBy,
        created_at: new Date(), updated_at: new Date()
      });
      return { rows: [this.templates.get(id)] };
    }
    
    if (sql.includes('INSERT INTO briefing_versions')) {
      const [id, briefingId, version, fields, changes, tenantId, createdBy] = params;
      if (!this.versions.has(briefingId)) {
        this.versions.set(briefingId, []);
      }
      const versionRecord = {
        id, briefing_id: briefingId, version, fields, changes,
        tenant_id: tenantId, created_by: createdBy, created_at: new Date()
      };
      this.versions.get(briefingId)!.push(versionRecord);
      return { rows: [versionRecord] };
    }
    
    if (sql.includes('SELECT * FROM briefings') && sql.includes('WHERE id')) {
      const briefingId = params[0];
      const tenantId = params[1];
      const briefing = this.briefings.get(briefingId);
      if (briefing && briefing.tenant_id === tenantId) {
        return { rows: [briefing] };
      }
      return { rows: [] };
    }
    
    if (sql.includes('SELECT * FROM briefing_templates') && sql.includes('WHERE id')) {
      const templateId = params[0];
      const tenantId = params[1];
      const template = this.templates.get(templateId);
      if (template && template.tenant_id === tenantId && template.is_active) {
        return { rows: [template] };
      }
      return { rows: [] };
    }
    
    if (sql.includes('SELECT * FROM briefing_versions')) {
      const briefingId = params[0];
      const versions = this.versions.get(briefingId) || [];
      return { rows: versions.sort((a, b) => b.version - a.version) };
    }
    
    if (sql.includes('UPDATE briefings')) {
      const briefingId = params[5]; // Based on the query structure
      const tenantId = params[6]; // tenant_id parameter
      const briefing = this.briefings.get(briefingId);
      if (briefing && briefing.tenant_id === tenantId) {
        briefing.title = params[0] || briefing.title;
        briefing.fields = params[1] || briefing.fields;
        briefing.status = params[2] || briefing.status;
        briefing.version = params[3];
        briefing.updated_at = params[4];
        return { rows: [briefing] };
      }
      return { rows: [] };
    }
    
    return { rows: [] };
  }
}

describe('Briefing Version Control Unit Tests', () => {
  let briefingService: BriefingService;
  let mockDb: MockDatabase;
  let testTenant: Tenant;
  let testUser: User;
  let testTemplate: BriefingTemplate;
  let tenantContext: TenantContext;

  beforeEach(async () => {
    mockDb = new MockDatabase();
    briefingService = new BriefingService(mockDb as any);

    // Create test data
    const tenantId = uuidv4();
    const userId = uuidv4();

    testTenant = {
      id: tenantId,
      name: 'Test Agency',
      type: 'agency',
      brandConfig: { primaryColor: '#007bff', secondaryColor: '#6c757d', fontFamily: 'Inter' },
      settings: { maxUsers: 100, maxClients: 50, features: ['all'], billingPlan: 'premium' },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    testUser = {
      id: userId,
      email: 'test@example.com',
      name: 'Test User',
      passwordHash: 'hashed_password',
      tenantId: tenantId,
      roles: [],
      permissions: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    tenantContext = {
      tenantId: tenantId,
      tenant: testTenant,
      user: testUser,
      permissions: []
    };

    // Create test template
    const templateFields: BriefingField[] = [
      {
        id: 'field1',
        name: 'objective',
        label: 'Campaign Objective',
        type: 'text',
        required: true,
        order: 1
      },
      {
        id: 'field2',
        name: 'target_audience',
        label: 'Target Audience',
        type: 'textarea',
        required: false,
        order: 2
      }
    ];

    testTemplate = await briefingService.createBriefingTemplate({
      name: 'Test Template',
      description: 'Test template for version control',
      fields: templateFields,
      requiredFields: ['objective'],
      tenantId: tenantId,
      isActive: true,
      createdBy: userId
    }, tenantContext);
  });

  it('should create initial version when briefing is created', async () => {
    // Create briefing
    const briefingData = {
      title: 'Test Briefing',
      type: 'internal' as const,
      templateId: testTemplate.id,
      tenantId: tenantContext.tenantId,
      fields: { 
        objective: 'Initial campaign objective',
        target_audience: 'Young adults 18-25'
      },
      status: 'draft' as const,
      createdBy: testUser.id
    };

    const briefing = await briefingService.createBriefing(briefingData, tenantContext);

    // Verify briefing was created with version 1
    expect(briefing.version).toBe(1);
    expect(briefing.title).toBe(briefingData.title);
    expect(briefing.fields).toEqual(briefingData.fields);

    // Verify initial version was created
    const versions = await briefingService.getBriefingVersions(briefing.id, tenantContext);
    expect(versions.length).toBe(1);
    expect(versions[0].version).toBe(1);
    expect(JSON.parse(versions[0].fields)).toEqual(briefingData.fields);
    expect(JSON.parse(versions[0].changes)).toEqual([]); // Initial version has no changes
  });

  it('should track version history when briefing is updated', async () => {
    // Create briefing
    const briefingData = {
      title: 'Version Test Briefing',
      type: 'internal' as const,
      templateId: testTemplate.id,
      tenantId: tenantContext.tenantId,
      fields: { 
        objective: 'Original objective',
        target_audience: 'Original audience'
      },
      status: 'draft' as const,
      createdBy: testUser.id
    };

    const briefing = await briefingService.createBriefing(briefingData, tenantContext);

    // Update briefing
    const updates = {
      title: 'Updated Version Test Briefing',
      fields: {
        objective: 'Updated objective',
        target_audience: 'Updated audience',
        new_field: 'New field value'
      }
    };

    const updatedBriefing = await briefingService.updateBriefing(briefing.id, updates, tenantContext);

    // Verify version was incremented
    expect(updatedBriefing.version).toBe(2);
    expect(updatedBriefing.title).toBe(updates.title);
    expect(updatedBriefing.fields).toEqual(updates.fields);

    // Verify version history
    const versions = await briefingService.getBriefingVersions(briefing.id, tenantContext);
    expect(versions.length).toBe(2);

    // Check latest version (should be first due to DESC order)
    const latestVersion = versions[0];
    expect(latestVersion.version).toBe(2);
    expect(JSON.parse(latestVersion.fields)).toEqual(updates.fields);
    
    const changes = JSON.parse(latestVersion.changes);
    expect(changes.length).toBeGreaterThan(0);

    // Check original version
    const originalVersion = versions[1];
    expect(originalVersion.version).toBe(1);
    expect(JSON.parse(originalVersion.fields)).toEqual(briefingData.fields);

    // Verify changes are tracked correctly
    const modifiedChanges = changes.filter((c: BriefingChange) => c.changeType === 'modified');
    const addedChanges = changes.filter((c: BriefingChange) => c.changeType === 'added');

    expect(modifiedChanges.length).toBe(2); // objective and target_audience
    expect(addedChanges.length).toBe(1); // new_field

    // Verify specific changes
    const objectiveChange = modifiedChanges.find((c: BriefingChange) => c.field === 'objective');
    expect(objectiveChange).toBeDefined();
    expect(objectiveChange.oldValue).toBe('Original objective');
    expect(objectiveChange.newValue).toBe('Updated objective');

    const newFieldChange = addedChanges.find((c: BriefingChange) => c.field === 'new_field');
    expect(newFieldChange).toBeDefined();
    expect(newFieldChange.oldValue).toBeNull();
    expect(newFieldChange.newValue).toBe('New field value');
  });

  it('should track field removal in version history', async () => {
    // Create briefing with multiple fields
    const briefingData = {
      title: 'Field Removal Test',
      type: 'internal' as const,
      templateId: testTemplate.id,
      tenantId: tenantContext.tenantId,
      fields: { 
        objective: 'Test objective',
        target_audience: 'Test audience',
        extra_field: 'Extra field value'
      },
      status: 'draft' as const,
      createdBy: testUser.id
    };

    const briefing = await briefingService.createBriefing(briefingData, tenantContext);

    // Update briefing by removing a field
    const updates = {
      fields: {
        objective: 'Updated objective',
        target_audience: 'Updated audience'
        // extra_field removed
      }
    };

    await briefingService.updateBriefing(briefing.id, updates, tenantContext);

    // Verify version history tracks removal
    const versions = await briefingService.getBriefingVersions(briefing.id, tenantContext);
    const latestVersion = versions[0];
    
    const changes = JSON.parse(latestVersion.changes);
    const removedChanges = changes.filter((c: BriefingChange) => c.changeType === 'removed');
    
    expect(removedChanges.length).toBe(1);
    expect(removedChanges[0].field).toBe('extra_field');
    expect(removedChanges[0].oldValue).toBe('Extra field value');
    expect(removedChanges[0].newValue).toBeNull();
  });

  it('should preserve audit trail for briefing changes', async () => {
    // Create briefing
    const briefingData = {
      title: 'Audit Trail Test',
      type: 'internal' as const,
      templateId: testTemplate.id,
      tenantId: tenantContext.tenantId,
      fields: { objective: 'Original objective' },
      status: 'draft' as const,
      createdBy: testUser.id
    };

    const briefing = await briefingService.createBriefing(briefingData, tenantContext);

    // Make multiple updates
    await briefingService.updateBriefing(briefing.id, {
      fields: { objective: 'First update' }
    }, tenantContext);

    await briefingService.updateBriefing(briefing.id, {
      fields: { objective: 'Second update' }
    }, tenantContext);

    await briefingService.updateBriefing(briefing.id, {
      status: 'active' as const
    }, tenantContext);

    // Verify complete version history
    const versions = await briefingService.getBriefingVersions(briefing.id, tenantContext);
    expect(versions.length).toBe(4); // Initial + 3 updates

    // Verify versions are in correct order (newest first)
    expect(versions[0].version).toBe(4);
    expect(versions[1].version).toBe(3);
    expect(versions[2].version).toBe(2);
    expect(versions[3].version).toBe(1);

    // Verify each version has correct tenant and user context
    for (const version of versions) {
      expect(version.tenantId).toBe(tenantContext.tenantId);
      expect(version.createdBy).toBe(testUser.id);
      expect(version.createdAt).toBeInstanceOf(Date);
    }
  });
});