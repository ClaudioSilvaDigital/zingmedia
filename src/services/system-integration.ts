import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { AIIntegrationHub } from './ai-hub';
import { WorkflowEngine } from './workflow';
import { ContentService } from './content';
import { BriefingService } from './briefing';
import { PublisherService } from './publishing/publisher-service';
import { CalendarSchedulerService } from './calendar-scheduler';
import { AnalyticsService } from './analytics';
import { BillingService } from './billing';
import { TenantContext } from '../types';

/**
 * System Integration Service
 * Coordinates all platform components and provides end-to-end workflow orchestration
 */
export class SystemIntegrationService {
  private aiHub: AIIntegrationHub;
  private workflowEngine: WorkflowEngine;
  private contentService: ContentService;
  private briefingService: BriefingService;
  private publisherService: PublisherService;
  private calendarScheduler: CalendarSchedulerService;
  private analyticsService: AnalyticsService;
  private billingService: BillingService;

  constructor(
    private db: Pool,
    private redis: Redis
  ) {
    this.aiHub = new AIIntegrationHub(db);
    this.workflowEngine = new WorkflowEngine(db);
    this.contentService = new ContentService(db);
    this.briefingService = new BriefingService(db);
    this.publisherService = new PublisherService(db);
    this.calendarScheduler = new CalendarSchedulerService(db);
    this.analyticsService = new AnalyticsService(db);
    this.billingService = new BillingService(db);
  }

  /**
   * Initialize all system components
   */
  async initialize(): Promise<void> {
    console.log('Initializing system integration...');

    // Initialize AI Hub
    await this.initializeAIHub();

    // Initialize calendar scheduler
    await this.calendarScheduler.initialize();

    // Initialize publisher service
    await this.publisherService.initialize();

    console.log('System integration initialized successfully');
  }

  /**
   * Initialize AI Hub with provider health checks
   */
  private async initializeAIHub(): Promise<void> {
    try {
      const providers = await this.aiHub.getActiveProviders();
      console.log(`AI Hub: Found ${providers.length} active providers`);

      // Test connectivity for each provider
      for (const provider of providers) {
        try {
          const healthCheck = await this.aiHub.testConnectivity(provider.id);
          console.log(`AI Provider ${provider.name}: ${healthCheck.isHealthy ? 'healthy' : 'unhealthy'}`);
        } catch (error) {
          console.warn(`AI Provider ${provider.name} health check failed:`, error);
        }
      }
    } catch (error) {
      console.error('AI Hub initialization failed:', error);
      throw error;
    }
  }

  /**
   * Execute complete content creation to publication workflow
   */
  async executeEndToEndWorkflow(
    briefingId: string,
    contentRequest: {
      title: string;
      description: string;
      contentType: 'text' | 'image' | 'video' | 'carousel';
      platforms: string[];
    },
    tenantContext: TenantContext
  ): Promise<{
    contentId: string;
    workflowId: string;
    status: string;
    publishResults?: any[];
  }> {
    console.log(`Starting end-to-end workflow for briefing ${briefingId}`);

    try {
      // Step 1: Validate briefing exists and is active
      const briefing = await this.briefingService.getBriefing(briefingId, tenantContext);
      if (!briefing || briefing.status !== 'active') {
        throw new Error('Invalid or inactive briefing');
      }

      // Step 2: Create content
      const content = await this.contentService.createContent({
        briefingId,
        title: contentRequest.title,
        description: contentRequest.description,
        contentType: contentRequest.contentType,
        tenantId: tenantContext.tenant.id,
        clientId: tenantContext.client?.id,
        createdBy: tenantContext.user.id
      }, tenantContext);

      // Step 3: Create workflow
      const workflow = await this.workflowEngine.createWorkflow(content.id, tenantContext);

      // Step 4: Progress through workflow states
      await this.progressWorkflowToApproval(workflow.id, tenantContext);

      // Step 5: Auto-approve if user has permission (for demo/testing)
      if (tenantContext.user.permissions?.some(p => p.name === 'content:auto_approve')) {
        await this.autoApproveContent(workflow.id, tenantContext);
      }

      // Step 6: If approved, schedule for publication
      let publishResults;
      const currentWorkflow = await this.workflowEngine.getWorkflow(workflow.id, tenantContext);
      if (currentWorkflow?.currentState === 'publish') {
        publishResults = await this.scheduleContentPublication(
          content.id,
          contentRequest.platforms,
          tenantContext
        );
      }

      return {
        contentId: content.id,
        workflowId: workflow.id,
        status: currentWorkflow?.currentState || 'unknown',
        publishResults
      };

    } catch (error) {
      console.error('End-to-end workflow failed:', error);
      throw error;
    }
  }

