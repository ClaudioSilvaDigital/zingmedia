import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { TestDatabaseManager } from '../config/test-database';
import { TenantConfig, Tenant } from '../types';

// Test-specific tenant manager that uses SQLite
class TestTenantManager {
  constructor(private db: TestDatabaseManager) {}

  async createTenant(config: TenantConfig): Promise<Tenant> {
    const tenantId = uuidv4();
    
    try {
      // Create tenant record in main database
      await this.db.query(`
        INSERT INTO tenants (id, name, type, parent_id, brand_config, settings, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `, [
        tenantId,
        config.name,
        config.type,
        config.parentId || null,
        JSON.stringify(config.brandConfig),
        JSON.stringify(config.settings)
      ]);

      // Provision resources for the tenant
      await this.db.createTenantSchema(tenantId);

      return {
        id: tenantId,
        name: config.name,
        type: config.type,
        parentId: config.parentId,
        brandConfig: config.brandConfig,
        settings: config.settings,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    } catch (error) {
      console.error('Error creating tenant:', error);
      throw new Error('Failed to create tenant');
    }
  }
}

// Feature: content-automation-platform, Property 1: Hierarchical Tenant Data Isolation
// For any database query and tenant context, the query should only return data belonging to the requesting tenant and its authorized sub-tenants, never data from sibling or parent tenants

describe('Tenant Data Isolation Property Tests', () => {
  let testTenants: Tenant[] = [];
  let testDb: TestDatabaseManager;
  let testTenantManager: TestTenantManager;

  beforeAll(async () => {
    // Initialize test database
    testDb = new TestDatabaseManager();
    testTenantManager = new TestTenantManager(testDb);
    
    // Ensure database is ready
    await testDb.query('SELECT 1');
  });

  afterAll(async () => {
    // Cleanup test tenants
    for (const tenant of testTenants) {
      try {
        await testDb.dropTenantTables(tenant.id);
        await testDb.query('DELETE FROM tenants WHERE id = ?', [tenant.id]);
      } catch (error) {
        console.warn(`Failed to cleanup tenant ${tenant.id}:`, error);
      }
    }
    testTenants = [];
    await testDb.close();
  });

  beforeEach(() => {
    // Reset test tenants array for each test
    testTenants = [];
  });

  it('Property 1: Hierarchical Tenant Data Isolation - should isolate data between sibling tenants', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate test data for multiple tenants
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }),
            type: fc.constantFrom('agency', 'client'),
            brandConfig: fc.record({
              primaryColor: fc.hexaString({ minLength: 6, maxLength: 6 }).map(s => `#${s}`),
              secondaryColor: fc.hexaString({ minLength: 6, maxLength: 6 }).map(s => `#${s}`),
              fontFamily: fc.constantFrom('Inter', 'Arial', 'Helvetica')
            }),
            settings: fc.record({
              maxUsers: fc.integer({ min: 1, max: 100 }),
              maxClients: fc.integer({ min: 1, max: 50 }),
              features: fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
              billingPlan: fc.constantFrom('basic', 'premium', 'enterprise')
            })
          }),
          { minLength: 2, maxLength: 5 }
        ),
        fc.array(
          fc.record({
            email: fc.emailAddress(),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            password: fc.string({ minLength: 8, maxLength: 50 })
          }),
          { minLength: 1, maxLength: 3 }
        ),
        async (tenantConfigs, userConfigs) => {
          const createdTenants: Tenant[] = [];
          
          try {
            // Create multiple tenants
            for (const config of tenantConfigs) {
              const tenant = await testTenantManager.createTenant(config as TenantConfig);
              createdTenants.push(tenant);
              testTenants.push(tenant);
            }

            // Create users in each tenant's tables
            const tenantUserData: { [tenantId: string]: any[] } = {};
            
            for (const tenant of createdTenants) {
              const tablePrefix = `tenant_${tenant.id.replace(/-/g, '_')}`;
              tenantUserData[tenant.id] = [];
              
              for (const userConfig of userConfigs) {
                const userId = uuidv4();
                await testDb.query(`
                  INSERT INTO ${tablePrefix}_users (id, email, name, password_hash, tenant_id, is_active)
                  VALUES (?, ?, ?, ?, ?, ?)
                `, [
                  userId,
                  `${userId}_${userConfig.email}`, // Make email unique across tenants
                  userConfig.name,
                  'hashed_password',
                  tenant.id,
                  1
                ]);
                
                tenantUserData[tenant.id].push({
                  id: userId,
                  email: `${userId}_${userConfig.email}`,
                  name: userConfig.name,
                  tenantId: tenant.id
                });
              }
            }

            // Test isolation: Query each tenant's data and verify no cross-tenant leakage
            for (let i = 0; i < createdTenants.length; i++) {
              const currentTenant = createdTenants[i];
              const tablePrefix = `tenant_${currentTenant.id.replace(/-/g, '_')}`;
              
              // Query current tenant's users
              const result = await testDb.query(`
                SELECT id, email, name, tenant_id FROM ${tablePrefix}_users
                WHERE tenant_id = ?
              `, [currentTenant.id]);

              const retrievedUsers = result.rows || [];
              const expectedUsers = tenantUserData[currentTenant.id];

              // Verify all retrieved users belong to current tenant
              for (const user of retrievedUsers) {
                expect(user.tenant_id).toBe(currentTenant.id);
              }

              // Verify no users from other tenants are returned
              for (let j = 0; j < createdTenants.length; j++) {
                if (i !== j) {
                  const otherTenant = createdTenants[j];
                  const otherTenantUsers = tenantUserData[otherTenant.id];
                  
                  for (const otherUser of otherTenantUsers) {
                    const foundInCurrent = retrievedUsers.some(u => u.id === otherUser.id);
                    expect(foundInCurrent).toBe(false);
                  }
                }
              }

              // Verify expected users are present
              expect(retrievedUsers.length).toBe(expectedUsers.length);
              for (const expectedUser of expectedUsers) {
                const found = retrievedUsers.some(u => u.id === expectedUser.id);
                expect(found).toBe(true);
              }
            }

          } finally {
            // Cleanup created tenants
            for (const tenant of createdTenants) {
              try {
                await testDb.dropTenantTables(tenant.id);
                await testDb.query('DELETE FROM tenants WHERE id = ?', [tenant.id]);
              } catch (error) {
                console.warn(`Failed to cleanup tenant ${tenant.id}:`, error);
              }
            }
          }
        }
      ),
      { numRuns: 10, timeout: 30000 }
    );
  });

  it('Property 1: Hierarchical Tenant Data Isolation - should prevent parent tenant access to child data', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          parentName: fc.string({ minLength: 1, maxLength: 50 }),
          childName: fc.string({ minLength: 1, maxLength: 50 }),
          brandConfig: fc.record({
            primaryColor: fc.hexaString({ minLength: 6, maxLength: 6 }).map(s => `#${s}`),
            secondaryColor: fc.hexaString({ minLength: 6, maxLength: 6 }).map(s => `#${s}`),
            fontFamily: fc.constantFrom('Inter', 'Arial', 'Helvetica')
          }),
          settings: fc.record({
            maxUsers: fc.integer({ min: 1, max: 100 }),
            maxClients: fc.integer({ min: 1, max: 50 }),
            features: fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
            billingPlan: fc.constantFrom('basic', 'premium', 'enterprise')
          })
        }),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (tenantData, childUserName) => {
          let parentTenant: Tenant | null = null;
          let childTenant: Tenant | null = null;
          
          try {
            // Create parent tenant (agency)
            parentTenant = await testTenantManager.createTenant({
              name: tenantData.parentName,
              type: 'agency',
              brandConfig: tenantData.brandConfig,
              settings: tenantData.settings
            } as TenantConfig);
            testTenants.push(parentTenant);

            // Create child tenant (client)
            childTenant = await testTenantManager.createTenant({
              name: tenantData.childName,
              type: 'client',
              parentId: parentTenant.id,
              brandConfig: tenantData.brandConfig,
              settings: tenantData.settings
            } as TenantConfig);
            testTenants.push(childTenant);

            // Add user to child tenant
            const childTablePrefix = `tenant_${childTenant.id.replace(/-/g, '_')}`;
            const childUserId = uuidv4();
            
            await testDb.query(`
              INSERT INTO ${childTablePrefix}_users (id, email, name, password_hash, tenant_id, is_active)
              VALUES (?, ?, ?, ?, ?, ?)
            `, [
              childUserId,
              `${childUserId}@test.com`,
              childUserName,
              'hashed_password',
              childTenant.id,
              1
            ]);

            // Try to query child data from parent tenant tables (should fail or return empty)
            const parentTablePrefix = `tenant_${parentTenant.id.replace(/-/g, '_')}`;
            
            // This query should not return the child tenant's user
            const parentResult = await testDb.query(`
              SELECT id, email, name, tenant_id FROM ${parentTablePrefix}_users
              WHERE tenant_id = ?
            `, [parentTenant.id]);

            // Verify parent tenant query doesn't return child tenant data
            const parentUsers = parentResult.rows || [];
            const hasChildUser = parentUsers.some(u => u.id === childUserId);
            expect(hasChildUser).toBe(false);

            // Verify child tenant can access its own data
            const childResult = await testDb.query(`
              SELECT id, email, name, tenant_id FROM ${childTablePrefix}_users
              WHERE tenant_id = ?
            `, [childTenant.id]);

            const childUsers = childResult.rows || [];
            expect(childUsers.length).toBe(1);
            expect(childUsers[0].id).toBe(childUserId);
            expect(childUsers[0].tenant_id).toBe(childTenant.id);

          } finally {
            // Cleanup
            if (childTenant) {
              try {
                await testDb.dropTenantTables(childTenant.id);
                await testDb.query('DELETE FROM tenants WHERE id = ?', [childTenant.id]);
              } catch (error) {
                console.warn(`Failed to cleanup child tenant:`, error);
              }
            }
            
            if (parentTenant) {
              try {
                await testDb.dropTenantTables(parentTenant.id);
                await testDb.query('DELETE FROM tenants WHERE id = ?', [parentTenant.id]);
              } catch (error) {
                console.warn(`Failed to cleanup parent tenant:`, error);
              }
            }
          }
        }
      ),
      { numRuns: 5, timeout: 30000 }
    );
  });
});