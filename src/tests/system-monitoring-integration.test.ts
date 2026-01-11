import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDatabaseManager } from '../config/test-database';
import { SystemIntegrationService } from '../services/system-integration';
import { AIIntegrationHub } from '../services/ai-hub';
import { PublisherService } from '../services/publishing/publisher-service';
import { CalendarSchedulerService } from '../services/calendar-scheduler';
import { AnalyticsService } from '../services/analytics';
import { BillingService } from '../services/billing';
import { MockAIProvider } from '../services/ai-providers/mock-provider';
import { v4 as uuidv4 } from 'uuid';
import { 
  TenantContext, 
  Tenant, 
  User, 
  Permission
} from '../types';

// Feature: content-automation-platform, Integration Test: System Monitoring
describe('System Monitoring Integration Tests', () => {
  let testDb: TestDatabaseManager;
  let systemIntegration: SystemIntegrationService;
  let aiHub: AIIntegrationHub;
  let publisherService: PublisherService;
  let calendarScheduler: CalendarSchedulerService;
  let analyticsService: AnalyticsService;
  let billingService: BillingService;
  
  let testTenant: Tenant;
  let testUser: User;
  let mockRedis: any;

  beforeAll(async () => {
    // Initialize test database
    testDb = new TestDatabaseManager();
    
    // Create mock Redis
    mockRedis = {
      connect: async () => {},
      disconnect: async () => {},
      ping: async () => 'PONG',
      set: async (key: string, value: string) => 'OK',
      get: async (key: string) => null,
      del: async (key: string) => 1,
      exists: async (key: string) => 0,
      expire: async (key: string, seconds: number) => 1,
      keys: async (pattern: string) => [],
      flushall: async () => 'OK'
    };

    // Initialize services
    aiHub = new AIIntegrationHub(testDb);
    publisherService = new PublisherService(testDb);
    calendarScheduler = new CalendarSchedulerService(testDb);
    analyticsService = new AnalyticsService(testDb);
    billingService = new BillingService(testDb);
    systemIntegration = new SystemIntegrationService(testDb, mockRedis);

    // Create test tenant and user
    testTenant = {
      id: uuidv4(),
      name: 'Monitoring Test Agency',
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

    testUser = {
      id: uuidv4(),
      email: 'monitor@test.com',
      name: 'Monitor User',
      tenantId: testTenant.id,
      roles: ['admin'],
      permissions: [
        { name: 'system:admin', resource: '*' },
        { name: 'analytics:read', resource: '*' },
        { name: 'billing:read', resource: '*' }
      ] as Permission[],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Setup tenant data
    await testDb.createTenantSchema(testTenant.id);
    
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
      'test_password_hash',
      testUser.tenantId,
      JSON.stringify(testUser.roles),
      JSON.stringify(testUser.permissions),
      testUser.isActive ? 1 : 0,
      testUser.createdAt.toISOString(),
      testUser.updatedAt.toISOString()
    ]);

    // Register mock AI provider
    const mockProvider = new MockAIProvider(`monitor-test-${uuidv4()}`, 'Monitor Test Provider');
    await aiHub.registerProvider(mockProvider, { apiKey: 'mock-test-key' }, testTenant.id);
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

  describe('System Health Monitoring', () => {
    it('should report healthy system when all components are working', async () => {
      const health = await systemIntegration.getSystemHealth();

      expect(health).toBeDefined();
      expect(health.healthy).toBe(true);
      expect(health.components).toBeDefined();
      expect(health.timestamp).toBeInstanceOf(Date);

      // Verify all components are reported as healthy
      expect(health.components.database.healthy).toBe(true);
      expect(health.components.redis.healthy).toBe(true);
      expect(health.components.aiHub.healthy).toBe(true);
      expect(health.components.publisher.healthy).toBe(true);

      // Verify AI Hub details
      expect(health.components.aiHub.details).toBeDefined();
      expect(health.components.aiHub.details.totalProviders).toBeGreaterThan(0);
      expect(health.components.aiHub.details.healthyProviders).toBeGreaterThan(0);
    });

    it('should detect database connectivity issues', async () => {
      // Simulate database failure by closing connection temporarily
      const originalQuery = testDb.query;
      testDb.query = async () => {
        throw new Error('Database connection failed');
      };

      try {
        const health = await systemIntegration.getSystemHealth();
        
        expect(health.healthy).toBe(false);
        expect(health.components.database.healthy).toBe(false);
        expect(health.components.database.details).toContain('Database connection failed');
      } finally {
        // Restore database connection
        testDb.query = originalQuery;
      }
    });

    it('should detect Redis connectivity issues', async () => {
      // Simulate Redis failure
      const originalPing = mockRedis.ping;
      mockRedis.ping = async () => {
        throw new Error('Redis connection failed');
      };

      try {
        const health = await systemIntegration.getSystemHealth();
        
        expect(health.healthy).toBe(false);
        expect(health.components.redis.healthy).toBe(false);
        expect(health.components.redis.details).toContain('Redis connection failed');
      } finally {
        // Restore Redis connection
        mockRedis.ping = originalPing;
      }
    });

    it('should detect AI provider health issues', async () => {
      // Register a failing AI provider
      const failingProvider = new MockAIProvider(`failing-provider-${uuidv4()}`, 'Failing Provider');
      
      // Override checkHealth to simulate failure
      failingProvider.checkHealth = async () => ({
        providerId: failingProvider.id,
        isHealthy: false,
        responseTime: 0,
        timestamp: new Date(),
        error: 'Provider is down'
      });

      await aiHub.registerProvider(failingProvider, { apiKey: 'test' }, testTenant.id);

      const health = await systemIntegration.getSystemHealth();
      
      // System should still be healthy if at least one provider works
      expect(health.components.aiHub.healthy).toBe(true);
      expect(health.components.aiHub.details.totalProviders).toBeGreaterThan(1);
      expect(health.components.aiHub.details.healthyProviders).toBeGreaterThan(0);
    });

    it('should report unhealthy when all AI providers fail', async () => {
      // Create a new AI hub with only failing providers
      const testAiHub = new AIIntegrationHub(testDb);
      const failingProvider = new MockAIProvider(`all-failing-${uuidv4()}`, 'All Failing Provider');
      
      failingProvider.checkHealth = async () => ({
        providerId: failingProvider.id,
        isHealthy: false,
        responseTime: 0,
        timestamp: new Date(),
        error: 'All providers down'
      });

      await testAiHub.registerProvider(failingProvider, { apiKey: 'test' }, testTenant.id);

      // Create system integration with failing AI hub
      const testSystemIntegration = new SystemIntegrationService(testDb, mockRedis);
      testSystemIntegration['aiHub'] = testAiHub;

      const health = await testSystemIntegration.getSystemHealth();
      
      expect(health.healthy).toBe(false);
      expect(health.components.aiHub.healthy).toBe(false);
      expect(health.components.aiHub.details.healthyProviders).toBe(0);
    });
  });

  describe('System Metrics Collection', () => {
    it('should collect comprehensive system metrics', async () => {
      const tenantContext: TenantContext = { 
        tenantId: testTenant.id, 
        userId: testUser.id,
        user: testUser,
        permissions: testUser.permissions,
        tenant: testTenant
      };

      // Create some test data first
      await createTestMetricsData(tenantContext);

      const metrics = await systemIntegration.getSystemMetrics(tenantContext);

      expect(metrics).toBeDefined();
      expect(metrics.workflows).toBeDefined();
      expect(metrics.content).toBeDefined();
      expect(metrics.publishing).toBeDefined();
      expect(metrics.aiUsage).toBeDefined();

      // Verify workflow metrics structure
      expect(metrics.workflows.total).toBeTypeOf('number');
      expect(metrics.workflows.byState).toBeTypeOf('object');

      // Verify content metrics structure
      expect(metrics.content.total).toBeTypeOf('number');
      expect(metrics.content.byType).toBeTypeOf('object');

      // Verify publishing metrics structure
      expect(metrics.publishing.scheduled).toBeTypeOf('number');
      expect(metrics.publishing.published).toBeTypeOf('number');
      expect(metrics.publishing.failed).toBeTypeOf('number');

      // Verify AI usage metrics structure
      expect(metrics.aiUsage.totalRequests).toBeTypeOf('number');
      expect(metrics.aiUsage.totalCredits).toBeTypeOf('number');
      expect(metrics.aiUsage.byProvider).toBeTypeOf('object');
    });

    it('should track workflow state distribution', async () => {
      const tenantContext: TenantContext = { 
        tenantId: testTenant.id, 
        userId: testUser.id,
        user: testUser,
        permissions: testUser.permissions,
        tenant: testTenant
      };

      // Create workflows in different states
      const workflowStates = ['research', 'planning', 'content', 'approval', 'publish'];
      
      for (const state of workflowStates) {
        await testDb.query(`
          INSERT INTO workflows (id, content_id, current_state, tenant_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          uuidv4(),
          uuidv4(),
          state,
          testTenant.id,
          new Date().toISOString(),
          new Date().toISOString()
        ]);
      }

      const metrics = await systemIntegration.getSystemMetrics(tenantContext);

      expect(metrics.workflows.total).toBeGreaterThanOrEqual(workflowStates.length);
      expect(Object.keys(metrics.workflows.byState)).toContain('research');
      expect(Object.keys(metrics.workflows.byState)).toContain('planning');
      expect(Object.keys(metrics.workflows.byState)).toContain('content');
    });

    it('should track content type distribution', async () => {
      const tenantContext: TenantContext = { 
        tenantId: testTenant.id, 
        userId: testUser.id,
        user: testUser,
        permissions: testUser.permissions,
        tenant: testTenant
      };

      // Create content of different types
      const contentTypes = ['text', 'image', 'video', 'carousel'];
      
      for (const type of contentTypes) {
        await testDb.query(`
          INSERT INTO content (id, briefing_id, title, description, content_type, tenant_id, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          uuidv4(),
          uuidv4(),
          `Test ${type} content`,
          `Description for ${type}`,
          type,
          testTenant.id,
          testUser.id,
          new Date().toISOString(),
          new Date().toISOString()
        ]);
      }

      const metrics = await systemIntegration.getSystemMetrics(tenantContext);

      expect(metrics.content.total).toBeGreaterThanOrEqual(contentTypes.length);
      expect(Object.keys(metrics.content.byType)).toContain('text');
      expect(Object.keys(metrics.content.byType)).toContain('image');
      expect(Object.keys(metrics.content.byType)).toContain('video');
    });

    it('should track publishing status distribution', async () => {
      const tenantContext: TenantContext = { 
        tenantId: testTenant.id, 
        userId: testUser.id,
        user: testUser,
        permissions: testUser.permissions,
        tenant: testTenant
      };

      // Create scheduled content with different statuses
      const statuses = ['scheduled', 'published', 'failed'];
      
      for (const status of statuses) {
        await testDb.query(`
          INSERT INTO scheduled_content (id, content_id, scheduled_at, platform, status, tenant_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          uuidv4(),
          uuidv4(),
          new Date().toISOString(),
          'instagram',
          status,
          testTenant.id,
          new Date().toISOString(),
          new Date().toISOString()
        ]);
      }

      const metrics = await systemIntegration.getSystemMetrics(tenantContext);

      expect(metrics.publishing.scheduled).toBeGreaterThanOrEqual(1);
      expect(metrics.publishing.published).toBeGreaterThanOrEqual(1);
      expect(metrics.publishing.failed).toBeGreaterThanOrEqual(1);
    });

    it('should track AI usage by provider', async () => {
      const tenantContext: TenantContext = { 
        tenantId: testTenant.id, 
        userId: testUser.id,
        user: testUser,
        permissions: testUser.permissions,
        tenant: testTenant
      };

      // Create AI request records
      const providerId = uuidv4();
      
      for (let i = 0; i < 5; i++) {
        await testDb.query(`
          INSERT INTO ai_requests (id, tenant_id, provider_id, request_type, prompt, options, response_status, processing_time, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          uuidv4(),
          testTenant.id,
          providerId,
          'text',
          'Test prompt',
          '{}',
          'success',
          100,
          new Date().toISOString()
        ]);
      }

      const metrics = await systemIntegration.getSystemMetrics(tenantContext);

      expect(metrics.aiUsage.totalRequests).toBeGreaterThanOrEqual(5);
      expect(metrics.aiUsage.byProvider[providerId]).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Performance Monitoring', () => {
    it('should monitor AI provider response times', async () => {
      const providers = await aiHub.getActiveProviders(testTenant.id);
      expect(providers.length).toBeGreaterThan(0);

      for (const provider of providers) {
        const healthCheck = await aiHub.testConnectivity(provider.id);
        
        expect(healthCheck).toBeDefined();
        expect(healthCheck.isHealthy).toBeDefined();
        expect(healthCheck.responseTime).toBeTypeOf('number');
        expect(healthCheck.timestamp).toBeInstanceOf(Date);
        
        if (healthCheck.isHealthy) {
          expect(healthCheck.responseTime).toBeGreaterThan(0);
        }
      }
    });

    it('should monitor database query performance', async () => {
      const startTime = Date.now();
      
      // Execute a complex query to test performance
      await testDb.query(`
        SELECT 
          COUNT(*) as total_workflows,
          current_state,
          COUNT(*) as state_count
        FROM workflows 
        WHERE tenant_id = ? 
        GROUP BY current_state
      `, [testTenant.id]);
      
      const queryTime = Date.now() - startTime;
      
      // Query should complete within reasonable time (1 second)
      expect(queryTime).toBeLessThan(1000);
    });

    it('should monitor system resource usage', async () => {
      const health = await systemIntegration.getSystemHealth();
      
      // Verify health check completes within reasonable time
      expect(health.timestamp).toBeInstanceOf(Date);
      
      const healthCheckAge = Date.now() - health.timestamp.getTime();
      expect(healthCheckAge).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Error Detection and Alerting', () => {
    it('should detect and report system errors', async () => {
      // Simulate various error conditions and verify they are detected
      const errorConditions = [
        {
          name: 'Database Error',
          simulate: async () => {
            const originalQuery = testDb.query;
            testDb.query = async () => { throw new Error('DB Error'); };
            return originalQuery;
          }
        },
        {
          name: 'Redis Error', 
          simulate: async () => {
            const originalPing = mockRedis.ping;
            mockRedis.ping = async () => { throw new Error('Redis Error'); };
            return originalPing;
          }
        }
      ];

      for (const condition of errorConditions) {
        const restore = await condition.simulate();
        
        try {
          const health = await systemIntegration.getSystemHealth();
          expect(health.healthy).toBe(false);
        } finally {
          // Restore original functionality
          if (condition.name === 'Database Error') {
            testDb.query = restore;
          } else if (condition.name === 'Redis Error') {
            mockRedis.ping = restore;
          }
        }
      }
    });

    it('should provide detailed error information', async () => {
      // Simulate database error
      const originalQuery = testDb.query;
      testDb.query = async () => {
        throw new Error('Detailed database error message');
      };

      try {
        const health = await systemIntegration.getSystemHealth();
        
        expect(health.healthy).toBe(false);
        expect(health.components.database.healthy).toBe(false);
        expect(health.components.database.details).toContain('Detailed database error message');
      } finally {
        testDb.query = originalQuery;
      }
    });
  });

  async function createTestMetricsData(tenantContext: TenantContext): Promise<void> {
    // Create some test workflows
    for (let i = 0; i < 3; i++) {
      await testDb.query(`
        INSERT INTO workflows (id, content_id, current_state, tenant_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        uuidv4(),
        uuidv4(),
        'research',
        testTenant.id,
        new Date().toISOString(),
        new Date().toISOString()
      ]);
    }

    // Create some test content
    for (let i = 0; i < 2; i++) {
      await testDb.query(`
        INSERT INTO content (id, briefing_id, title, description, content_type, tenant_id, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        uuidv4(),
        uuidv4(),
        `Test content ${i}`,
        `Description ${i}`,
        'text',
        testTenant.id,
        testUser.id,
        new Date().toISOString(),
        new Date().toISOString()
      ]);
    }
  }
});