  /**
   * Progress workflow through states to approval
   */
  private async progressWorkflowToApproval(
    workflowId: string,
    tenantContext: TenantContext
  ): Promise<void> {
    const states = ['planning', 'content', 'creative', 'brand_apply', 'compliance_check', 'approval'];
    
    for (const state of states) {
      try {
        await this.workflowEngine.transitionState(
          workflowId,
          state as any,
          tenantContext,
          `Auto-progression to ${state}`
        );
        console.log(`Workflow ${workflowId} progressed to ${state}`);
      } catch (error) {
        console.warn(`Failed to progress workflow to ${state}:`, error);
        break;
      }
    }
  }

  /**
   * Auto-approve content for testing/demo purposes
   */
  private async autoApproveContent(
    workflowId: string,
    tenantContext: TenantContext
  ): Promise<void> {
    try {
      // Request approval
      const approval = await this.workflowEngine.requestApproval(
        workflowId,
        [tenantContext.user.id],
        tenantContext,
        1
      );

      // Respond with approval
      await this.workflowEngine.respondToApproval(
        approval.id,
        'approved',
        tenantContext,
        'Auto-approved for end-to-end workflow'
      );

      // Transition to publish state
      await this.workflowEngine.transitionState(
        workflowId,
        'publish',
        tenantContext,
        'Auto-approved and ready for publication'
      );

      console.log(`Workflow ${workflowId} auto-approved and ready for publication`);
    } catch (error) {
      console.error('Auto-approval failed:', error);
      throw error;
    }
  }

