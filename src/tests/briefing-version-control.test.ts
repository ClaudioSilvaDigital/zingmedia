import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDatabaseManager } from '../config/test-database';
import { BriefingService } from '../services/briefing';
import { 
  BriefingTemplate, 
  TenantContext, 
  User, 
  Tenant,
  BriefingField 
} from '../types';
import { v4 as uuidv4 } from 'uuid';

describe('Briefing Version Control Tests', () => {
  let testDb: TestDatabaseManager;
  let briefingService: BriefingService;
  let testTenant: Tenant;
  let testUser: User;
  let testTemplate: BriefingTemplate;
  let tenantContext: TenantContext;

  beforeAll(async () => {
    testDb = new TestDatabaseManager();
    briefingService = new BriefingService(testDb as any);
    
    // Ensure database is ready
    await testDb.query('SELECT 1');
    
    // Create briefing-related tables for testing
    await testDb.query(`
      CREATE TABLE IF NOT EXISTS briefing_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        fields TEXT NOT NULL DEFAULT '[]',
        required_fields TEXT NOT NULL DEFAULT '[]',
        tenant_id TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await testDb.query(`
      CREATE TABLE IF NOT EXISTS briefings (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('internal', 'external')),
        template_id TEXT NOT NULL,
        fields TEXT NOT NULL DEFAULT '{}',
        version INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
        tenant_id TEXT NOT NULL,
        client_id TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await testDb.query(`
      CREATE TABLE IF NOT EXISTS briefing_versions (
        id TEXT PRIMARY KEY,
        briefing_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        fields TEXT NOT NULL DEFAULT '{}',
        changes TEXT NOT NULL DEFAULT '[]',
        tenant_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create test tenant
    const tenantId = uuidv4();
    await testDb.query(`
      INSERT INTO tenants (id, name, type, brand_config, settings, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [
      tenantId,
      'Test Agency',
      'agency',
      JSON.stringify({ primaryColor: '#007bff', secondaryColor: '#6c757d', fontFamily: 'Inter' }),
      JSON.stringify({ maxUsers: 100, maxClients: 50, features: ['all'], billingPlan: 'premium' })
    ]);

    testTenant = {
      id: tenantId,
      name: 'Test Agency',
      type: 'agency',
      brandConfig: { primaryColor: '#007bff', secondaryColor: '#6c757d', fontFamily: 'Inter' },
      settings: { maxUsers: 100, maxClients: 50, features: ['all'], billingPlan: 'premium' },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Create test user
    const userId = uuidv4();
    await testDb.query(`
      INSERT INTO users (id, email, name, password_hash, tenant_id, roles, permissions, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [
      userId,
      'test@example.com',
      'Test User',
      'hashed_password',
      tenantId,
      JSON.stringify([]),
      JSON.stringify([]),
      1
    ]);

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

  afterAll(async () => {
    // Cleanup
    await testDb.query('DELETE FROM briefing_versions WHERE tenant_id = ?', [testTenant.id]);
    await testDb.query('DELETE FROM briefings WHERE tenant_id = ?', [testTenant.id]);
    await testDb.query('DELETE FROM briefing_templates WHERE tenant_id = ?', [testTenant.id]);
    await testDb.query('DELETE FROM users WHERE id = ?', [testUser.id]);
    await testDb.query('DELETE FROM tenants WHERE id = ?', [testTenant.id]);
    await testDb.close();
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

    // Verify initial version was created
    const versions = await briefingService.getBriefingVersions(briefing.id, tenantContext);
    expect(versions.length).toBe(1);
    expect(versions[0].version).toBe(1);
    expect(versions[0].fields).toEqual(JSON.stringify(briefingData.fields));
    expect(versions[0].changes).toEqual(JSON.stringify([])); // Initial version has no changes

    // Cleanup
    await testDb.query('DELETE FROM briefing_versions WHERE briefing_id = ?', [briefing.id]);
    await testDb.query('DELETE FROM briefings WHERE id = ?', [briefing.id]);
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
    expect(latestVersion.fields).toEqual(JSON.stringify(updates.fields));
    expect(JSON.parse(latestVersion.changes).length).toBeGreaterThan(0);

    // Check original version
    const originalVersion = versions[1];
    expect(originalVersion.version).toBe(1);
    expect(originalVersion.fields).toEqual(JSON.stringify(briefingData.fields));

    // Verify changes are tracked correctly
    const changes = JSON.parse(latestVersion.changes);
    const modifiedChanges = changes.filter(c => c.changeType === 'modified');
    const addedChanges = changes.filter(c => c.changeType === 'added');

    expect(modifiedChanges.length).toBe(2); // objective and target_audience
    expect(addedChanges.length).toBe(1); // new_field

    // Cleanup
    await testDb.query('DELETE FROM briefing_versions WHERE briefing_id = ?', [briefing.id]);
    await testDb.query('DELETE FROM briefings WHERE id = ?', [briefing.id]);
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
    
    const removedChanges = JSON.parse(latestVersion.changes).filter(c => c.changeType === 'removed');
    expect(removedChanges.length).toBe(1);
    expect(removedChanges[0].field).toBe('extra_field');
    expect(removedChanges[0].oldValue).toBe('Extra field value');
    expect(removedChanges[0].newValue).toBeNull();

    // Cleanup
    await testDb.query('DELETE FROM briefing_versions WHERE briefing_id = ?', [briefing.id]);
    await testDb.query('DELETE FROM briefings WHERE id = ?', [briefing.id]);
  });
});