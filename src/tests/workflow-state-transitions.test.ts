import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { TestDatabaseManager } from '../config/test-database';
import { WorkflowEngine } from '../services/workflow';
import { SQLiteAdapter } from '../interfaces/database';
import { 
  WorkflowState, 
  TenantContext, 
  Tenant, 
  User, 
  Permission,
  TenantConfig,
  BrandConfig,
  TenantSettings
} from '../types';

// Feature: content-automation-platform, Property 4: Workflow State Transition Control
// For any content workflow, transitioning to the Publish state should only succeed if all required approvals have been completed

describe('Workflow State Transition Property Tests', () => {
  let testDb: TestDatabaseManager;
  let workflowEngine: WorkflowEngine;
  let testTenants: Tenant[] = [];
  let testUsers: User[] = [];

  beforeAll(async () => {
    testDb = new TestDatabaseManager();
    const dbAdapter = new SQLiteAdapter(testDb);
    workflowEngine = new WorkflowEngine(dbAdapter);
    
    // Ensure database is ready
    await testDb.query('SELECT 1');
  });

  afterAll(async () => {
    // Cleanup test data
    for (const user of testUsers) {
      try {
        await testDb.query('DELETE FROM users WHERE id = ?', [user.id]);
      } catch (error) {
        console.warn(`Failed to cleanup user ${user.id}:`, error);
      }
    }
    
    for (const tenant of testTenants) {
      try {
        await testDb.dropTenantTables(tenant.id);
        await testDb.query('DELETE FROM tenants WHERE id = ?', [tenant.id]);
      } catch (error) {
        console.warn(`Failed to cleanup tenant ${tenant.id}:`, error);
      }
    }
    
    testTenants = [];
    testUsers = [];
    await testDb.close();
  });

  beforeEach(() => {
    // Reset arrays for each test
    testTenants = [];
    testUsers = [];
  });

  async function createTestTenant(config: TenantConfig): Promise<Tenant> {
    const tenantId = uuidv4();
    const now = new Date();
    
    await testDb.query(`
      INSERT INTO tenants (id, name, type, parent_id, brand_config, settings, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      tenantId,
      config.name,
      config.type,
      config.parentId || null,
      JSON.stringify(config.brandConfig),
      JSON.stringify(config.settings),
      now.toISOString(),
      now.toISOString()
    ]);

    await testDb.createTenantSchema(tenantId);

    const tenant: Tenant = {
      id: tenantId,
      name: config.name,
      type: config.type,
      parentId: config.parentId,
      brandConfig: config.brandConfig,
      settings: config.settings,
      createdAt: now,
      updatedAt: now
    };

    testTenants.push(tenant);
    return tenant;
  }

  async function createTestUser(tenant: Tenant, permissions: string[]): Promise<User> {
    const userId = uuidv4();
    const now = new Date();
    
    const permissionObjects: Permission[] = permissions.map(p => ({
      id: uuidv4(),
      name: p,
      resource: 'workflow',
      action: p.split(':')[1] || 'access'
    }));

    await testDb.query(`
      INSERT INTO users (id, email, name, password_hash, tenant_id, roles, permissions, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId,
      `${userId}@test.com`,
      `Test User ${userId.slice(0, 8)}`,
      'hashed_password',
      tenant.id,
      JSON.stringify([]),
      JSON.stringify(permissionObjects),
      1,
      now.toISOString(),
      now.toISOString()
    ]);

    const user: User = {
      id: userId,
      email: `${userId}@test.com`,
      name: `Test User ${userId.slice(0, 8)}`,
      passwordHash: 'hashed_password',
      tenantId: tenant.id,
      roles: [],
      permissions: permissionObjects,
      isActive: true,
      createdAt: now,
      updatedAt: now
    };

    testUsers.push(user);
    return user;
  }

  async function createTestContent(tenant: Tenant, user: User): Promise<string> {
    // First create a briefing template
    const templateId = uuidv4();
    await testDb.query(`
      INSERT INTO briefing_templates (id, name, fields, required_fields, tenant_id, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      templateId,
      'Test Template',
      JSON.stringify([]),
      JSON.stringify([]),
      tenant.id,
      user.id,
      new Date().toISOString(),
      new Date().toISOString()
    ]);

    // Create a briefing
    const briefingId = uuidv4();
    await testDb.query(`
      INSERT INTO briefings (id, title, type, template_id, fields, tenant_id, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      briefingId,
      'Test Briefing',
      'internal',
      templateId,
      JSON.stringify({}),
      tenant.id,
      user.id,
      new Date().toISOString(),
      new Date().toISOString()
    ]);

    // Create content
    const contentId = uuidv4();
    await testDb.query(`
      INSERT INTO content (id, briefing_id, title, description, content_type, base_content, adapted_content, tenant_id, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      contentId,
      briefingId,
      'Test Content',
      'Test Description',
      'text',
      JSON.stringify({ text: 'Test content' }),
      JSON.stringify({}),
      tenant.id,
      user.id,
      new Date().toISOString(),
      new Date().toISOString()
    ]);

    return contentId;
  }

  it('Property 4: Workflow State Transition Control - should prevent PUBLISH transition without approvals', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate tenant configuration
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 50 }),
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
        async (tenantConfig) => {
          let tenant: Tenant | null = null;
          let user: User | null = null;
          let contentId: string | null = null;
          let workflowId: string | null = null;

          try {
            // Create test tenant
            tenant = await createTestTenant({
              name: tenantConfig.name,
              type: 'agency',
              brandConfig: tenantConfig.brandConfig as BrandConfig,
              settings: tenantConfig.settings as TenantSettings
            });

            // Create user with workflow permissions but no publish permission initially
            user = await createTestUser(tenant, ['workflow:transition']);

            // Create tenant context
            const tenantContext: TenantContext = {
              tenantId: tenant.id,
              tenant,
              user,
              permissions: user.permissions
            };

            // Create test content
            contentId = await createTestContent(tenant, user);

            // Create workflow
            const workflow = await workflowEngine.createWorkflow(contentId, tenantContext);
            workflowId = workflow.id;

            // Navigate to APPROVAL state through valid transitions
            const path = [WorkflowState.PLANNING, WorkflowState.CONTENT, WorkflowState.CREATIVE, 
                         WorkflowState.BRAND_APPLY, WorkflowState.COMPLIANCE_CHECK, WorkflowState.APPROVAL];
            
            for (const nextState of path) {
              await workflowEngine.transitionState(workflowId, nextState, tenantContext);
            }

            // Try to transition to PUBLISH without approval - should fail
            // First create a user with publish permission but no approval
            const publishUserNoApproval = await createTestUser(tenant, ['workflow:publish']);
            const publishContextNoApproval: TenantContext = {
              tenantId: tenant.id,
              tenant,
              user: publishUserNoApproval,
              permissions: publishUserNoApproval.permissions
            };

            let publishTransitionFailed = false;
            try {
              await workflowEngine.transitionState(workflowId, WorkflowState.PUBLISH, publishContextNoApproval);
            } catch (error) {
              publishTransitionFailed = true;
              expect(error.message).toContain('Cannot transition to PUBLISH state without required approvals');
            }

            // Verify the transition failed
            expect(publishTransitionFailed).toBe(true);

            // Now create an approval and verify PUBLISH transition succeeds
            const approver = await createTestUser(tenant, ['workflow:approve']);

            // Request approval
            const approval = await workflowEngine.requestApproval(workflowId, [approver.id], tenantContext);

            // Simulate approval response by directly inserting into database
            await testDb.query(`
              INSERT INTO approval_responses (id, approval_id, user_id, decision, created_at)
              VALUES (?, ?, ?, ?, ?)
            `, [uuidv4(), approval.id, approver.id, 'approved', new Date().toISOString()]);

            // Update approval status
            await testDb.query(`
              UPDATE approvals SET status = 'approved', completed_at = ? WHERE id = ?
            `, [new Date().toISOString(), approval.id]);

            // Create user with publish permission
            const publishUser = await createTestUser(tenant, ['workflow:publish']);
            const publishContext: TenantContext = {
              tenantId: tenant.id,
              tenant,
              user: publishUser,
              permissions: publishUser.permissions
            };

            // Now PUBLISH transition should succeed
            let publishTransitionSucceeded = false;
            try {
              await workflowEngine.transitionState(workflowId, WorkflowState.PUBLISH, publishContext);
              publishTransitionSucceeded = true;
            } catch (error) {
              console.error('Unexpected error during publish transition:', error);
            }

            expect(publishTransitionSucceeded).toBe(true);

          } finally {
            // Cleanup
            if (workflowId && contentId) {
              try {
                await testDb.query('DELETE FROM workflow_events WHERE workflow_id = ?', [workflowId]);
                await testDb.query('DELETE FROM workflow_comments WHERE workflow_id = ?', [workflowId]);
                await testDb.query('DELETE FROM approval_responses WHERE approval_id IN (SELECT id FROM approvals WHERE workflow_id = ?)', [workflowId]);
                await testDb.query('DELETE FROM approvals WHERE workflow_id = ?', [workflowId]);
                await testDb.query('DELETE FROM workflows WHERE id = ?', [workflowId]);
                await testDb.query('DELETE FROM content WHERE id = ?', [contentId]);
                await testDb.query('DELETE FROM briefings WHERE id IN (SELECT briefing_id FROM content WHERE id = ?)', [contentId]);
                await testDb.query('DELETE FROM briefing_templates WHERE tenant_id = ?', [tenant?.id]);
              } catch (error) {
                console.warn('Failed to cleanup workflow data:', error);
              }
            }
          }
        }
      ),
      { numRuns: 5, timeout: 30000 }
    );
  });

  it('Property 4: Workflow State Transition Control - should enforce valid state transitions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 50 }),
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
        // Generate valid from-to state pairs based on workflow rules
        fc.constantFrom(
          // Valid transitions from RESEARCH
          { from: WorkflowState.RESEARCH, to: WorkflowState.PLANNING, isValid: true },
          // Valid transitions from PLANNING
          { from: WorkflowState.PLANNING, to: WorkflowState.RESEARCH, isValid: true },
          { from: WorkflowState.PLANNING, to: WorkflowState.CONTENT, isValid: true },
          // Valid transitions from CONTENT
          { from: WorkflowState.CONTENT, to: WorkflowState.PLANNING, isValid: true },
          { from: WorkflowState.CONTENT, to: WorkflowState.CREATIVE, isValid: true },
          // Valid transitions from CREATIVE
          { from: WorkflowState.CREATIVE, to: WorkflowState.CONTENT, isValid: true },
          { from: WorkflowState.CREATIVE, to: WorkflowState.BRAND_APPLY, isValid: true },
          // Valid transitions from BRAND_APPLY
          { from: WorkflowState.BRAND_APPLY, to: WorkflowState.CREATIVE, isValid: true },
          { from: WorkflowState.BRAND_APPLY, to: WorkflowState.COMPLIANCE_CHECK, isValid: true },
          // Valid transitions from COMPLIANCE_CHECK
          { from: WorkflowState.COMPLIANCE_CHECK, to: WorkflowState.BRAND_APPLY, isValid: true },
          { from: WorkflowState.COMPLIANCE_CHECK, to: WorkflowState.APPROVAL, isValid: true },
          // Valid transitions from APPROVAL
          { from: WorkflowState.APPROVAL, to: WorkflowState.COMPLIANCE_CHECK, isValid: true },
          { from: WorkflowState.APPROVAL, to: WorkflowState.PUBLISH, isValid: true },
          // Valid transitions from PUBLISH
          { from: WorkflowState.PUBLISH, to: WorkflowState.MONITOR, isValid: true },
          // Valid transitions from MONITOR
          { from: WorkflowState.MONITOR, to: WorkflowState.RESEARCH, isValid: true },
          { from: WorkflowState.MONITOR, to: WorkflowState.PLANNING, isValid: true },
          { from: WorkflowState.MONITOR, to: WorkflowState.CONTENT, isValid: true },
          // Invalid transitions (examples)
          { from: WorkflowState.RESEARCH, to: WorkflowState.PUBLISH, isValid: false },
          { from: WorkflowState.PLANNING, to: WorkflowState.APPROVAL, isValid: false },
          { from: WorkflowState.CONTENT, to: WorkflowState.MONITOR, isValid: false }
        ),
        async (tenantConfig, transition) => {
          let tenant: Tenant | null = null;
          let user: User | null = null;
          let contentId: string | null = null;
          let workflowId: string | null = null;

          try {
            // Create test tenant
            tenant = await createTestTenant({
              name: tenantConfig.name,
              type: 'agency',
              brandConfig: tenantConfig.brandConfig as BrandConfig,
              settings: tenantConfig.settings as TenantSettings
            });

            // Create user with all workflow permissions
            user = await createTestUser(tenant, ['workflow:transition', 'workflow:publish']);

            const tenantContext: TenantContext = {
              tenantId: tenant.id,
              tenant,
              user,
              permissions: user.permissions
            };

            // Create test content
            contentId = await createTestContent(tenant, user);

            // Create workflow
            const workflow = await workflowEngine.createWorkflow(contentId, tenantContext);
            workflowId = workflow.id;

            // Navigate to the fromState if it's not RESEARCH
            if (transition.from !== WorkflowState.RESEARCH) {
              const pathToFromState = getPathToState(WorkflowState.RESEARCH, transition.from);
              
              for (const nextState of pathToFromState) {
                // Special handling for PUBLISH state - need approval first
                if (nextState === WorkflowState.PUBLISH) {
                  const approver = await createTestUser(tenant, ['workflow:approve']);
                  const approval = await workflowEngine.requestApproval(workflowId, [approver.id], tenantContext);
                  
                  await testDb.query(`
                    INSERT INTO approval_responses (id, approval_id, user_id, decision, created_at)
                    VALUES (?, ?, ?, ?, ?)
                  `, [uuidv4(), approval.id, approver.id, 'approved', new Date().toISOString()]);

                  await testDb.query(`
                    UPDATE approvals SET status = 'approved', completed_at = ? WHERE id = ?
                  `, [new Date().toISOString(), approval.id]);
                }
                
                await workflowEngine.transitionState(workflowId, nextState, tenantContext);
              }
            }

            // Now test the transition from fromState to toState
            let transitionSucceeded = false;
            let transitionError: string | null = null;

            try {
              // Special handling for PUBLISH state - need approval first
              if (transition.to === WorkflowState.PUBLISH && transition.from === WorkflowState.APPROVAL) {
                const approver = await createTestUser(tenant, ['workflow:approve']);
                const approval = await workflowEngine.requestApproval(workflowId, [approver.id], tenantContext);
                
                await testDb.query(`
                  INSERT INTO approval_responses (id, approval_id, user_id, decision, created_at)
                  VALUES (?, ?, ?, ?, ?)
                `, [uuidv4(), approval.id, approver.id, 'approved', new Date().toISOString()]);

                await testDb.query(`
                  UPDATE approvals SET status = 'approved', completed_at = ? WHERE id = ?
                `, [new Date().toISOString(), approval.id]);
              }

              await workflowEngine.transitionState(workflowId, transition.to, tenantContext);
              transitionSucceeded = true;
            } catch (error) {
              transitionError = error.message;
            }

            // Verify the result matches expectations
            if (transition.isValid) {
              expect(transitionSucceeded).toBe(true);
              if (!transitionSucceeded) {
                console.error(`Expected valid transition ${transition.from} -> ${transition.to} to succeed, but got error: ${transitionError}`);
              }
            } else {
              expect(transitionSucceeded).toBe(false);
              expect(transitionError).toContain('Invalid transition');
            }

          } finally {
            // Cleanup
            if (workflowId && contentId) {
              try {
                await testDb.query('DELETE FROM workflow_events WHERE workflow_id = ?', [workflowId]);
                await testDb.query('DELETE FROM workflow_comments WHERE workflow_id = ?', [workflowId]);
                await testDb.query('DELETE FROM approval_responses WHERE approval_id IN (SELECT id FROM approvals WHERE workflow_id = ?)', [workflowId]);
                await testDb.query('DELETE FROM approvals WHERE workflow_id = ?', [workflowId]);
                await testDb.query('DELETE FROM workflows WHERE id = ?', [workflowId]);
                await testDb.query('DELETE FROM content WHERE id = ?', [contentId]);
                await testDb.query('DELETE FROM briefings WHERE id IN (SELECT briefing_id FROM content WHERE id = ?)', [contentId]);
                await testDb.query('DELETE FROM briefing_templates WHERE tenant_id = ?', [tenant?.id]);
              } catch (error) {
                console.warn('Failed to cleanup workflow data:', error);
              }
            }
          }
        }
      ),
      { numRuns: 10, timeout: 30000 }
    );
  });
});

// Helper function to find path to a target state
function getPathToState(
  startState: WorkflowState, 
  targetState: WorkflowState
): WorkflowState[] {
  if (startState === targetState) return [];
  
  // Define valid transitions
  const validTransitions = new Map([
    [WorkflowState.RESEARCH, [WorkflowState.PLANNING]],
    [WorkflowState.PLANNING, [WorkflowState.RESEARCH, WorkflowState.CONTENT]],
    [WorkflowState.CONTENT, [WorkflowState.PLANNING, WorkflowState.CREATIVE]],
    [WorkflowState.CREATIVE, [WorkflowState.CONTENT, WorkflowState.BRAND_APPLY]],
    [WorkflowState.BRAND_APPLY, [WorkflowState.CREATIVE, WorkflowState.COMPLIANCE_CHECK]],
    [WorkflowState.COMPLIANCE_CHECK, [WorkflowState.BRAND_APPLY, WorkflowState.APPROVAL]],
    [WorkflowState.APPROVAL, [WorkflowState.COMPLIANCE_CHECK, WorkflowState.PUBLISH]],
    [WorkflowState.PUBLISH, [WorkflowState.MONITOR]],
    [WorkflowState.MONITOR, [WorkflowState.RESEARCH, WorkflowState.PLANNING, WorkflowState.CONTENT]]
  ]);
  
  // Simple BFS to find path
  const queue: { state: WorkflowState; path: WorkflowState[] }[] = [{ state: startState, path: [] }];
  const visited = new Set<WorkflowState>();
  
  while (queue.length > 0) {
    const { state, path } = queue.shift()!;
    
    if (visited.has(state)) continue;
    visited.add(state);
    
    const nextStates = validTransitions.get(state) || [];
    for (const nextState of nextStates) {
      const newPath = [...path, nextState];
      if (nextState === targetState) {
        return newPath;
      }
      queue.push({ state: nextState, path: newPath });
    }
  }
  
  // If no path found, return direct transition attempt
  return [targetState];
}