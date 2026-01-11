import { Request, Response, NextFunction } from 'express';
import { auditService, AuditContext } from '../services/audit';

// Extend Express Request to include audit context
declare global {
  namespace Express {
    interface Request {
      auditContext?: AuditContext;
    }
  }
}

/**
 * Middleware to set up audit context for requests
 */
export function auditContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Extract tenant ID from various sources
  const tenantId = req.headers['x-tenant-id'] as string || 
                   req.body?.tenantId || 
                   req.query?.tenantId as string ||
                   req.user?.tenantId;

  // Extract user ID from authenticated user
  const userId = req.user?.id;

  // Extract IP address (handle proxy headers)
  const ipAddress = req.ip || 
                    req.connection.remoteAddress || 
                    req.headers['x-forwarded-for'] as string ||
                    req.headers['x-real-ip'] as string;

  // Extract user agent
  const userAgent = req.headers['user-agent'];

  // Extract session ID if available
  const sessionId = req.sessionID || req.headers['x-session-id'] as string;

  // Set audit context on request
  req.auditContext = {
    tenantId,
    userId,
    ipAddress,
    userAgent,
    sessionId
  };

  next();
}

/**
 * Middleware to automatically log HTTP requests
 */
export function auditRequestMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip audit logging for health checks and static assets
  const skipPaths = ['/health', '/metrics', '/favicon.ico', '/robots.txt'];
  const skipExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'];
  
  const shouldSkip = skipPaths.some(path => req.path.startsWith(path)) ||
                     skipExtensions.some(ext => req.path.endsWith(ext));

  if (shouldSkip) {
    return next();
  }

  // Log the request
  if (req.auditContext?.tenantId) {
    const action = `http_${req.method.toLowerCase()}`;
    const resource = 'http_request';
    const details = {
      method: req.method,
      path: req.path,
      query: req.query,
      headers: {
        'content-type': req.headers['content-type'],
        'accept': req.headers['accept'],
        'referer': req.headers['referer']
      },
      timestamp: new Date().toISOString()
    };

    // Don't await to avoid blocking the request
    auditService.logEvent(
      req.auditContext,
      action,
      resource,
      undefined,
      details
    ).catch(error => {
      console.error('Failed to log audit event:', error);
    });
  }

  next();
}

/**
 * Helper function to log audit events from route handlers
 */
export async function logAuditEvent(
  req: Request,
  action: string,
  resource: string,
  resourceId?: string,
  details: Record<string, any> = {}
): Promise<void> {
  if (!req.auditContext?.tenantId) {
    console.warn('Audit context not available for logging event:', { action, resource, resourceId });
    return;
  }

  await auditService.logEvent(
    req.auditContext,
    action,
    resource,
    resourceId,
    details
  );
}

/**
 * Decorator for automatically logging method calls
 */
export function auditLog(action: string, resource: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const context = this.auditContext || args.find((arg: any) => arg?.auditContext)?.auditContext;
      
      if (context) {
        const details = {
          method: propertyName,
          arguments: args.length,
          timestamp: new Date().toISOString()
        };

        // Log before method execution
        await auditService.logEvent(context, action, resource, undefined, details);
      }

      return method.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * Express error handler that logs errors as audit events
 */
export function auditErrorHandler(error: Error, req: Request, res: Response, next: NextFunction): void {
  // Log the error as an audit event
  if (req.auditContext?.tenantId) {
    const details = {
      error: error.message,
      stack: error.stack,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      timestamp: new Date().toISOString()
    };

    auditService.logEvent(
      req.auditContext,
      'http_error',
      'error',
      undefined,
      details
    ).catch(auditError => {
      console.error('Failed to log error audit event:', auditError);
    });
  }

  next(error);
}

/**
 * Middleware to log successful responses
 */
export function auditResponseMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Override res.json to capture response data
  const originalJson = res.json;
  
  res.json = function (body: any) {
    // Log successful responses (2xx status codes)
    if (req.auditContext?.tenantId && res.statusCode >= 200 && res.statusCode < 300) {
      const action = `http_${req.method.toLowerCase()}_success`;
      const resource = 'http_response';
      const details = {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        responseSize: JSON.stringify(body).length,
        timestamp: new Date().toISOString()
      };

      auditService.logEvent(
        req.auditContext,
        action,
        resource,
        undefined,
        details
      ).catch(error => {
        console.error('Failed to log response audit event:', error);
      });
    }

    return originalJson.call(this, body);
  };

  next();
}

/**
 * Utility to create audit context from service calls
 */
export function createAuditContext(
  tenantId: string,
  userId?: string,
  ipAddress?: string,
  userAgent?: string
): AuditContext {
  return {
    tenantId,
    userId,
    ipAddress,
    userAgent
  };
}

/**
 * Batch audit logger for high-volume operations
 */
export class BatchAuditLogger {
  private batch: Array<{
    context: AuditContext;
    action: string;
    resource: string;
    resourceId?: string;
    details?: Record<string, any>;
  }> = [];
  
  private batchSize: number;
  private flushInterval: number;
  private timer?: NodeJS.Timeout;

  constructor(batchSize: number = 100, flushIntervalMs: number = 5000) {
    this.batchSize = batchSize;
    this.flushInterval = flushIntervalMs;
    this.startFlushTimer();
  }

  /**
   * Add an event to the batch
   */
  add(
    context: AuditContext,
    action: string,
    resource: string,
    resourceId?: string,
    details?: Record<string, any>
  ): void {
    this.batch.push({
      context,
      action,
      resource,
      resourceId,
      details
    });

    if (this.batch.length >= this.batchSize) {
      this.flush();
    }
  }

  /**
   * Flush the current batch
   */
  async flush(): Promise<void> {
    if (this.batch.length === 0) return;

    const events = [...this.batch];
    this.batch = [];

    try {
      await auditService.logBatch(events);
    } catch (error) {
      console.error('Failed to flush audit batch:', error);
      // Re-add events to batch for retry (with limit to prevent memory issues)
      if (this.batch.length < this.batchSize * 2) {
        this.batch.unshift(...events);
      }
    }
  }

  /**
   * Start the automatic flush timer
   */
  private startFlushTimer(): void {
    this.timer = setInterval(() => {
      this.flush().catch(error => {
        console.error('Failed to flush audit batch on timer:', error);
      });
    }, this.flushInterval);
  }

  /**
   * Stop the batch logger and flush remaining events
   */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    await this.flush();
  }
}

// Export singleton batch logger for high-volume operations
export const batchAuditLogger = new BatchAuditLogger();

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  await batchAuditLogger.stop();
});

process.on('SIGINT', async () => {
  await batchAuditLogger.stop();
});