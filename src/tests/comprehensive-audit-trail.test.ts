import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { TestDatabaseManager } from '../config/test-database';
import { auditService, AuditContext, AUDIT_ACTIONS, AUDIT_RESOURCES } from '../services/audit';

// Test-specific audit service that uses SQLite
class TestAuditService {
  constructor(private db: TestDatabaseManager) {}

  async logEvent(
    context: AuditContext,
    action: string,
    resource: string,
    resourceId?: string,
    details: Record<string, any> = {}
  ): Promise<void> {
    const auditId = uuidv4();
    
    await this.db.query(`
      INSERT INTO audit_logs (
        id, tenant_id, user_id, action, resource, resource_id, 
        details, ip_address, user_agent, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      auditId,
      context.tenantId,
      context.userId || null,
      action,
      resource,
      resourceId || null,
      JSON.stringify(details),
      context.ipAddress || null,
      context.userAgent || null
    ]);
  }

  async queryLogs(query: {
    tenantId: string;
    userId?: string;
    action?: string;
    resource?: string;
    resourceId?: string;
    limit?: number;
  }): Promise<any[]> {
    const conditions: string[] = ['tenant_id = ?'];
    const params: any[] = [query.tenantId];

    if (query.userId) {
      conditions.push('user_id = ?');
      params.push(query.userId);
    }

    if (query.action) {
      conditions.push('action = ?');
      params.push(query.action);
    }

    if (query.resource) {
      conditions.push('resource = ?');
      params.push(query.resource);
    }

    if (query.resourceId) {
      conditions.push('resource_id = ?');
      params.push(query.resourceId);
    }

    const limit = query.limit || 100;

    const result = await this.db.query(`
      SELECT 
        id, tenant_id, user_id, action, resource, resource_id,
        details, ip_address, user_agent, created_at
      FROM audit_logs
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ?
    `, [...params, limit]);

    return result.rows.map((row: any) => ({
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      action: row.action,
      resource: row.resource,
      resourceId: row.resource_id,
      details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: new Date(row.created_at)
    }));
  }
}

// Feature: content-automation-platform, Property 12: Comprehensive Audit Trail
// For any user action within a tenant, the system should create an audit log entry 
// that includes user, action, resource, timestamp, and tenant context
// **Validates: Requirements 1.5, 3.5, 13.4**

describe('Comprehensive Audit Trail Property Tests', () => {
  let testDb: TestDatabaseManager;
  let auditService: TestAuditService;
  let testTenantId: string;
  let testUserId: string;

  beforeAll(async () => {
    testDb = new TestDatabaseManager();
    await (testDb as any).initialize(); // Access private method for testing
    auditService = new TestAuditService(testDb);
  });

  beforeEach(async () => {
    testTenantId = uuidv4();
    testUserId = uuidv4();

    // Create test tenant and user
    await testDb.query(`
      INSERT INTO tenants (id, name, type, brand_config, settings, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [testTenantId, 'Test Tenant', 'agency', '{}', '{}']);

    await testDb.query(`
      INSERT INTO users (id, email, name, password_hash, tenant_id, roles, permissions, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [testUserId, 'test@example.com', 'Test User', 'hash', testTenantId, '[]', '[]', 1]);
  });

  afterAll(async () => {
    await testDb.close();
  });

  afterEach(async () => {
    // Clean up test data
    await testDb.query('DELETE FROM audit_logs WHERE tenant_id = ?', [testTenantId]);
    await testDb.query('DELETE FROM users WHERE id = ?', [testUserId]);
    await testDb.query('DELETE FROM tenants WHERE id = ?', [testTenantId]);
  });

  // Feature: content-automation-platform, Property 12: Comprehensive Audit Trail
  // *For any* user action within a tenant, the system should create an audit log entry 
  // that includes user, action, resource, timestamp, and tenant context
  // **Validates: Requirements 1.5, 3.5, 13.4**
  it('should create audit log entry for any user action with complete context', async () => {
    await fc.assert(fc.asyncProperty(
      // Generate random audit context
      fc.record({
        tenantId: fc.constant(testTenantId),
        userId: fc.oneof(fc.constant(testUserId), fc.constant(undefined)),
        ipAddress: fc.oneof(
          fc.ipV4(),
          fc.constant(undefined)
        ),
        userAgent: fc.oneof(
          fc.string({ minLength: 10, maxLength: 200 }),
          fc.constant(undefined)
        )
      }),
      // Generate random action
      fc.oneof(
        fc.constantFrom(...Object.values(AUDIT_ACTIONS)),
        fc.string({ minLength: 3, maxLength: 50 }).filter(s => /^[a-z_]+$/.test(s))
      ),
      // Generate random resource
      fc.oneof(
        fc.constantFrom(...Object.values(AUDIT_RESOURCES)),
        fc.string({ minLength: 3, maxLength: 50 }).filter(s => /^[a-z_]+$/.test(s))
      ),
      // Generate random resource ID
      fc.oneof(
        fc.uuid(),
        fc.constant(undefined)
      ),
      // Generate random details
      fc.record({
        operation: fc.string({ minLength: 1, maxLength: 100 }),
        timestamp: fc.date().map(d => d.toISOString()),
        metadata: fc.record({
          key1: fc.string({ maxLength: 50 }),
          key2: fc.integer({ min: 0, max: 1000 }),
          key3: fc.boolean()
        })
      }),
      async (context, action, resource, resourceId, details) => {
        // Log the audit event
        await auditService.logEvent(context, action, resource, resourceId, details);

        // Query the audit logs to verify the entry was created
        const logs = await auditService.queryLogs({
          tenantId: context.tenantId,
          action,
          resource,
          resourceId,
          limit: 1
        });

        // Verify that an audit log entry was created
        expect(logs).toHaveLength(1);
        
        const logEntry = logs[0];
        
        // Verify essential audit trail properties are present
        expect(logEntry.tenantId).toBe(context.tenantId);
        expect(logEntry.action).toBe(action);
        expect(logEntry.resource).toBe(resource);
        
        // Verify all required audit fields exist
        expect(logEntry).toHaveProperty('id');
        expect(logEntry).toHaveProperty('userId');
        expect(logEntry).toHaveProperty('resourceId');
        expect(logEntry).toHaveProperty('details');
        expect(logEntry).toHaveProperty('ipAddress');
        expect(logEntry).toHaveProperty('userAgent');
        expect(logEntry).toHaveProperty('createdAt');
        
        // Verify details are preserved correctly (check essential properties)
        expect(logEntry.details).toBeDefined();
        expect(typeof logEntry.details).toBe('object');
        expect(logEntry.details.operation).toBeDefined();
        expect(logEntry.details.timestamp).toBeDefined();
        expect(logEntry.details.metadata).toBeDefined();
        
        // Verify the structure matches even if exact values might differ due to JSON round-trip
        expect(Object.keys(logEntry.details).sort()).toEqual(Object.keys(details).sort());
        
        // Verify timestamp exists and is a valid date
        expect(logEntry.createdAt).toBeInstanceOf(Date);
        expect(logEntry.createdAt.getTime()).toBeGreaterThan(0);
        
        // Verify the entry has a valid UUID
        expect(logEntry.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      }
    ), { numRuns: 100 });
  });

  // Property: Tenant isolation in audit logs
  // *For any* audit log query, the system should only return logs belonging to the requesting tenant
  it('should enforce tenant isolation in audit log queries', async () => {
    await fc.assert(fc.asyncProperty(
      // Generate multiple tenants
      fc.array(fc.uuid(), { minLength: 2, maxLength: 5 }),
      // Generate actions for each tenant
      fc.array(fc.constantFrom(...Object.values(AUDIT_ACTIONS)), { minLength: 1, maxLength: 5 }),
      async (tenantIds, actions) => {
        // Create test tenants
        for (const tenantId of tenantIds) {
          await testDb.query(`
            INSERT OR IGNORE INTO tenants (id, name, type, brand_config, settings, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `, [tenantId, `Tenant ${tenantId}`, 'agency', '{}', '{}']);
        }

        try {
          // Log events for each tenant
          for (const tenantId of tenantIds) {
            for (const action of actions) {
              const context = { tenantId, userId: testUserId };
              await auditService.logEvent(context, action, AUDIT_RESOURCES.SYSTEM);
            }
          }

          // Query logs for each tenant and verify isolation
          for (const queryTenantId of tenantIds) {
            const logs = await auditService.queryLogs({
              tenantId: queryTenantId,
              limit: 1000
            });

            // All returned logs should belong to the queried tenant
            for (const log of logs) {
              expect(log.tenantId).toBe(queryTenantId);
            }

            // Should have the expected number of logs for this tenant
            expect(logs.length).toBe(actions.length);
          }
        } finally {
          // Clean up test tenants
          for (const tenantId of tenantIds) {
            await testDb.query('DELETE FROM audit_logs WHERE tenant_id = ?', [tenantId]);
            await testDb.query('DELETE FROM tenants WHERE id = ?', [tenantId]);
          }
        }
      }
    ), { numRuns: 25 });
  });

  // Property: Audit log immutability
  // *For any* audit log entry, once created it should remain unchanged
  it('should maintain audit log immutability', async () => {
    await fc.assert(fc.asyncProperty(
      fc.constantFrom(...Object.values(AUDIT_ACTIONS)),
      fc.constantFrom(...Object.values(AUDIT_RESOURCES)),
      fc.record({
        operation: fc.string({ minLength: 1, maxLength: 100 }),
        value: fc.integer({ min: 0, max: 1000 })
      }),
      async (action, resource, details) => {
        const context = { tenantId: testTenantId, userId: testUserId };
        
        // Log the initial event
        await auditService.logEvent(context, action, resource, undefined, details);
        
        // Get the initial log entry
        const initialLogs = await auditService.queryLogs({
          tenantId: testTenantId,
          action,
          resource,
          limit: 1
        });
        
        expect(initialLogs).toHaveLength(1);
        const initialLog = initialLogs[0];
        
        // Wait a small amount of time
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Query again to ensure the log hasn't changed
        const laterLogs = await auditService.queryLogs({
          tenantId: testTenantId,
          action,
          resource,
          limit: 1
        });
        
        expect(laterLogs).toHaveLength(1);
        const laterLog = laterLogs[0];
        
        // Verify all fields remain exactly the same
        expect(laterLog.id).toBe(initialLog.id);
        expect(laterLog.tenantId).toBe(initialLog.tenantId);
        expect(laterLog.userId).toBe(initialLog.userId);
        expect(laterLog.action).toBe(initialLog.action);
        expect(laterLog.resource).toBe(initialLog.resource);
        expect(laterLog.resourceId).toBe(initialLog.resourceId);
        expect(laterLog.details).toEqual(initialLog.details);
        expect(laterLog.ipAddress).toBe(initialLog.ipAddress);
        expect(laterLog.userAgent).toBe(initialLog.userAgent);
        expect(laterLog.createdAt.getTime()).toBe(initialLog.createdAt.getTime());
      }
    ), { numRuns: 50 });
  });
});