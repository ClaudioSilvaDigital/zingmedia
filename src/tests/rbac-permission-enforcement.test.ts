import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { TestDatabaseManager } from '../config/test-database';
import { TenantConfig, Tenant, Role, Permission } from '../types';

// Test-specific RBAC service that uses SQLite
class TestRBACService {
  constructor(private db: TestDatabaseManager) {}

  async createRole(tenantId: string, name: string, permissions: Permission[]): Promise<Role> {
    const roleId = uuidv4();
    const role: Role = {
      id: roleId,
      name,
      permissions,
      tenantId
    };

    try {
      await this.db.query(`
        INSERT INTO roles (id, name, permissions, tenant_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `, [roleId, name, JSON.stringify(permissions), tenantId]);

      return role;
    } catch (error) {
      console.error('Error creating role:', error);
      throw new Error('Failed to create role');
    }
  }

  async assignRole(userId: string, tenantId: string, roleId: string): Promise<void> {
    try {
      // Get role
      const roleResult = await this.db.query(
        'SELECT * FROM roles WHERE id = ? AND tenant_id = ?',
        [roleId, tenantId]
      );

      if (roleResult.rows.length === 0) {
        throw new Error('Role not found');
      }

      const role = roleResult.rows[0];
      const tablePrefix = `tenant_${tenantId.replace(/-/g, '_')}`;

      // Get user's current roles
      const userResult = await this.db.query(
        `SELECT roles FROM ${tablePrefix}_users WHERE id = ?`,
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const currentRoles = JSON.parse(userResult.rows[0].roles || '[]');
      
      // Check if role is already assigned
      const hasRole = currentRoles.some((r: Role) => r.id === roleId);
      if (hasRole) {
        return;
      }

      // Add new role
      const updatedRoles = [...currentRoles, {
        id: role.id,
        name: role.name,
        permissions: JSON.parse(role.permissions),
        tenantId: role.tenant_id
      }];

      await this.db.query(
        `UPDATE ${tablePrefix}_users SET roles = ? WHERE id = ?`,
        [JSON.stringify(updatedRoles), userId]
      );
    } catch (error) {
      console.error('Error assigning role:', error);
      throw new Error('Failed to assign role');
    }
  }

  async checkPermission(userId: string, tenantId: string, resource: string, action: string): Promise<boolean> {
    try {
      const tablePrefix = `tenant_${tenantId.replace(/-/g, '_')}`;
      const userResult = await this.db.query(
        `SELECT roles, permissions FROM ${tablePrefix}_users WHERE id = ? AND is_active = 1`,
        [userId]
      );

      if (userResult.rows.length === 0) {
        return false;
      }

      const user = userResult.rows[0];
      const userPermissions = JSON.parse(user.permissions || '[]');
      const userRoles = JSON.parse(user.roles || '[]');

      // Check direct permissions
      const hasDirectPermission = userPermissions.some((p: Permission) =>
        p.resource === resource && p.action === action
      );

      if (hasDirectPermission) {
        return true;
      }

      // Check role-based permissions
      const hasRolePermission = userRoles.some((role: Role) =>
        role.permissions.some((p: Permission) =>
          p.resource === resource && p.action === action
        )
      );

      return hasRolePermission;
    } catch (error) {
      console.error('Permission check error:', error);
      return false;
    }
  }
}

// Test-specific tenant manager that uses SQLite
class TestTenantManager {
  constructor(private db: TestDatabaseManager) {}

