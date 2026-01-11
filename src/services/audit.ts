import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

export interface AuditQuery {
  tenantId: string;
  userId?: string;
  action?: string;
  resource?: string;
  resourceId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface AuditReport {
  totalEntries: number;
  entries: AuditLogEntry[];
  summary: {
    actionBreakdown: Record<string, number>;
    resourceBreakdown: Record<string, number>;
    userBreakdown: Record<string, number>;
    timeRange: {
      start: Date;
      end: Date;
    };
  };
}

export interface AuditContext {
  tenantId: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
}

/**
 * Comprehensive audit logging service for tracking all user actions
 * Implements Property 12: Comprehensive Audit Trail
 */
export class AuditService {
  /**
   * Log an audit event with full context
   */
  async logEvent(
    context: AuditContext,
    action: string,
    resource: string,
    resourceId?: string,
    details: Record<string, any> = {}
  ): Promise<void> {
    try {
      const auditId = uuidv4();
      
      await db.query(`
        INSERT INTO public.audit_logs (
          id, tenant_id, user_id, action, resource, resource_id, 
          details, ip_address, user_agent, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
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
    } catch (error) {
      console.error('Error logging audit event:', error);
      // Don't throw error for audit logging failures to avoid breaking main operations
    }
  }

  /**
   * Log multiple audit events in a batch for better performance
   */
  async logBatch(events: Array<{
    context: AuditContext;
    action: string;
    resource: string;
    resourceId?: string;
    details?: Record<string, any>;
  }>): Promise<void> {
    if (events.length === 0) return;

    try {
      const values: any[] = [];
      const placeholders: string[] = [];
      
      events.forEach((event, index) => {
        const baseIndex = index * 9;
        placeholders.push(`($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9})`);
        
        values.push(
          uuidv4(),
          event.context.tenantId,
          event.context.userId || null,
          event.action,
          event.resource,
          event.resourceId || null,
          JSON.stringify(event.details || {}),
          event.context.ipAddress || null,
          event.context.userAgent || null
        );
      });

      await db.query(`
        INSERT INTO public.audit_logs (
          id, tenant_id, user_id, action, resource, resource_id, 
          details, ip_address, user_agent, created_at
        )
        VALUES ${placeholders.join(', ')}
      `, values);
    } catch (error) {
      console.error('Error logging audit batch:', error);
      // Don't throw error for audit logging failures
    }
  }

  /**
   * Query audit logs with filtering and pagination
   */
  async queryLogs(query: AuditQuery): Promise<AuditLogEntry[]> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: any[] = [query.tenantId];
    let paramIndex = 2;

    if (query.userId) {
      conditions.push(`user_id = $${paramIndex}`);
      params.push(query.userId);
      paramIndex++;
    }

    if (query.action) {
      conditions.push(`action = $${paramIndex}`);
      params.push(query.action);
      paramIndex++;
    }

    if (query.resource) {
      conditions.push(`resource = $${paramIndex}`);
      params.push(query.resource);
      paramIndex++;
    }

    if (query.resourceId) {
      conditions.push(`resource_id = $${paramIndex}`);
      params.push(query.resourceId);
      paramIndex++;
    }

    if (query.startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(query.startDate);
      paramIndex++;
    }

    if (query.endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(query.endDate);
      paramIndex++;
    }

    const limit = query.limit || 100;
    const offset = query.offset || 0;

    const result = await db.query(`
      SELECT 
        id, tenant_id, user_id, action, resource, resource_id,
        details, ip_address, user_agent, created_at
      FROM public.audit_logs
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);

    return result.rows.map(row => ({
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

  /**
   * Generate comprehensive audit report with analytics
   */
  async generateReport(query: AuditQuery): Promise<AuditReport> {
    const entries = await this.queryLogs(query);
    
    // Get total count
    const conditions: string[] = ['tenant_id = $1'];
    const params: any[] = [query.tenantId];
    let paramIndex = 2;

    if (query.userId) {
      conditions.push(`user_id = $${paramIndex}`);
      params.push(query.userId);
      paramIndex++;
    }

    if (query.action) {
      conditions.push(`action = $${paramIndex}`);
      params.push(query.action);
      paramIndex++;
    }

    if (query.resource) {
      conditions.push(`resource = $${paramIndex}`);
      params.push(query.resource);
      paramIndex++;
    }

    if (query.resourceId) {
      conditions.push(`resource_id = $${paramIndex}`);
      params.push(query.resourceId);
      paramIndex++;
    }

    if (query.startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(query.startDate);
      paramIndex++;
    }

    if (query.endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(query.endDate);
      paramIndex++;
    }

    const countResult = await db.query(`
      SELECT COUNT(*) as total FROM public.audit_logs
      WHERE ${conditions.join(' AND ')}
    `, params);

    const totalEntries = parseInt(countResult.rows[0].total);

    // Generate summary analytics
    const actionBreakdown: Record<string, number> = {};
    const resourceBreakdown: Record<string, number> = {};
    const userBreakdown: Record<string, number> = {};

    entries.forEach(entry => {
      actionBreakdown[entry.action] = (actionBreakdown[entry.action] || 0) + 1;
      resourceBreakdown[entry.resource] = (resourceBreakdown[entry.resource] || 0) + 1;
      if (entry.userId) {
        userBreakdown[entry.userId] = (userBreakdown[entry.userId] || 0) + 1;
      }
    });

    const timeRange = {
      start: query.startDate || (entries.length > 0 ? entries[entries.length - 1].createdAt : new Date()),
      end: query.endDate || (entries.length > 0 ? entries[0].createdAt : new Date())
    };

    return {
      totalEntries,
      entries,
      summary: {
        actionBreakdown,
        resourceBreakdown,
        userBreakdown,
        timeRange
      }
    };
  }

  /**
   * Get audit trail for a specific resource
   */
  async getResourceAuditTrail(
    tenantId: string,
    resource: string,
    resourceId: string,
    limit: number = 50
  ): Promise<AuditLogEntry[]> {
    return this.queryLogs({
      tenantId,
      resource,
      resourceId,
      limit
    });
  }

  /**
   * Get user activity audit trail
   */
  async getUserActivityTrail(
    tenantId: string,
    userId: string,
    startDate?: Date,
    endDate?: Date,
    limit: number = 100
  ): Promise<AuditLogEntry[]> {
    return this.queryLogs({
      tenantId,
      userId,
      startDate,
      endDate,
      limit
    });
  }

  /**
   * Clean up old audit logs based on retention policy
   */
  async cleanupOldLogs(tenantId: string, retentionDays: number = 365): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await db.query(`
        DELETE FROM public.audit_logs
        WHERE tenant_id = $1 AND created_at < $2
      `, [tenantId, cutoffDate]);

      return result.rowCount || 0;
    } catch (error) {
      console.error('Error cleaning up audit logs:', error);
      throw error;
    }
  }

  /**
   * Export audit logs to CSV format
   */
  async exportToCSV(query: AuditQuery): Promise<string> {
    const entries = await this.queryLogs({ ...query, limit: 10000 }); // Large limit for export
    
    const headers = [
      'ID', 'Tenant ID', 'User ID', 'Action', 'Resource', 'Resource ID',
      'Details', 'IP Address', 'User Agent', 'Created At'
    ];

    const csvRows = [headers.join(',')];
    
    entries.forEach(entry => {
      const row = [
        entry.id,
        entry.tenantId,
        entry.userId || '',
        entry.action,
        entry.resource,
        entry.resourceId || '',
        `"${JSON.stringify(entry.details).replace(/"/g, '""')}"`,
        entry.ipAddress || '',
        `"${(entry.userAgent || '').replace(/"/g, '""')}"`,
        entry.createdAt.toISOString()
      ];
      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  }

  /**
   * Check if audit logging is healthy
   */
  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    try {
      // Test basic connectivity and table existence
      await db.query('SELECT 1 FROM public.audit_logs LIMIT 1');
      
      // Check recent activity (should have some logs in the last 24 hours for active systems)
      const recentResult = await db.query(`
        SELECT COUNT(*) as count 
        FROM public.audit_logs 
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);
      
      const recentCount = parseInt(recentResult.rows[0].count);
      
      return {
        healthy: true,
        message: `Audit system healthy. ${recentCount} events logged in last 24 hours.`
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Audit system error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

// Export singleton instance
export const auditService = new AuditService();

// Common audit actions for consistency
export const AUDIT_ACTIONS = {
  // Authentication & Authorization
  LOGIN: 'user_login',
  LOGOUT: 'user_logout',
  LOGIN_FAILED: 'user_login_failed',
  PASSWORD_CHANGED: 'password_changed',
  ROLE_ASSIGNED: 'role_assigned',
  ROLE_REMOVED: 'role_removed',
  PERMISSION_GRANTED: 'permission_granted',
  PERMISSION_DENIED: 'permission_denied',

  // Tenant Management
  TENANT_CREATED: 'tenant_created',
  TENANT_UPDATED: 'tenant_updated',
  TENANT_DELETED: 'tenant_deleted',
  TENANT_SUSPENDED: 'tenant_suspended',
  TENANT_ACTIVATED: 'tenant_activated',

  // User Management
  USER_CREATED: 'user_created',
  USER_UPDATED: 'user_updated',
  USER_DELETED: 'user_deleted',
  USER_ACTIVATED: 'user_activated',
  USER_DEACTIVATED: 'user_deactivated',

  // Briefing Management
  BRIEFING_CREATED: 'briefing_created',
  BRIEFING_UPDATED: 'briefing_updated',
  BRIEFING_DELETED: 'briefing_deleted',
  BRIEFING_VERSION_CREATED: 'briefing_version_created',
  BRIEFING_ACTIVATED: 'briefing_activated',
  BRIEFING_ARCHIVED: 'briefing_archived',

  // Content Management
  CONTENT_CREATED: 'content_created',
  CONTENT_UPDATED: 'content_updated',
  CONTENT_DELETED: 'content_deleted',
  CONTENT_PUBLISHED: 'content_published',
  CONTENT_UNPUBLISHED: 'content_unpublished',

  // Workflow Management
  WORKFLOW_STATE_CHANGED: 'workflow_state_changed',
  WORKFLOW_COMMENT_ADDED: 'workflow_comment_added',
  WORKFLOW_APPROVAL_REQUESTED: 'workflow_approval_requested',
  WORKFLOW_APPROVED: 'workflow_approved',
  WORKFLOW_REJECTED: 'workflow_rejected',

  // AI Operations
  AI_REQUEST_MADE: 'ai_request_made',
  AI_RESPONSE_RECEIVED: 'ai_response_received',
  AI_REQUEST_FAILED: 'ai_request_failed',
  AI_PROVIDER_CONFIGURED: 'ai_provider_configured',
  AI_PROVIDER_HEALTH_CHECK: 'ai_provider_health_check',

  // Publishing Operations
  CONTENT_SCHEDULED: 'content_scheduled',
  CONTENT_PUBLISHED_SUCCESS: 'content_published_success',
  CONTENT_PUBLISHED_FAILED: 'content_published_failed',
  CONTENT_RESCHEDULED: 'content_rescheduled',

  // Billing Operations
  CREDIT_CONSUMED: 'credit_consumed',
  CREDIT_PURCHASED: 'credit_purchased',
  INVOICE_GENERATED: 'invoice_generated',
  PAYMENT_PROCESSED: 'payment_processed',
  PAYMENT_FAILED: 'payment_failed',

  // Security Events
  UNAUTHORIZED_ACCESS_ATTEMPT: 'unauthorized_access_attempt',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',
  DATA_EXPORT: 'data_export',
  DATA_IMPORT: 'data_import',
  CONFIGURATION_CHANGED: 'configuration_changed',

  // System Events
  SYSTEM_BACKUP: 'system_backup',
  SYSTEM_RESTORE: 'system_restore',
  MAINTENANCE_MODE_ENABLED: 'maintenance_mode_enabled',
  MAINTENANCE_MODE_DISABLED: 'maintenance_mode_disabled'
} as const;

// Common resource types for consistency
export const AUDIT_RESOURCES = {
  USER: 'user',
  TENANT: 'tenant',
  ROLE: 'role',
  PERMISSION: 'permission',
  BRIEFING: 'briefing',
  BRIEFING_TEMPLATE: 'briefing_template',
  CONTENT: 'content',
  WORKFLOW: 'workflow',
  AI_PROVIDER: 'ai_provider',
  AI_REQUEST: 'ai_request',
  CALENDAR_EVENT: 'calendar_event',
  PLATFORM_CREDENTIAL: 'platform_credential',
  INVOICE: 'invoice',
  SUBSCRIPTION: 'subscription',
  CREDIT_BALANCE: 'credit_balance',
  SYSTEM: 'system'
} as const;