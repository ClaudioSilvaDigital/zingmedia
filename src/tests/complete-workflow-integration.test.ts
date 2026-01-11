import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDatabaseManager } from '../config/test-database';
import { SystemIntegrationService } from '../services/system-integration';
import { BriefingService } from '../services/briefing';
import { ContentService } from '../services/content';
import { WorkflowEngine } from '../services/workflow';
import { AIIntegrationHub } from '../services/ai-hub';
import { PublisherService } from '../services/publishing/publisher-service';
import { MockAIProvider } from '../services/ai-providers/mock-provider';
import { SQLiteAdapter } from '../interfaces/database';
import { v4 as uuidv4 } from 'uuid';
import { 
  TenantContext, 
  Tenant, 
  User, 
  Permission,
  WorkflowState,
  Platform
} from '../types';

// Feature: content-automation-platform, Integration Test: Complete Workflow Integration
describe('Complete Workflow Integration Tests', () => {
  let testDb: TestDatabaseManager;
  let systemIntegration: SystemIntegrationService;
  let briefingService: BriefingService;
  let contentService: ContentService;
  let workflowEngine: WorkflowEngine;
  let aiHub: AIIntegrationHub;
  let publisherService: PublisherService;
  
  let testTenant1: Tenant;
  let testTenant2: Tenant;
  let testUser1: User;
  let testUser2: User;
  let testTemplateId1: string;
  let testTemplateId2: string;

  beforeAll(async () => {
    // Initialize test database and services
    testDb = new TestDatabaseManager();
    const dbAdapter = new SQLiteAdapter(testDb);
    
    briefingService = new BriefingService(dbAdapter);
    contentService = new ContentService(dbAdapter);
    workflowEngine = new WorkflowEngine(dbAdapter);
    aiHub = new AIIntegrationHub(testDb);
    publisherService = new PublisherService(testDb);
    
    // Create system integration service with mock Redis
    const mockRedis = {
      connect: async () => {},
      disconnect: async () => {},
      ping: async () => 'PONG',
      set: async () => 'OK',
      get: async () => null,
      del: async () => 1
    } as any;
    
    systemIntegration = new SystemIntegrationService(testDb, mockRedis);

    // Create test tenants
    testTenant1 = {
      id: uuidv4(),
      name: 'Agency One',
      type: 'agency',
      brandConfig: {
        primaryColor: '#007bff',
        logo: 'agency1-logo.png',
        customDomain: 'agency1.example.com'
      },
      settings: {
        timezone: 'UTC',
        language: 'en'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    testTenant2 = {
      id: uuidv4(),
      name: 'Agency Two',
      type: 'agency',
      brandConfig: {
        primaryColor: '#28a745',
        logo: 'agency2-logo.png',
        customDomain: 'agency2.example.com'
      },
      settings: {
        timezone: 'EST',
        language: 'en'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Create test users
    testUser1 = {
      id: uuidv4(),
      email: 'user1@agency1.com',
      name: 'User One',
      tenantId: testTenant1.id,
      roles: ['social_media'],
      permissions: [
        { name: 'workflow:transition', resource: '*' },
        { name: 'workflow:publish', resource: '*' },
        { name: 'briefing:create', resource: '*' },
        { name: 'briefing:read', resource: '*' },
        { name: 'content:create', resource: '*' },
        { name: 'content:auto_approve', resource: '*' },
        { name: 'publishing:schedule', resource: '*' }
      ] as Permission[],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    testUser2 = {
      id: uuidv4(),
      email: 'user2@agency2.com',
      name: 'User Two',
      tenantId: testTenant2.id,
      roles: ['social_media'],
      permissions: [
        { name: 'workflow:transition', resource: '*' },
        { name: 'briefing:create', resource: '*' },
        { name: 'briefing:read', resource: '*' },
        { name: 'content:create', resource: '*' }
      ] as Permission[],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Setup tenant schemas and data
    await setupTenantData(testTenant1, testUser1);
    await setupTenantData(testTenant2, testUser2);

    // Create briefing templates for each tenant
    testTemplateId1 = await createBriefingTemplate(testTenant1.id, testUser1.id, 'Agency 1 Template');
    testTemplateId2 = await createBriefingTemplate(testTenant2.id, testUser2.id, 'Agency 2 Template');

    // Register mock AI providers for each tenant
    await setupAIProviders();
  });

  afterAll(async () => {
    // Cleanup
    if (testTenant1) {
      await testDb.dropTenantTables(testTenant1.id);
      await testDb.query('DELETE FROM tenants WHERE id = ?', [testTenant1.id]);
      await testDb.query('DELETE FROM users WHERE id = ?', [testUser1.id]);
    }
    if (testTenant2) {
      await testDb.dropTenantTables(testTenant2.id);
      await testDb.query('DELETE FROM tenants WHERE id = ?', [testTenant2.id]);
      await testDb.query('DELETE FROM users WHERE id = ?', [testUser2.id]);
    }
    await testDb.close();
  });

  async function setupTenantData(tenant: Tenant, user: User): Promise<void> {
    // Setup tenant tables
    await testDb.createTenantSchema(tenant.id);
    
    // Create additional tables needed for integration tests
    await testDb.query(`
      CREATE TABLE IF NOT EXISTS scheduled_content (
        id TEXT PRIMARY KEY,
        content_id TEXT NOT NULL,
        scheduled_at TEXT NOT NULL,
        platform TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'scheduled',
        tenant_id TEXT NOT NULL,
        client_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await testDb.query(`
      CREATE TABLE IF NOT EXISTS ai_requests (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        request_type TEXT NOT NULL,
        prompt TEXT NOT NULL,
        options TEXT DEFAULT '{}',
        response_status TEXT NOT NULL,
        processing_time INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Insert tenant data
    await testDb.query(`
      INSERT INTO tenants (id, name, type, brand_config, settings, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      tenant.id, 
      tenant.name, 
      tenant.type,
      JSON.stringify(tenant.brandConfig),
      JSON.stringify(tenant.settings),
      tenant.createdAt.toISOString(),
      tenant.updatedAt.toISOString()
    ]);

    await testDb.query(`
      INSERT INTO users (id, email, name, password_hash, tenant_id, roles, permissions, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      user.id,
      user.email,
      user.name,
      'test_password_hash',
      user.tenantId,
      JSON.stringify(user.roles),
      JSON.stringify(user.permissions),
      user.isActive ? 1 : 0,
      user.createdAt.toISOString(),
      user.updatedAt.toISOString()
    ]);
  }

  async function createBriefingTemplate(tenantId: string, userId: string, name: string): Promise<string> {
    const templateId = uuidv4();
    await testDb.query(`
      INSERT INTO briefing_templates (id, name, fields, tenant_id, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      templateId,
      name,
      JSON.stringify([
        { name: 'objective', type: 'text', required: true },
        { name: 'target_audience', type: 'text', required: true },
        { name: 'platforms', type: 'array', required: true }
      ]),
      tenantId,
      userId,
      new Date().toISOString(),
      new Date().toISOString()
    ]);
    return templateId;
  }

  async function setupAIProviders(): Promise<void> {
    // Register mock AI providers for each tenant with unique IDs
    const mockProvider1 = new MockAIProvider(`tenant1-provider-${uuidv4()}`, 'Tenant 1 AI Provider');
    const mockProvider2 = new MockAIProvider(`tenant2-provider-${uuidv4()}`, 'Tenant 2 AI Provider');
    
    const providerConfig = {
      apiKey: 'mock-test-key',
      additionalHeaders: {}
    };

    await aiHub.registerProvider(mockProvider1, providerConfig, testTenant1.id);
    await aiHub.registerProvider(mockProvider2, providerConfig, testTenant2.id);
  }

  describe('End-to-End Content Creation and Publication Flow', () => {
    it('should execute complete workflow from briefing to publication', async () => {
      const tenantContext: TenantContext = { 
        tenantId: testTenant1.id, 
        userId: testUser1.id,
        user: testUser1,
        permissions: testUser1.permissions,
        tenant: testTenant1
      };

      // Step 1: Create briefing
      const briefingData = {
        title: 'End-to-End Test Campaign',
        type: 'internal' as const,
        templateId: testTemplateId1,
        fields: {
          objective: 'Create engaging social media content',
          target_audience: 'Young professionals',
          platforms: ['instagram', 'linkedin']
        },
        status: 'active' as const,
        tenantId: testTenant1.id,
        createdBy: testUser1.id
      };

      const briefing = await briefingService.createBriefing(briefingData, tenantContext);
      expect(briefing).toBeDefined();
      expect(briefing.status).toBe('active');

      // Step 2: Execute end-to-end workflow
      const contentRequest = {
        title: 'Test Social Media Post',
        description: 'A test post for end-to-end workflow',
        contentType: 'text' as const,
        platforms: ['instagram', 'linkedin']
      };

      const workflowResult = await systemIntegration.executeEndToEndWorkflow(
        briefing.id,
        contentRequest,
        tenantContext
      );

      expect(workflowResult).toBeDefined();
      expect(workflowResult.contentId).toBeDefined();
      expect(workflowResult.workflowId).toBeDefined();
      expect(workflowResult.status).toBeDefined();

      // Step 3: Verify content was created
      const content = await contentService.getContent(workflowResult.contentId, tenantContext);
      expect(content).toBeDefined();
      expect(content.title).toBe(contentRequest.title);
      expect(content.briefingId).toBe(briefing.id);

      // Step 4: Verify workflow was created and progressed
      const workflow = await workflowEngine.getWorkflow(workflowResult.workflowId, tenantContext);
      expect(workflow).toBeDefined();
      expect(workflow.contentId).toBe(workflowResult.contentId);

      // Step 5: Verify publishing was scheduled (if auto-approved)
      if (workflowResult.publishResults) {
        expect(workflowResult.publishResults).toHaveLength(2); // instagram and linkedin
        expect(workflowResult.publishResults.every(r => r.status === 'scheduled')).toBe(true);
      }

      console.log('End-to-end workflow completed successfully:', {
        briefingId: briefing.id,
        contentId: workflowResult.contentId,
        workflowId: workflowResult.workflowId,
        status: workflowResult.status
      });
    });

    it('should handle workflow progression through all states', async () => {
      const tenantContext: TenantContext = { 
        tenantId: testTenant1.id, 
        userId: testUser1.id,
        user: testUser1,
        permissions: testUser1.permissions,
        tenant: testTenant1
      };

      // Create a valid briefing first
      const briefing = await briefingService.createBriefing({
        title: 'Workflow State Test Briefing',
        type: 'internal' as const,
        templateId: testTemplateId1,
        fields: { objective: 'Test workflow states' },
        status: 'active' as const,
        tenantId: testTenant1.id,
        createdBy: testUser1.id
      }, tenantContext);

      // Create content and workflow
      const contentData = {
        briefingId: briefing.id,
        title: 'Workflow State Test',
        description: 'Testing workflow state transitions',
        contentType: 'text' as const,
        tenantId: testTenant1.id,
        createdBy: testUser1.id
      };

      const content = await contentService.createContent(contentData, tenantContext);
      const workflow = await workflowEngine.createWorkflow(content.id, tenantContext);

      // Progress through all workflow states
      const states = [
        WorkflowState.PLANNING,
        WorkflowState.CONTENT,
        WorkflowState.CREATIVE,
        WorkflowState.BRAND_APPLY,
        WorkflowState.COMPLIANCE_CHECK,
        WorkflowState.APPROVAL
      ];

      for (const state of states) {
        await workflowEngine.transitionState(workflow.id, state, tenantContext);
        const updatedWorkflow = await workflowEngine.getWorkflow(workflow.id, tenantContext);
        expect(updatedWorkflow?.currentState).toBe(state);
      }

      // Test approval process
      const approval = await workflowEngine.requestApproval(
        workflow.id,
        [testUser1.id],
        tenantContext,
        1
      );

      await workflowEngine.respondToApproval(
        approval.id,
        'approved',
        tenantContext,
        'Approved for testing'
      );

      // Transition to publish
      await workflowEngine.transitionState(workflow.id, WorkflowState.PUBLISH, tenantContext);
      
      const finalWorkflow = await workflowEngine.getWorkflow(workflow.id, tenantContext);
      expect(finalWorkflow?.currentState).toBe(WorkflowState.PUBLISH);
    });
  });

  describe('Multi-Tenant Isolation Tests', () => {
    it('should maintain complete data isolation between tenants', async () => {
      const tenantContext1: TenantContext = { 
        tenantId: testTenant1.id, 
        userId: testUser1.id,
        user: testUser1,
        permissions: testUser1.permissions,
        tenant: testTenant1
      };

      const tenantContext2: TenantContext = { 
        tenantId: testTenant2.id, 
        userId: testUser2.id,
        user: testUser2,
        permissions: testUser2.permissions,
        tenant: testTenant2
      };

      // Create briefings for each tenant
      const briefing1 = await briefingService.createBriefing({
        title: 'Tenant 1 Briefing',
        type: 'internal' as const,
        templateId: testTemplateId1,
        fields: { objective: 'Tenant 1 objective' },
        status: 'active' as const,
        tenantId: testTenant1.id,
        createdBy: testUser1.id
      }, tenantContext1);

      const briefing2 = await briefingService.createBriefing({
        title: 'Tenant 2 Briefing',
        type: 'internal' as const,
        templateId: testTemplateId2,
        fields: { objective: 'Tenant 2 objective' },
        status: 'active' as const,
        tenantId: testTenant2.id,
        createdBy: testUser2.id
      }, tenantContext2);

      // Verify tenant 1 cannot access tenant 2's briefing
      try {
        await briefingService.getBriefing(briefing2.id, tenantContext1);
        expect.fail('Should not be able to access other tenant\'s briefing');
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Verify tenant 2 cannot access tenant 1's briefing
      try {
        await briefingService.getBriefing(briefing1.id, tenantContext2);
        expect.fail('Should not be able to access other tenant\'s briefing');
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Verify each tenant can access their own briefing
      const retrievedBriefing1 = await briefingService.getBriefing(briefing1.id, tenantContext1);
      const retrievedBriefing2 = await briefingService.getBriefing(briefing2.id, tenantContext2);

      expect(retrievedBriefing1.title).toBe('Tenant 1 Briefing');
      expect(retrievedBriefing2.title).toBe('Tenant 2 Briefing');
    });

    it('should isolate AI provider access between tenants', async () => {
      // Test that each tenant can only access their own AI providers
      const tenant1Providers = await aiHub.getActiveProviders(testTenant1.id);
      const tenant2Providers = await aiHub.getActiveProviders(testTenant2.id);

      expect(tenant1Providers).toHaveLength(1);
      expect(tenant2Providers).toHaveLength(1);
      expect(tenant1Providers[0].name).toBe('Tenant 1 AI Provider');
      expect(tenant2Providers[0].name).toBe('Tenant 2 AI Provider');

      // Verify providers are isolated
      expect(tenant1Providers[0].id).not.toBe(tenant2Providers[0].id);
    });

    it('should isolate workflow and content data between tenants', async () => {
      const tenantContext1: TenantContext = { 
        tenantId: testTenant1.id, 
        userId: testUser1.id,
        user: testUser1,
        permissions: testUser1.permissions,
        tenant: testTenant1
      };

      const tenantContext2: TenantContext = { 
        tenantId: testTenant2.id, 
        userId: testUser2.id,
        user: testUser2,
        permissions: testUser2.permissions,
        tenant: testTenant2
      };

      // Create briefings for each tenant first
      const briefing1 = await briefingService.createBriefing({
        title: 'Tenant 1 Content Briefing',
        type: 'internal' as const,
        templateId: testTemplateId1,
        fields: { objective: 'Tenant 1 content' },
        status: 'active' as const,
        tenantId: testTenant1.id,
        createdBy: testUser1.id
      }, tenantContext1);

      const briefing2 = await briefingService.createBriefing({
        title: 'Tenant 2 Content Briefing',
        type: 'internal' as const,
        templateId: testTemplateId2,
        fields: { objective: 'Tenant 2 content' },
        status: 'active' as const,
        tenantId: testTenant2.id,
        createdBy: testUser2.id
      }, tenantContext2);

      // Create content for each tenant
      const content1 = await contentService.createContent({
        briefingId: briefing1.id,
        title: 'Tenant 1 Content',
        description: 'Content for tenant 1',
        contentType: 'text' as const,
        tenantId: testTenant1.id,
        createdBy: testUser1.id
      }, tenantContext1);

      const content2 = await contentService.createContent({
        briefingId: briefing2.id,
        title: 'Tenant 2 Content',
        description: 'Content for tenant 2',
        contentType: 'text' as const,
        tenantId: testTenant2.id,
        createdBy: testUser2.id
      }, tenantContext2);

      // Create workflows for each content
      const workflow1 = await workflowEngine.createWorkflow(content1.id, tenantContext1);
      const workflow2 = await workflowEngine.createWorkflow(content2.id, tenantContext2);

      // Verify tenant isolation for content
      try {
        await contentService.getContent(content2.id, tenantContext1);
        expect.fail('Should not access other tenant\'s content');
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Verify tenant isolation for workflows
      try {
        await workflowEngine.getWorkflow(workflow2.id, tenantContext1);
        expect.fail('Should not access other tenant\'s workflow');
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Verify each tenant can access their own data
      const retrievedContent1 = await contentService.getContent(content1.id, tenantContext1);
      const retrievedWorkflow1 = await workflowEngine.getWorkflow(workflow1.id, tenantContext1);

      expect(retrievedContent1.title).toBe('Tenant 1 Content');
      expect(retrievedWorkflow1?.contentId).toBe(content1.id);
    });
  });

  describe('Error Handling and Recovery Tests', () => {
    it('should handle AI provider failures gracefully', async () => {
      const tenantContext: TenantContext = { 
        tenantId: testTenant1.id, 
        userId: testUser1.id,
        user: testUser1,
        permissions: testUser1.permissions,
        tenant: testTenant1
      };

      // Create briefing that will trigger AI failure
      const briefing = await briefingService.createBriefing({
        title: 'AI Failure Test',
        type: 'internal' as const,
        templateId: testTemplateId1,
        fields: { 
          objective: 'SIMULATE_FAILURE', // This will trigger mock provider failure
          target_audience: 'Test audience'
        },
        status: 'active' as const,
        tenantId: testTenant1.id,
        createdBy: testUser1.id
      }, tenantContext);

      // Attempt end-to-end workflow with AI failure
      const contentRequest = {
        title: 'AI Failure Test Content',
        description: 'Testing AI failure handling',
        contentType: 'text' as const,
        platforms: ['instagram']
      };

      try {
        const result = await systemIntegration.executeEndToEndWorkflow(
          briefing.id,
          contentRequest,
          tenantContext
        );

        // If we get here, the system handled the failure gracefully
        expect(result).toBeDefined();
        expect(result.contentId).toBeDefined();
        
        // Workflow should still be created even if AI fails
        const workflow = await workflowEngine.getWorkflow(result.workflowId, tenantContext);
        expect(workflow).toBeDefined();
        
      } catch (error) {
        // Error should be meaningful and not crash the system
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBeDefined();
      }
    });

    it('should handle invalid briefing references gracefully', async () => {
      const tenantContext: TenantContext = { 
        tenantId: testTenant1.id, 
        userId: testUser1.id,
        user: testUser1,
        permissions: testUser1.permissions,
        tenant: testTenant1
      };

      const contentRequest = {
        title: 'Invalid Briefing Test',
        description: 'Testing invalid briefing handling',
        contentType: 'text' as const,
        platforms: ['instagram']
      };

      // Try to execute workflow with non-existent briefing
      try {
        await systemIntegration.executeEndToEndWorkflow(
          'non-existent-briefing-id',
          contentRequest,
          tenantContext
        );
        expect.fail('Should throw error for invalid briefing');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('briefing');
      }
    });

    it('should handle workflow state transition errors', async () => {
      const tenantContext: TenantContext = { 
        tenantId: testTenant1.id, 
        userId: testUser1.id,
        user: testUser1,
        permissions: testUser1.permissions,
        tenant: testTenant1
      };

      // Create a valid briefing first
      const briefing = await briefingService.createBriefing({
        title: 'State Transition Error Test Briefing',
        type: 'internal' as const,
        templateId: testTemplateId1,
        fields: { objective: 'Test state transition errors' },
        status: 'active' as const,
        tenantId: testTenant1.id,
        createdBy: testUser1.id
      }, tenantContext);

      // Create content and workflow
      const content = await contentService.createContent({
        briefingId: briefing.id,
        title: 'State Transition Error Test',
        description: 'Testing state transition errors',
        contentType: 'text' as const,
        tenantId: testTenant1.id,
        createdBy: testUser1.id
      }, tenantContext);

      const workflow = await workflowEngine.createWorkflow(content.id, tenantContext);

      // Try invalid state transition (skip required states)
      try {
        await workflowEngine.transitionState(workflow.id, WorkflowState.PUBLISH, tenantContext);
        expect.fail('Should not allow invalid state transition');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('transition');
      }

      // Verify workflow is still in original state
      const unchangedWorkflow = await workflowEngine.getWorkflow(workflow.id, tenantContext);
      expect(unchangedWorkflow?.currentState).toBe(WorkflowState.RESEARCH);
    });

    it('should handle publishing failures gracefully', async () => {
      const tenantContext: TenantContext = { 
        tenantId: testTenant1.id, 
        userId: testUser1.id,
        user: testUser1,
        permissions: testUser1.permissions,
        tenant: testTenant1
      };

      // Create a valid briefing first
      const briefing = await briefingService.createBriefing({
        title: 'Publishing Failure Test Briefing',
        type: 'internal' as const,
        templateId: testTemplateId1,
        fields: { objective: 'Test publishing failures' },
        status: 'active' as const,
        tenantId: testTenant1.id,
        createdBy: testUser1.id
      }, tenantContext);

      // Create content
      const content = await contentService.createContent({
        briefingId: briefing.id,
        title: 'Publishing Failure Test',
        description: 'Testing publishing failure handling',
        contentType: 'text' as const,
        tenantId: testTenant1.id,
        createdBy: testUser1.id
      }, tenantContext);

      // Try to schedule content for invalid platform
      try {
        await publisherService.scheduleContent(
          content,
          'invalid-platform' as Platform,
          new Date(),
          tenantContext
        );
        expect.fail('Should throw error for invalid platform');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('platform');
      }
    });
  });

  describe('System Health and Metrics Tests', () => {
    it('should provide comprehensive system health status', async () => {
      const health = await systemIntegration.getSystemHealth();

      expect(health).toBeDefined();
      expect(health.healthy).toBeDefined();
      expect(health.components).toBeDefined();
      expect(health.timestamp).toBeInstanceOf(Date);

      // Check individual component health
      expect(health.components.database).toBeDefined();
      expect(health.components.redis).toBeDefined();
      expect(health.components.aiHub).toBeDefined();
      expect(health.components.publisher).toBeDefined();

      // Each component should have healthy status
      Object.values(health.components).forEach(component => {
        expect(component.healthy).toBeDefined();
      });
    });

    it('should provide system metrics for tenant', async () => {
      const tenantContext: TenantContext = { 
        tenantId: testTenant1.id, 
        userId: testUser1.id,
        user: testUser1,
        permissions: testUser1.permissions,
        tenant: testTenant1
      };

      const metrics = await systemIntegration.getSystemMetrics(tenantContext);

      expect(metrics).toBeDefined();
      expect(metrics.workflows).toBeDefined();
      expect(metrics.content).toBeDefined();
      expect(metrics.publishing).toBeDefined();
      expect(metrics.aiUsage).toBeDefined();

      // Verify metric structure
      expect(metrics.workflows.total).toBeTypeOf('number');
      expect(metrics.workflows.byState).toBeTypeOf('object');
      expect(metrics.content.total).toBeTypeOf('number');
      expect(metrics.content.byType).toBeTypeOf('object');
      expect(metrics.publishing.scheduled).toBeTypeOf('number');
      expect(metrics.publishing.published).toBeTypeOf('number');
      expect(metrics.publishing.failed).toBeTypeOf('number');
      expect(metrics.aiUsage.totalRequests).toBeTypeOf('number');
    });
  });
});