  async createTenant(config: TenantConfig): Promise<Tenant> {
    const tenantId = uuidv4();
    
    try {
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

// Feature: content-automation-platform, Property 6: Permission Enforcement
// For any user action and resource, the system should only allow the action if the user has the required permissions for that resource within their tenant scope

describe('RBAC Permission Enforcement Property Tests', () => {
  let testTenants: Tenant[] = [];
  let testDb: TestDatabaseManager;
  let testTenantManager: TestTenantManager;
  let testRBACService: TestRBACService;

  beforeAll(async () => {
    testDb = new TestDatabaseManager();
    testTenantManager = new TestTenantManager(testDb);
    testRBACService = new TestRBACService(testDb);
    
    // Initialize roles table
    await testDb.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        permissions TEXT DEFAULT '[]',
        tenant_id TEXT NOT NULL,
        created_at DATETIME DEFAULT (datetime('now')),
        updated_at DATETIME DEFAULT (datetime('now'))
      )
    `);
    
    await testDb.query('SELECT 1');
  });

  afterAll(async () => {
    for (const tenant of testTenants) {
      try {
        await testDb.dropTenantTables(tenant.id);
        await testDb.query('DELETE FROM tenants WHERE id = ?', [tenant.id]);
        await testDb.query('DELETE FROM roles WHERE tenant_id = ?', [tenant.id]);
      } catch (error) {
        console.warn(`Failed to cleanup tenant ${tenant.id}:`, error);
      }
    }
    testTenants = [];
    await testDb.close();
  });

  beforeEach(() => {
    testTenants = [];
  });

  it('Property 6: Permission Enforcement - should only allow actions when user has required permissions', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate tenant configuration
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
        // Generate user data
        fc.record({
          email: fc.emailAddress(),
          name: fc.string({ minLength: 1, maxLength: 100 }),
          password: fc.string({ minLength: 8, maxLength: 50 })
        }),
        // Generate permissions to test
        fc.array(
          fc.record({
            resource: fc.constantFrom('content', 'briefings', 'users', 'analytics', 'calendar'),
            action: fc.constantFrom('create', 'read', 'update', 'delete', 'approve')
          }),
          { minLength: 1, maxLength: 5 }
        ),
        // Generate permissions user should have
        fc.array(
          fc.record({
            resource: fc.constantFrom('content', 'briefings', 'users', 'analytics', 'calendar'),
            action: fc.constantFrom('create', 'read', 'update', 'delete', 'approve')
          }),
          { minLength: 0, maxLength: 3 }
        ),
        async (tenantConfig, userConfig, testPermissions, userPermissions) => {
          let tenant: Tenant | null = null;
          let userId: string | null = null;
          let roleId: string | null = null;
          
          try {
            // Create tenant
            tenant = await testTenantManager.createTenant(tenantConfig as TenantConfig);
            testTenants.push(tenant);

            // Create role with user permissions
            const permissionsWithIds = userPermissions.map(p => ({
              id: uuidv4(),
              name: `${p.action}_${p.resource}`,
              resource: p.resource,
              action: p.action
            }));

            const role = await testRBACService.createRole(
              tenant.id,
              'Test Role',
              permissionsWithIds
            );
            roleId = role.id;

            // Create user
            const tablePrefix = `tenant_${tenant.id.replace(/-/g, '_')}`;
            userId = uuidv4();
            
            await testDb.query(`
              INSERT INTO ${tablePrefix}_users (id, email, name, password_hash, tenant_id, is_active)
              VALUES (?, ?, ?, ?, ?, ?)
            `, [
              userId,
              userConfig.email,
              userConfig.name,
              'hashed_password',
              tenant.id,
              1
            ]);

            // Assign role to user
            await testRBACService.assignRole(userId, tenant.id, roleId);

            // Test each permission
            for (const testPermission of testPermissions) {
              const hasPermission = await testRBACService.checkPermission(
                userId,
                tenant.id,
                testPermission.resource,
                testPermission.action
              );

              // Check if user should have this permission
              const shouldHavePermission = userPermissions.some(p =>
                p.resource === testPermission.resource && p.action === testPermission.action
              );

              // Verify permission enforcement matches expected result
              expect(hasPermission).toBe(shouldHavePermission);
            }

          } finally {
            // Cleanup
            if (tenant && userId) {
              try {
                await testDb.dropTenantTables(tenant.id);
                await testDb.query('DELETE FROM tenants WHERE id = ?', [tenant.id]);
                if (roleId) {
                  await testDb.query('DELETE FROM roles WHERE id = ?', [roleId]);
                }
              } catch (error) {
                console.warn(`Failed to cleanup:`, error);
              }
            }
          }
        }
      ),
      { numRuns: 10, timeout: 30000 }
    );
  });

  it('Property 6: Permission Enforcement - should deny access when user lacks required permissions', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate tenant configuration
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
        // Generate user data
        fc.record({
          email: fc.emailAddress(),
          name: fc.string({ minLength: 1, maxLength: 100 }),
          password: fc.string({ minLength: 8, maxLength: 50 })
        }),
        // Generate restricted permissions (user should NOT have these)
        fc.array(
          fc.record({
            resource: fc.constantFrom('content', 'briefings', 'users', 'analytics', 'calendar'),
            action: fc.constantFrom('create', 'read', 'update', 'delete', 'approve')
          }),
          { minLength: 1, maxLength: 3 }
        ),
        async (tenantConfig, userConfig, restrictedPermissions) => {
          let tenant: Tenant | null = null;
          let userId: string | null = null;
          
          try {
            // Create tenant
            tenant = await testTenantManager.createTenant(tenantConfig as TenantConfig);
            testTenants.push(tenant);

            // Create user WITHOUT any roles or permissions
            const tablePrefix = `tenant_${tenant.id.replace(/-/g, '_')}`;
            userId = uuidv4();
            
            await testDb.query(`
              INSERT INTO ${tablePrefix}_users (id, email, name, password_hash, tenant_id, is_active, roles, permissions)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              userId,
              userConfig.email,
              userConfig.name,
              'hashed_password',
              tenant.id,
              1,
              '[]', // No roles
              '[]'  // No permissions
            ]);

            // Test that user is denied access to all restricted permissions
            for (const restrictedPermission of restrictedPermissions) {
              const hasPermission = await testRBACService.checkPermission(
                userId,
                tenant.id,
                restrictedPermission.resource,
                restrictedPermission.action
              );

              // User should NOT have any of these permissions
              expect(hasPermission).toBe(false);
            }

          } finally {
            // Cleanup
            if (tenant) {
              try {
                await testDb.dropTenantTables(tenant.id);
                await testDb.query('DELETE FROM tenants WHERE id = ?', [tenant.id]);
              } catch (error) {
                console.warn(`Failed to cleanup:`, error);
              }
            }
          }
        }
      ),
      { numRuns: 5, timeout: 30000 }
    );
  });

  it('Property 6: Permission Enforcement - should isolate permissions between different tenants', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate two tenant configurations
        fc.tuple(
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
          })
        ),
        // Generate user data for both tenants
        fc.tuple(
          fc.record({
            email: fc.emailAddress(),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            password: fc.string({ minLength: 8, maxLength: 50 })
          }),
          fc.record({
            email: fc.emailAddress(),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            password: fc.string({ minLength: 8, maxLength: 50 })
          })
        ),
        // Generate permissions
        fc.array(
          fc.record({
            resource: fc.constantFrom('content', 'briefings', 'users', 'analytics', 'calendar'),
            action: fc.constantFrom('create', 'read', 'update', 'delete', 'approve')
          }),
          { minLength: 1, maxLength: 3 }
        ),
        async ([tenant1Config, tenant2Config], [user1Config, user2Config], permissions) => {
          let tenant1: Tenant | null = null;
          let tenant2: Tenant | null = null;
          let user1Id: string | null = null;
          let user2Id: string | null = null;
          let role1Id: string | null = null;
          
          try {
            // Create two tenants
            tenant1 = await testTenantManager.createTenant(tenant1Config as TenantConfig);
            tenant2 = await testTenantManager.createTenant(tenant2Config as TenantConfig);
            testTenants.push(tenant1, tenant2);

            // Create role with permissions in tenant1 only
            const permissionsWithIds = permissions.map(p => ({
              id: uuidv4(),
              name: `${p.action}_${p.resource}`,
              resource: p.resource,
              action: p.action
            }));

            const role1 = await testRBACService.createRole(
              tenant1.id,
              'Test Role',
              permissionsWithIds
            );
            role1Id = role1.id;

            // Create users in both tenants
            const table1Prefix = `tenant_${tenant1.id.replace(/-/g, '_')}`;
            const table2Prefix = `tenant_${tenant2.id.replace(/-/g, '_')}`;
            
            user1Id = uuidv4();
            user2Id = uuidv4();
            
            await testDb.query(`
              INSERT INTO ${table1Prefix}_users (id, email, name, password_hash, tenant_id, is_active)
              VALUES (?, ?, ?, ?, ?, ?)
            `, [user1Id, user1Config.email, user1Config.name, 'hashed_password', tenant1.id, 1]);

            await testDb.query(`
              INSERT INTO ${table2Prefix}_users (id, email, name, password_hash, tenant_id, is_active)
              VALUES (?, ?, ?, ?, ?, ?)
            `, [user2Id, user2Config.email, user2Config.name, 'hashed_password', tenant2.id, 1]);

            // Assign role to user1 only
            await testRBACService.assignRole(user1Id, tenant1.id, role1Id);

            // Test permissions
            for (const permission of permissions) {
              // User1 should have permissions in tenant1
              const user1HasPermission = await testRBACService.checkPermission(
                user1Id,
                tenant1.id,
                permission.resource,
                permission.action
              );
              expect(user1HasPermission).toBe(true);

              // User2 should NOT have permissions in tenant2 (no role assigned)
              const user2HasPermission = await testRBACService.checkPermission(
                user2Id,
                tenant2.id,
                permission.resource,
                permission.action
              );
              expect(user2HasPermission).toBe(false);

              // User1 should NOT have permissions in tenant2 (different tenant)
              const user1InTenant2 = await testRBACService.checkPermission(
                user1Id,
                tenant2.id,
                permission.resource,
                permission.action
              );
              expect(user1InTenant2).toBe(false);
            }

          } finally {
            // Cleanup
            if (tenant1) {
              try {
                await testDb.dropTenantTables(tenant1.id);
                await testDb.query('DELETE FROM tenants WHERE id = ?', [tenant1.id]);
                if (role1Id) {
                  await testDb.query('DELETE FROM roles WHERE id = ?', [role1Id]);
                }
              } catch (error) {
                console.warn(`Failed to cleanup tenant1:`, error);
              }
            }
            
            if (tenant2) {
              try {
                await testDb.dropTenantTables(tenant2.id);
                await testDb.query('DELETE FROM tenants WHERE id = ?', [tenant2.id]);
              } catch (error) {
                console.warn(`Failed to cleanup tenant2:`, error);
              }
            }
          }
        }
      ),
      { numRuns: 5, timeout: 30000 }
    );
  });
});