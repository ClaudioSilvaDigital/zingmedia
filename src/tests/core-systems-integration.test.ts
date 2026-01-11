import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDatabaseManager } from '../config/test-database';
import { BriefingService } from '../services/briefing';
import { WorkflowEngine } from '../services/workflow';
import { AIIntegrationHub } from '../services/ai-hub';
import { MockAIProvider } from '../services/ai-providers/mock-provider';
import { SQLiteAdapter } from '../interfaces/database';
import { v4 as uuidv4 } from 'uuid';
import { 
  TenantContext, 
  Tenant, 
  User, 
  Permission,
  WorkflowState
} from '../types';

// Feature: content-automation-platform, Integration Test: Core Systems Integration
describe('Core Systems Integration Tests', () => {
  let testDb: TestDatabaseManager;
  let briefingService: BriefingService;
  let workflowEngine: WorkflowEngine;
  let aiHub: AIIntegrationHub;
  let testTenant: Tenant;
  let testUser: User;
  let testTemplateId: string;

  beforeAll(async () => {
    // Initialize test database and services
    testDb = new TestDatabaseManager();
    const dbAdapter = new SQLiteAdapter(testDb);
    
    briefingService = new BriefingService(dbAdapter);
    workflowEngine = new WorkflowEngine(dbAdapter);
    aiHub = new AIIntegrationHub(testDb);

    // Create test tenant
    testTenant = {
      id: uuidv4(),
      name: 'Integration Test Agency',
      type: 'agency',
      brandConfig: {
        primaryColor: '#007bff',
        logo: 'test-logo.png',
        customDomain: 'test.example.com'
      },
      settings: {
        timezone: 'UTC',
        language: 'en'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Create test user
    testUser = {
      id: uuidv4(),
      email: 'test@example.com',
      name: 'Test User',
      tenantId: testTenant.id,
      roles: ['social_media'],
      permissions: [
        { name: 'workflow:transition', resource: '*' },
        { name: 'briefing:create', resource: '*' },
        { name: 'briefing:read', resource: '*' }
      ] as Permission[],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Setup tenant tables
    await testDb.createTenantSchema(testTenant.id);
    
    // Insert test data
    await testDb.query(`
      INSERT INTO tenants (id, name, type, brand_config, settings, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      testTenant.id, 
      testTenant.name, 
      testTenant.type,
      JSON.stringify(testTenant.brandConfig),
      JSON.stringify(testTenant.settings),
      testTenant.createdAt.toISOString(),
      testTenant.updatedAt.toISOString()
    ]);

    await testDb.query(`
      INSERT INTO users (id, email, name, password_hash, tenant_id, roles, permissions, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      testUser.id,
      testUser.email,
      testUser.name,
      'test_password_hash', // Add password hash
      testUser.tenantId,
      JSON.stringify(testUser.roles),
      JSON.stringify(testUser.permissions),
      testUser.isActive ? 1 : 0,
      testUser.createdAt.toISOString(),
      testUser.updatedAt.toISOString()
    ]);

    // Create briefing template
    const templateId = uuidv4();
    await testDb.query(`
      INSERT INTO briefing_templates (id, name, fields, tenant_id, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      templateId,
      'Test Template',
      JSON.stringify([
        { name: 'objective', type: 'text', required: true },
        { name: 'target_audience', type: 'text', required: true }
      ]),
      testTenant.id,
      testUser.id, // Add created_by
      new Date().toISOString(),
      new Date().toISOString()
    ]);
    testTemplateId = templateId;

    // Register mock AI provider
    const mockProvider = new MockAIProvider('integration-test', 'Integration Test Provider');
    const providerConfig = {
      apiKey: 'mock-test-key',
      additionalHeaders: {}
    };
    await aiHub.registerProvider(mockProvider, providerConfig, testTenant.id);
  });

  afterAll(async () => {
    // Cleanup
    if (testTenant) {
      await testDb.dropTenantTables(testTenant.id);
      await testDb.query('DELETE FROM tenants WHERE id = ?', [testTenant.id]);
      await testDb.query('DELETE FROM users WHERE id = ?', [testUser.id]);
    }
    await testDb.close();
  });

  it('should create briefing, generate content with AI, and manage workflow states', async () => {
    const tenantContext: TenantContext = { 
      tenantId: testTenant.id, 
      userId: testUser.id,
      user: testUser,
      permissions: testUser.permissions
    };

    // Step 1: Create a briefing
    const briefingData = {
      title: 'Integration Test Campaign',
      type: 'internal' as const,
      templateId: testTemplateId,
      fields: {
        objective: 'Test campaign objective',
        target_audience: 'Test audience'
      },
      status: 'active' as const,
      tenantId: testTenant.id,
      createdBy: testUser.id
    };

    const briefing = await briefingService.createBriefing(briefingData, tenantContext);

    expect(briefing).toBeDefined();
    expect(briefing.title).toBe(briefingData.title);
    expect(briefing.fields.objective).toBe(briefingData.fields.objective);

    // Step 2: Test AI integration
    const aiRequest = {
      type: 'text' as const,
      prompt: `Generate content for: ${briefing.fields.objective}`,
      options: {
        maxTokens: 100,
        temperature: 0.7
      }
    };

    const aiResponse = await aiHub.routeRequest(aiRequest);
    expect(aiResponse).toBeDefined();
    expect(aiResponse.content).toBeDefined();

    // Step 3: Create workflow for content
    const contentId = uuidv4();
    const workflow = await workflowEngine.createWorkflow(contentId, tenantContext);

    expect(workflow).toBeDefined();
    expect(workflow.currentState).toBe(WorkflowState.RESEARCH);
    expect(workflow.contentId).toBe(contentId);

    // Step 4: Progress workflow through states
    await workflowEngine.transitionState(workflow.id, WorkflowState.PLANNING, tenantContext);
    await workflowEngine.transitionState(workflow.id, WorkflowState.CONTENT, tenantContext);

    const updatedWorkflow = await workflowEngine.getWorkflow(workflow.id, tenantContext);
    expect(updatedWorkflow?.currentState).toBe(WorkflowState.CONTENT);

    // Step 5: Add comment to workflow
    const comment = await workflowEngine.addComment(
      workflow.id,
      'AI generated content looks good',
      tenantContext
    );

    expect(comment).toBeDefined();
    expect(comment.content).toContain('AI generated content');

    // Verify systems are working together
    expect(briefing.id).toBeDefined();
    expect(workflow.id).toBeDefined();
    expect(aiResponse.content).toBeDefined();
  });

  it('should handle AI provider failures gracefully', async () => {
    // Test AI request that triggers failure
    const aiRequest = {
      type: 'text' as const,
      prompt: 'SIMULATE_FAILURE', // Mock provider will fail on this
      options: {
        maxTokens: 100,
        temperature: 0.7
      }
    };

    try {
      const aiResponse = await aiHub.routeRequest(aiRequest);
      // If we get here, fallback worked
      expect(aiResponse).toBeDefined();
    } catch (error) {
      // Error should be meaningful
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('provider');
    }
  });

  it('should maintain briefing versioning and workflow consistency', async () => {
    const tenantContext: TenantContext = { 
      tenantId: testTenant.id, 
      userId: testUser.id,
      user: testUser,
      permissions: testUser.permissions
    };

    // Create briefing
    const briefingData = {
      title: 'Versioning Test Campaign',
      type: 'internal' as const,
      templateId: testTemplateId,
      fields: {
        objective: 'Initial objective',
        target_audience: 'Initial audience'
      },
      status: 'active' as const,
      tenantId: testTenant.id,
      createdBy: testUser.id
    };

    const briefing = await briefingService.createBriefing(briefingData, tenantContext);

    // Update briefing to test versioning
    const updatedBriefing = await briefingService.updateBriefing(
      briefing.id,
      { fields: { objective: 'Updated objective', target_audience: 'Updated audience' } },
      tenantContext
    );

    // Verify briefing changes are reflected
    const currentBriefing = await briefingService.getBriefing(briefing.id, tenantContext);
    expect(currentBriefing.fields.objective).toBe('Updated objective');
    expect(currentBriefing.version).toBeGreaterThan(1);

    // Create workflow and verify it can coexist with briefing updates
    const contentId = uuidv4();
    const workflow = await workflowEngine.createWorkflow(contentId, tenantContext);
    
    await workflowEngine.transitionState(workflow.id, WorkflowState.PLANNING, tenantContext);
    
    const finalWorkflow = await workflowEngine.getWorkflow(workflow.id, tenantContext);
    expect(finalWorkflow?.currentState).toBe(WorkflowState.PLANNING);
    
    // Both systems should be working independently but consistently
    expect(updatedBriefing.id).toBeDefined();
    expect(finalWorkflow?.id).toBeDefined();
  });
});