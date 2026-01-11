import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { TestDatabaseManager } from '../config/test-database';
import { BriefingService } from '../services/briefing';
import { 
  Briefing, 
  BriefingTemplate, 
  TenantContext, 
  User, 
  Tenant,
  BriefingField 
} from '../types';

// Feature: content-automation-platform, Property 13: Version History Preservation
// For any update to briefings, workflows, or scripts, the system should preserve the previous version and maintain a complete history

describe('Briefing Version History Property Tests', () => {
  let testDb: TestDatabaseManager;
  let briefingService: BriefingService;
  let testTenants: Tenant[] = [];
  let testUsers: User[] = [];
  let testBriefings: Briefing[] = [];
  let testTemplates: BriefingTemplate[] = [];

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
  });

  afterAll(async () => {
    // Cleanup all test data
    for (const briefing of testBriefings) {
      try {
        await testDb.query('DELETE FROM briefings WHERE id = ?', [briefing.id]);
        await testDb.query('DELETE FROM briefing_versions WHERE briefing_id = ?', [briefing.id]);
      } catch (error) {
        console.warn(`Failed to cleanup briefing ${briefing.id}:`, error);
      }
    }

    for (const template of testTemplates) {
      try {
        await testDb.query('DELETE FROM briefing_templates WHERE id = ?', [template.id]);
      } catch (error) {
        console.warn(`Failed to cleanup template ${template.id}:`, error);
      }
    }

    for (const tenant of testTenants) {
      try {
        await testDb.query('DELETE FROM tenants WHERE id = ?', [tenant.id]);
      } catch (error) {
        console.warn(`Failed to cleanup tenant ${tenant.id}:`, error);
      }
    }

    await testDb.close();
  });

  beforeEach(async () => {
    // Cleanup any existing test data
    await testDb.query('DELETE FROM briefing_versions');
    await testDb.query('DELETE FROM briefings');
    await testDb.query('DELETE FROM briefing_templates');
    await testDb.query('DELETE FROM users');
    await testDb.query('DELETE FROM tenants');
    
    // Reset test arrays for each test
    testBriefings = [];
    testTemplates = [];
    testTenants = [];
    testUsers = [];
  });

  it('Property 13: Version History Preservation - should preserve complete history for briefing updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate test data with non-empty strings to avoid edge cases
        fc.record({
          tenantName: fc.string({ minLength: 3, maxLength: 50 }).filter(s => s.trim().length > 0),
          userName: fc.string({ minLength: 3, maxLength: 50 }).filter(s => s.trim().length > 0),
          userEmail: fc.emailAddress(),
          briefingTitle: fc.string({ minLength: 3, maxLength: 100 }).filter(s => s.trim().length > 0),
          initialObjective: fc.string({ minLength: 5, maxLength: 200 }).filter(s => s.trim().length > 0)
        }),
        // Generate a single meaningful update to test version creation
        fc.string({ minLength: 5, maxLength: 200 }).filter(s => s.trim().length > 0),
        async (testData, newObjective) => {
          let tenant: Tenant | null = null;
          let user: User | null = null;
          let briefing: Briefing | null = null;
          let template: BriefingTemplate | null = null;
          
          try {
            // Create test tenant
            const tenantId = uuidv4();
            await testDb.query(`
              INSERT INTO tenants (id, name, type, brand_config, settings, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `, [
              tenantId,
              testData.tenantName.trim(),
              'agency',
              JSON.stringify({ primaryColor: '#007bff', secondaryColor: '#6c757d', fontFamily: 'Inter' }),
              JSON.stringify({ maxUsers: 100, maxClients: 50, features: ['all'], billingPlan: 'premium' })
            ]);

            tenant = {
              id: tenantId,
              name: testData.tenantName.trim(),
              type: 'agency',
              brandConfig: { primaryColor: '#007bff', secondaryColor: '#6c757d', fontFamily: 'Inter' },
              settings: { maxUsers: 100, maxClients: 50, features: ['all'], billingPlan: 'premium' },
              createdAt: new Date(),
              updatedAt: new Date()
            };
            testTenants.push(tenant);

            // Create test user
            const userId = uuidv4();
            const uniqueEmail = `${userId.substring(0, 8)}_${testData.userEmail}`;
            await testDb.query(`
              INSERT INTO users (id, email, name, password_hash, tenant_id, roles, permissions, is_active, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `, [
              userId,
              uniqueEmail,
              testData.userName.trim(),
              'hashed_password',
              tenantId,
              JSON.stringify([]),
              JSON.stringify([]),
              1
            ]);

            user = {
              id: userId,
              email: uniqueEmail,
              name: testData.userName.trim(),
              passwordHash: 'hashed_password',
              tenantId: tenantId,
              roles: [],
              permissions: [],
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date()
            };
            testUsers.push(user);

            const tenantContext: TenantContext = {
              tenantId: tenantId,
              tenant: tenant,
              user: user,
              permissions: []
            };

            // Create template
            const templateId = uuidv4();
            const templateFields: BriefingField[] = [
              {
                id: 'field1',
                name: 'objective',
                label: 'Campaign Objective',
                type: 'text',
                required: true,
                order: 1
              }
            ];

            await testDb.query(`
              INSERT INTO briefing_templates (id, name, description, fields, required_fields, tenant_id, is_active, created_by, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `, [
              templateId,
              'Test Template',
              'Test template for version history',
              JSON.stringify(templateFields),
              JSON.stringify(['objective']),
              tenantId,
              1,
              userId
            ]);

            template = {
              id: templateId,
              name: 'Test Template',
              description: 'Test template for version history',
              fields: templateFields,
              requiredFields: ['objective'],
              tenantId: tenantId,
              isActive: true,
              createdBy: userId,
              createdAt: new Date(),
              updatedAt: new Date()
            };
            testTemplates.push(template);

            // Create initial briefing
            const briefingData = {
              title: testData.briefingTitle.trim(),
              type: 'internal' as const,
              templateId: templateId,
              fields: { 
                objective: testData.initialObjective.trim()
              },
              status: 'draft' as const,
              tenantId: tenantId,
              createdBy: userId
            };

            briefing = await briefingService.createBriefing(briefingData, tenantContext);
            testBriefings.push(briefing);

            // Verify initial state - should have 1 version (initial)
            let versions = await briefingService.getBriefingVersions(briefing.id, tenantContext);
            expect(versions.length).toBe(1);
            expect(briefing.version).toBe(1);

            // Only update if the new objective is different from the initial one
            if (newObjective.trim() !== testData.initialObjective.trim()) {
              // Apply one meaningful update
              briefing = await briefingService.updateBriefing(briefing.id, {
                fields: { 
                  objective: newObjective.trim()
                }
              }, tenantContext);

              // After update, should have 2 versions (initial + update)
              versions = await briefingService.getBriefingVersions(briefing.id, tenantContext);
              
              // Property: Complete history should be preserved
              expect(versions.length).toBe(2);
              expect(briefing.version).toBe(2);

              // Property: Version numbers should be sequential
              const versionNumbers = versions.map(v => v.version).sort((a, b) => a - b);
              expect(versionNumbers).toEqual([1, 2]);

              // Property: Versions should be in correct order (newest first)
              expect(versions[0].version).toBe(2);
              expect(versions[1].version).toBe(1);

              // Property: Current briefing should match latest version
              const latestVersion = versions[0];
              expect(briefing.version).toBe(latestVersion.version);
              const latestFields = JSON.parse(latestVersion.fields);
              expect(briefing.fields).toEqual(latestFields);
              expect(latestFields.objective).toBe(newObjective.trim());

              // Property: Initial version should have no changes
              const initialVersion = versions[1];
              const initialChanges = JSON.parse(initialVersion.changes);
              expect(initialChanges).toEqual([]);

              // Property: Update version should have changes recorded
              const updateChanges = JSON.parse(latestVersion.changes);
              expect(updateChanges.length).toBeGreaterThan(0);
              expect(updateChanges[0].field).toBe('objective');
              expect(updateChanges[0].changeType).toBe('modified');
            } else {
              // If no actual change, should still have only 1 version
              expect(versions.length).toBe(1);
              expect(briefing.version).toBe(1);
            }

            // Property: Each version should have valid metadata
            for (const version of versions) {
              expect(version.briefingId).toBe(briefing.id);
              expect(version.createdBy).toBe(userId);
              expect(version.createdAt).toBeInstanceOf(Date);
              expect(typeof version.fields).toBe('string');
              expect(typeof version.changes).toBe('string');

              // Fields and changes should be valid JSON
              expect(() => JSON.parse(version.fields)).not.toThrow();
              expect(() => JSON.parse(version.changes)).not.toThrow();
            }

          } finally {
            // Cleanup will be handled by afterAll
          }
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });
});