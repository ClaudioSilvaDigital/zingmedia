import { Router, Request, Response } from 'express';
import { SystemIntegrationService } from '../services/system-integration';
import { Pool } from 'pg';
import { Redis } from 'ioredis';

export function createSystemRoutes(db: Pool, redis: Redis): Router {
  const router = Router();
  const systemIntegration = new SystemIntegrationService(db, redis);

  /**
   * POST /system/workflow/execute - Execute end-to-end content workflow
   */
  router.post('/workflow/execute', async (req: Request, res: Response) => {
    try {
      const { briefingId, contentRequest } = req.body;

      if (!briefingId || !contentRequest) {
        return res.status(400).json({ 
          error: 'Missing required fields: briefingId, contentRequest' 
        });
      }

      if (!contentRequest.title || !contentRequest.contentType || !contentRequest.platforms) {
        return res.status(400).json({ 
          error: 'contentRequest must include: title, contentType, platforms' 
        });
      }

      const result = await systemIntegration.executeEndToEndWorkflow(
        briefingId,
        contentRequest,
        req.tenantContext
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('End-to-end workflow execution failed:', error);
      res.status(500).json({ 
        error: 'Failed to execute workflow',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /system/health - Get comprehensive system health
   */
  router.get('/health', async (req: Request, res: Response) => {
    try {
      const health = await systemIntegration.getSystemHealth();
      
      res.status(health.healthy ? 200 : 503).json({
        success: health.healthy,
        data: health
      });
    } catch (error) {
      console.error('System health check failed:', error);
      res.status(503).json({ 
        success: false,
        error: 'Health check failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /system/metrics - Get system metrics and statistics
   */
  router.get('/metrics', async (req: Request, res: Response) => {
    try {
      const metrics = await systemIntegration.getSystemMetrics(req.tenantContext);
      
      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      console.error('System metrics retrieval failed:', error);
      res.status(500).json({ 
        error: 'Failed to get system metrics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /system/initialize - Initialize system components
   */
  router.post('/initialize', async (req: Request, res: Response) => {
    try {
      // Check if user has admin permissions
      if (!req.user?.permissions?.some(p => p.name === 'system:admin')) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      await systemIntegration.initialize();
      
      res.json({
        success: true,
        message: 'System components initialized successfully'
      });
    } catch (error) {
      console.error('System initialization failed:', error);
      res.status(500).json({ 
        error: 'Failed to initialize system',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /system/shutdown - Graceful system shutdown
   */
  router.post('/shutdown', async (req: Request, res: Response) => {
    try {
      // Check if user has admin permissions
      if (!req.user?.permissions?.some(p => p.name === 'system:admin')) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      await systemIntegration.shutdown();
      
      res.json({
        success: true,
        message: 'System shutdown completed'
      });
    } catch (error) {
      console.error('System shutdown failed:', error);
      res.status(500).json({ 
        error: 'Failed to shutdown system',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /system/status - Get basic system status
   */
  router.get('/status', async (req: Request, res: Response) => {
    try {
      const status = {
        service: 'content-automation-platform',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        tenant: req.tenantContext?.tenant?.name || 'unknown',
        user: req.user?.email || 'anonymous'
      };

      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      console.error('System status check failed:', error);
      res.status(500).json({ 
        error: 'Failed to get system status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}

export default createSystemRoutes;