  /**
   * Schedule content for publication across platforms
   */
  private async scheduleContentPublication(
    contentId: string,
    platforms: string[],
    tenantContext: TenantContext
  ): Promise<any[]> {
    try {
      const content = await this.contentService.getContent(contentId, tenantContext);
      if (!content) {
        throw new Error('Content not found');
      }

      const publishResults = [];

      for (const platform of platforms) {
        try {
          // Schedule for immediate publication (in real scenario, this would be scheduled)
          const scheduleTime = new Date(Date.now() + 60000); // 1 minute from now
          
          const result = await this.publisherService.scheduleContent(
            content,
            platform as any,
            scheduleTime,
            tenantContext
          );

          publishResults.push({
            platform,
            status: 'scheduled',
            scheduledTime: scheduleTime,
            result
          });

          console.log(`Content ${contentId} scheduled for ${platform} at ${scheduleTime}`);
        } catch (error) {
          console.error(`Failed to schedule content for ${platform}:`, error);
          publishResults.push({
            platform,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      return publishResults;
    } catch (error) {
      console.error('Content publication scheduling failed:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive system health status
   */
  async getSystemHealth(): Promise<{
    healthy: boolean;
    components: Record<string, { healthy: boolean; details?: any }>;
    timestamp: Date;
  }> {
    const health = {
      healthy: true,
      components: {} as Record<string, { healthy: boolean; details?: any }>,
      timestamp: new Date()
    };

    // Check database
    try {
      await this.db.query('SELECT 1');
      health.components.database = { healthy: true };
    } catch (error) {
      health.components.database = { 
        healthy: false, 
        details: error instanceof Error ? error.message : 'Unknown error' 
      };
      health.healthy = false;
    }

    // Check Redis
    try {
      await this.redis.ping();
      health.components.redis = { healthy: true };
    } catch (error) {
      health.components.redis = { 
        healthy: false, 
        details: error instanceof Error ? error.message : 'Unknown error' 
      };
      health.healthy = false;
    }

    // Check AI Hub
    try {
      const providers = await this.aiHub.getActiveProviders();
      const healthyProviders = [];
      
      for (const provider of providers) {
        try {
          const healthCheck = await this.aiHub.testConnectivity(provider.id);
          if (healthCheck.isHealthy) {
            healthyProviders.push(provider.name);
          }
        } catch (error) {
          // Provider unhealthy, continue checking others
        }
      }

      health.components.aiHub = {
        healthy: healthyProviders.length > 0,
        details: {
          totalProviders: providers.length,
          healthyProviders: healthyProviders.length,
          healthyProviderNames: healthyProviders
        }
      };

      if (healthyProviders.length === 0 && providers.length > 0) {
        health.healthy = false;
      }
    } catch (error) {
      health.components.aiHub = { 
        healthy: false, 
        details: error instanceof Error ? error.message : 'Unknown error' 
      };
      health.healthy = false;
    }

    // Check Publisher Service
    try {
      const publisherHealth = await this.publisherService.healthCheck();
      health.components.publisher = {
        healthy: publisherHealth.healthy,
        details: publisherHealth
      };
      
      if (!publisherHealth.healthy) {
        health.healthy = false;
      }
    } catch (error) {
      health.components.publisher = { 
        healthy: false, 
        details: error instanceof Error ? error.message : 'Unknown error' 
      };
      health.healthy = false;
    }

    return health;
  }

  /**
   * Get system metrics and statistics
   */
  async getSystemMetrics(tenantContext: TenantContext): Promise<{
    workflows: {
      total: number;
      byState: Record<string, number>;
    };
    content: {
      total: number;
      byType: Record<string, number>;
    };
    publishing: {
      scheduled: number;
      published: number;
      failed: number;
    };
    aiUsage: {
      totalRequests: number;
      totalCredits: number;
      byProvider: Record<string, number>;
    };
  }> {
    try {
      // Get workflow metrics
      const workflowMetrics = await this.db.query(`
        SELECT 
          COUNT(*) as total,
          current_state,
          COUNT(*) as count
        FROM workflows 
        WHERE tenant_id = $1 
        GROUP BY current_state
      `, [tenantContext.tenant.id]);

      const workflowsByState = workflowMetrics.rows.reduce((acc, row) => {
        acc[row.current_state] = parseInt(row.count);
        return acc;
      }, {} as Record<string, number>);

      // Get content metrics
      const contentMetrics = await this.db.query(`
        SELECT 
          COUNT(*) as total,
          content_type,
          COUNT(*) as count
        FROM content 
        WHERE tenant_id = $1 
        GROUP BY content_type
      `, [tenantContext.tenant.id]);

      const contentByType = contentMetrics.rows.reduce((acc, row) => {
        acc[row.content_type] = parseInt(row.count);
        return acc;
      }, {} as Record<string, number>);

      // Get publishing metrics
      const publishingMetrics = await this.db.query(`
        SELECT 
          status,
          COUNT(*) as count
        FROM calendar_events 
        WHERE tenant_id = $1 
        GROUP BY status
      `, [tenantContext.tenant.id]);

      const publishingByStatus = publishingMetrics.rows.reduce((acc, row) => {
        acc[row.status] = parseInt(row.count);
        return acc;
      }, {} as Record<string, number>);

      // Get AI usage metrics
      const aiMetrics = await this.db.query(`
        SELECT 
          COUNT(*) as total_requests,
          SUM(CASE WHEN response_status = 'success' THEN 1 ELSE 0 END) as successful_requests,
          provider_id
        FROM ai_request_logs 
        WHERE tenant_id = $1 
        GROUP BY provider_id
      `, [tenantContext.tenant.id]);

      const aiByProvider = aiMetrics.rows.reduce((acc, row) => {
        acc[row.provider_id] = parseInt(row.successful_requests);
        return acc;
      }, {} as Record<string, number>);

      return {
        workflows: {
          total: workflowMetrics.rows.reduce((sum, row) => sum + parseInt(row.count), 0),
          byState: workflowsByState
        },
        content: {
          total: contentMetrics.rows.reduce((sum, row) => sum + parseInt(row.count), 0),
          byType: contentByType
        },
        publishing: {
          scheduled: publishingByStatus.scheduled || 0,
          published: publishingByStatus.published || 0,
          failed: publishingByStatus.failed || 0
        },
        aiUsage: {
          totalRequests: aiMetrics.rows.reduce((sum, row) => sum + parseInt(row.total_requests), 0),
          totalCredits: 0, // Would need to calculate from billing data
          byProvider: aiByProvider
        }
      };
    } catch (error) {
      console.error('Failed to get system metrics:', error);
      throw error;
    }
  }

  /**
   * Graceful shutdown of all system components
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down system integration...');

    try {
      // Stop calendar scheduler
      await this.calendarScheduler.stop();

      // Close publisher service connections
      await this.publisherService.close();

      console.log('System integration shutdown completed');
    } catch (error) {
      console.error('Error during system shutdown:', error);
    }
  }
}