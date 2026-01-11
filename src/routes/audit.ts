import { Router, Request, Response } from 'express';
import { auditService, AuditQuery } from '../services/audit';
import { logAuditEvent } from '../middleware/audit';
import { AUDIT_ACTIONS, AUDIT_RESOURCES } from '../services/audit';

const router = Router();

/**
 * GET /audit/logs - Query audit logs with filtering
 */
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const tenantId = req.auditContext?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    // Check permissions (only admins should access audit logs)
    if (!req.user?.permissions?.some(p => p.name === 'audit:read')) {
      await logAuditEvent(req, AUDIT_ACTIONS.UNAUTHORIZED_ACCESS_ATTEMPT, AUDIT_RESOURCES.SYSTEM);
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const query: AuditQuery = {
      tenantId,
      userId: req.query.userId as string,
      action: req.query.action as string,
      resource: req.query.resource as string,
      resourceId: req.query.resourceId as string,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0
    };

    const logs = await auditService.queryLogs(query);

    // Log the audit query itself
    await logAuditEvent(req, AUDIT_ACTIONS.DATA_EXPORT, AUDIT_RESOURCES.SYSTEM, undefined, {
      queryParams: query,
      resultCount: logs.length
    });

    res.json({
      success: true,
      data: logs,
      pagination: {
        limit: query.limit,
        offset: query.offset,
        hasMore: logs.length === query.limit
      }
    });
  } catch (error) {
    console.error('Error querying audit logs:', error);
    res.status(500).json({ 
      error: 'Failed to query audit logs',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /audit/report - Generate comprehensive audit report
 */
router.get('/report', async (req: Request, res: Response) => {
  try {
    const tenantId = req.auditContext?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    // Check permissions
    if (!req.user?.permissions?.some(p => p.name === 'audit:read')) {
      await logAuditEvent(req, AUDIT_ACTIONS.UNAUTHORIZED_ACCESS_ATTEMPT, AUDIT_RESOURCES.SYSTEM);
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const query: AuditQuery = {
      tenantId,
      userId: req.query.userId as string,
      action: req.query.action as string,
      resource: req.query.resource as string,
      resourceId: req.query.resourceId as string,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 1000
    };

    const report = await auditService.generateReport(query);

    // Log the report generation
    await logAuditEvent(req, AUDIT_ACTIONS.DATA_EXPORT, AUDIT_RESOURCES.SYSTEM, undefined, {
      reportType: 'audit_report',
      queryParams: query,
      totalEntries: report.totalEntries
    });

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Error generating audit report:', error);
    res.status(500).json({ 
      error: 'Failed to generate audit report',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /audit/resource/:resource/:resourceId - Get audit trail for specific resource
 */
router.get('/resource/:resource/:resourceId', async (req: Request, res: Response) => {
  try {
    const tenantId = req.auditContext?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    // Check permissions
    if (!req.user?.permissions?.some(p => p.name === 'audit:read')) {
      await logAuditEvent(req, AUDIT_ACTIONS.UNAUTHORIZED_ACCESS_ATTEMPT, AUDIT_RESOURCES.SYSTEM);
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { resource, resourceId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    const trail = await auditService.getResourceAuditTrail(tenantId, resource, resourceId, limit);

    // Log the resource audit trail access
    await logAuditEvent(req, AUDIT_ACTIONS.DATA_EXPORT, AUDIT_RESOURCES.SYSTEM, undefined, {
      auditTrailFor: { resource, resourceId },
      resultCount: trail.length
    });

    res.json({
      success: true,
      data: {
        resource,
        resourceId,
        trail
      }
    });
  } catch (error) {
    console.error('Error getting resource audit trail:', error);
    res.status(500).json({ 
      error: 'Failed to get resource audit trail',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /audit/user/:userId - Get user activity audit trail
 */
router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const tenantId = req.auditContext?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    // Check permissions (users can see their own trail, admins can see any)
    const requestedUserId = req.params.userId;
    const canViewAnyUser = req.user?.permissions?.some(p => p.name === 'audit:read');
    const canViewOwnTrail = req.user?.id === requestedUserId;

    if (!canViewAnyUser && !canViewOwnTrail) {
      await logAuditEvent(req, AUDIT_ACTIONS.UNAUTHORIZED_ACCESS_ATTEMPT, AUDIT_RESOURCES.SYSTEM);
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;

    const trail = await auditService.getUserActivityTrail(
      tenantId,
      requestedUserId,
      startDate,
      endDate,
      limit
    );

    // Log the user activity trail access
    await logAuditEvent(req, AUDIT_ACTIONS.DATA_EXPORT, AUDIT_RESOURCES.SYSTEM, undefined, {
      userActivityTrailFor: requestedUserId,
      dateRange: { startDate, endDate },
      resultCount: trail.length
    });

    res.json({
      success: true,
      data: {
        userId: requestedUserId,
        dateRange: { startDate, endDate },
        trail
      }
    });
  } catch (error) {
    console.error('Error getting user activity trail:', error);
    res.status(500).json({ 
      error: 'Failed to get user activity trail',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /audit/export/csv - Export audit logs to CSV
 */
router.get('/export/csv', async (req: Request, res: Response) => {
  try {
    const tenantId = req.auditContext?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    // Check permissions
    if (!req.user?.permissions?.some(p => p.name === 'audit:export')) {
      await logAuditEvent(req, AUDIT_ACTIONS.UNAUTHORIZED_ACCESS_ATTEMPT, AUDIT_RESOURCES.SYSTEM);
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const query: AuditQuery = {
      tenantId,
      userId: req.query.userId as string,
      action: req.query.action as string,
      resource: req.query.resource as string,
      resourceId: req.query.resourceId as string,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      limit: 10000 // Large limit for export
    };

    const csvData = await auditService.exportToCSV(query);

    // Log the export
    await logAuditEvent(req, AUDIT_ACTIONS.DATA_EXPORT, AUDIT_RESOURCES.SYSTEM, undefined, {
      exportType: 'csv',
      queryParams: query,
      exportSize: csvData.length
    });

    // Set CSV headers
    const filename = `audit-logs-${tenantId}-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.send(csvData);
  } catch (error) {
    console.error('Error exporting audit logs:', error);
    res.status(500).json({ 
      error: 'Failed to export audit logs',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /audit/cleanup - Clean up old audit logs
 */
router.delete('/cleanup', async (req: Request, res: Response) => {
  try {
    const tenantId = req.auditContext?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    // Check permissions (only platform admins should be able to cleanup)
    if (!req.user?.permissions?.some(p => p.name === 'audit:cleanup')) {
      await logAuditEvent(req, AUDIT_ACTIONS.UNAUTHORIZED_ACCESS_ATTEMPT, AUDIT_RESOURCES.SYSTEM);
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const retentionDays = req.body.retentionDays || 365;
    
    if (retentionDays < 30) {
      return res.status(400).json({ error: 'Retention period must be at least 30 days' });
    }

    const deletedCount = await auditService.cleanupOldLogs(tenantId, retentionDays);

    // Log the cleanup operation
    await logAuditEvent(req, AUDIT_ACTIONS.SYSTEM_BACKUP, AUDIT_RESOURCES.SYSTEM, undefined, {
      operation: 'audit_cleanup',
      retentionDays,
      deletedCount
    });

    res.json({
      success: true,
      data: {
        deletedCount,
        retentionDays,
        message: `Cleaned up ${deletedCount} audit log entries older than ${retentionDays} days`
      }
    });
  } catch (error) {
    console.error('Error cleaning up audit logs:', error);
    res.status(500).json({ 
      error: 'Failed to cleanup audit logs',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /audit/health - Check audit system health
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const health = await auditService.healthCheck();
    
    res.status(health.healthy ? 200 : 503).json({
      success: health.healthy,
      data: health
    });
  } catch (error) {
    console.error('Error checking audit health:', error);
    res.status(503).json({ 
      success: false,
      data: {
        healthy: false,
        message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    });
  }
});

/**
 * GET /audit/stats - Get audit statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const tenantId = req.auditContext?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    // Check permissions
    if (!req.user?.permissions?.some(p => p.name === 'audit:read')) {
      await logAuditEvent(req, AUDIT_ACTIONS.UNAUTHORIZED_ACCESS_ATTEMPT, AUDIT_RESOURCES.SYSTEM);
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const days = req.query.days ? parseInt(req.query.days as string) : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const report = await auditService.generateReport({
      tenantId,
      startDate,
      limit: 10000
    });

    // Calculate additional statistics
    const stats = {
      totalEvents: report.totalEntries,
      timeRange: {
        days,
        start: startDate,
        end: new Date()
      },
      breakdown: {
        actions: report.summary.actionBreakdown,
        resources: report.summary.resourceBreakdown,
        users: report.summary.userBreakdown
      },
      topActions: Object.entries(report.summary.actionBreakdown)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10),
      topResources: Object.entries(report.summary.resourceBreakdown)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10),
      mostActiveUsers: Object.entries(report.summary.userBreakdown)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting audit stats:', error);
    res.status(500).json({ 
      error: 'Failed to get audit statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;