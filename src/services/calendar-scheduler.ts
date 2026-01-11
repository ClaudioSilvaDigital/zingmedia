import { Pool } from 'pg';
import { CalendarService } from './calendar';
import { TenantContext, Tenant, User } from '../types';

export class CalendarSchedulerService {
  private calendarService: CalendarService;
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(private db: Pool) {
    this.calendarService = new CalendarService(db);
  }

  /**
   * Start the automatic rescheduling service
   * @param intervalMinutes How often to run the rescheduling process (default: 15 minutes)
   */
  start(intervalMinutes: number = 15): void {
    if (this.isRunning) {
      console.warn('Calendar scheduler is already running');
      return;
    }

    this.isRunning = true;
    const intervalMs = intervalMinutes * 60 * 1000;

    console.log(`Starting calendar scheduler with ${intervalMinutes} minute intervals`);

    // Run immediately on start
    this.runSchedulingCycle().catch(error => {
      console.error('Error in initial scheduling cycle:', error);
    });

    // Set up recurring execution
    this.intervalId = setInterval(() => {
      this.runSchedulingCycle().catch(error => {
        console.error('Error in scheduled rescheduling cycle:', error);
      });
    }, intervalMs);
  }

  /**
   * Stop the automatic rescheduling service
   */
  stop(): void {
    if (!this.isRunning) {
      console.warn('Calendar scheduler is not running');
      return;
    }

    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log('Calendar scheduler stopped');
  }

  /**
   * Run a single cycle of the scheduling process for all tenants
   */
  private async runSchedulingCycle(): Promise<void> {
    console.log('Running calendar scheduling cycle...');

    try {
      // Get all active tenants
      const tenantsQuery = `
        SELECT t.*, u.id as user_id, u.email, u.name
        FROM tenants t
        JOIN users u ON u.tenant_id = t.id 
          AND u.is_active = true
        WHERE t.type IN ('agency', 'client')
        ORDER BY t.created_at ASC
      `;

      const tenantsResult = await this.db.query(tenantsQuery);
      
      let totalProcessed = 0;
      let totalFailures = 0;
      let totalConflicts = 0;

      for (const row of tenantsResult.rows) {
        try {
          const tenant: Tenant = {
            id: row.id,
            name: row.name,
            type: row.type,
            parentId: row.parent_id,
            brandConfig: row.brand_config || {},
            settings: row.settings || {},
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at)
          };

          const user: User = {
            id: row.user_id,
            email: row.email,
            name: row.name,
            passwordHash: '',
            tenantId: row.id,
            roles: [],
            permissions: [],
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          const tenantContext: TenantContext = {
            tenantId: tenant.id,
            tenant,
            user,
            permissions: []
          };

          const result = await this.calendarService.runAutomaticRescheduling(tenantContext);
          
          totalProcessed += result.processedFailures;
          totalFailures += result.processedFailures;
          totalConflicts += result.resolvedConflicts;

          if (result.processedFailures > 0 || result.resolvedConflicts > 0) {
            console.log(`Tenant ${tenant.name}: processed ${result.processedFailures} failures, resolved ${result.resolvedConflicts} conflicts`);
          }

        } catch (tenantError) {
          console.error(`Error processing tenant ${row.id}:`, tenantError);
        }
      }

      console.log(`Scheduling cycle completed: ${totalProcessed} events processed, ${totalFailures} failures handled, ${totalConflicts} conflicts resolved`);

    } catch (error) {
      console.error('Error in scheduling cycle:', error);
    }
  }

  /**
   * Run rescheduling for a specific tenant
   */
  async runForTenant(tenantContext: TenantContext): Promise<{
    processedFailures: number;
    resolvedConflicts: number;
    upcomingEvents: number;
  }> {
    return await this.calendarService.runAutomaticRescheduling(tenantContext);
  }

  /**
   * Get the current status of the scheduler
   */
  getStatus(): {
    isRunning: boolean;
    nextRun?: Date;
  } {
    return {
      isRunning: this.isRunning,
      nextRun: this.intervalId ? new Date(Date.now() + 15 * 60 * 1000) : undefined // Approximate next run
    };
  }

  /**
   * Process events that are due to be published soon
   * This can be called more frequently to handle immediate publishing
   */
  async processImmediateEvents(): Promise<void> {
    console.log('Processing immediate events...');

    try {
      // Get events scheduled for the next 5 minutes
      const immediateEventsQuery = `
        SELECT ce.*, t.id as tenant_id, t.name as tenant_name, u.id as user_id, u.email, u.name as user_name
        FROM calendar_events ce
        JOIN tenants t ON ce.tenant_id = t.id
        JOIN users u ON u.tenant_id = t.id AND u.is_active = true
        WHERE ce.status = 'scheduled'
          AND ce.scheduled_at <= $1
          AND ce.scheduled_at >= CURRENT_TIMESTAMP
        ORDER BY ce.scheduled_at ASC
      `;

      const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
      const immediateEvents = await this.db.query(immediateEventsQuery, [fiveMinutesFromNow]);

      for (const event of immediateEvents.rows) {
        try {
          // Here you would integrate with your publishing service
          // For now, we'll just log that the event is ready for publishing
          console.log(`Event ${event.id} for tenant ${event.tenant_name} is ready for publishing on ${event.platform}`);
          
          // You could call a publishing service here:
          // await publishingService.publishEvent(event);
          
        } catch (eventError) {
          console.error(`Error processing immediate event ${event.id}:`, eventError);
          
          // Mark event as failed
          await this.db.query(
            'UPDATE calendar_events SET status = $1, failure_reason = $2 WHERE id = $3',
            ['failed', eventError instanceof Error ? eventError.message : 'Unknown error', event.id]
          );
        }
      }

    } catch (error) {
      console.error('Error processing immediate events:', error);
    }
  }
}