import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { db } from './config/database';
import { redis } from './config/redis';
import { authenticateToken } from './middleware/auth';
import { tenantContextMiddleware } from './middleware/tenant';
// Import middleware and routes
import { brandingMiddleware } from './middleware/branding';
import { authService } from './services/auth';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Custom domain resolution (must be early in middleware chain)
app.use(customDomainMiddleware);

// Branding injection middleware
app.use(injectBrandingMiddleware);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'content-automation-platform'
  });
});

// Comprehensive system health check
app.get('/health/detailed', async (req, res) => {
  try {
    const healthChecks = {
      database: false,
      redis: false,
      services: {
        aiHub: false,
        emailService: false,
        calendarScheduler: false
      },
      timestamp: new Date().toISOString()
    };

    // Check database connection
    try {
      await db.query('SELECT 1');
      healthChecks.database = true;
    } catch (error) {
      console.error('Database health check failed:', error);
    }

    // Check Redis connection
    try {
      await redis.ping();
      healthChecks.redis = true;
    } catch (error) {
      console.error('Redis health check failed:', error);
    }

    // Check AI Hub
    try {
      const { AIIntegrationHub } = await import('./services/ai-hub');
      const aiHub = new AIIntegrationHub(db);
      const providers = await aiHub.getActiveProviders();
      healthChecks.services.aiHub = providers.length > 0;
    } catch (error) {
      console.error('AI Hub health check failed:', error);
    }

    // Check Email Service
    try {
      const result = await transactionalEmailService.testEmailConfiguration();
      healthChecks.services.emailService = result.success;
    } catch (error) {
      console.error('Email service health check failed:', error);
    }

    // Check Calendar Scheduler
    try {
      healthChecks.services.calendarScheduler = calendarScheduler !== undefined;
    } catch (error) {
      console.error('Calendar scheduler health check failed:', error);
    }

    const overallHealth = healthChecks.database && 
                         healthChecks.redis && 
                         Object.values(healthChecks.services).every(status => status);

    res.status(overallHealth ? 200 : 503).json({
      healthy: overallHealth,
      checks: healthChecks
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      healthy: false,
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// API routes
app.get('/api/v1/status', (req, res) => {
  res.json({ 
    message: 'Content Automation Platform API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Protected routes (require authentication)
app.use('/api/v1/protected', authenticateToken);
app.use('/api/v1/protected', tenantContextMiddleware);
app.use('/api/v1/protected', brandingMiddleware);

// Add audit middleware to all protected routes
import { auditMiddleware } from './middleware/audit';
app.use('/api/v1/protected', auditMiddleware);

// Branding routes
app.use('/api/v1/protected/branding', brandingRoutes);

// Briefing routes
app.use('/api/v1/protected/briefings', createBriefingRouter(db));

// Content routes
import { createContentRouter } from './routes/content';
app.use('/api/v1/protected/content', createContentRouter(db));

// Video script routes
import videoScriptRoutes from './routes/video-script';
app.use('/api/v1/protected/video-scripts', videoScriptRoutes);

// Best practices routes
import { createBestPracticesRouter } from './routes/best-practices';
app.use('/api/v1/protected/best-practices', createBestPracticesRouter(db));

// Calendar routes
import { createCalendarRoutes } from './routes/calendar';
app.use('/api/v1/protected/calendar', createCalendarRoutes(db));

// Analytics routes
import analyticsRoutes from './routes/analytics';
app.use('/api/v1/protected/analytics', analyticsRoutes);

// Billing routes
import billingRoutes from './routes/billing';
app.use('/api/v1/protected/billing', billingRoutes);

// Workflow routes
import { createWorkflowRoutes } from './routes/workflow';
app.use('/api/v1/protected/workflows', createWorkflowRoutes(db));

// Audit routes
import auditRoutes from './routes/audit';
app.use('/api/v1/protected/audit', auditRoutes);

// LGPD compliance routes
import lgpdRoutes from './routes/lgpd';
app.use('/api/v1/protected/lgpd', lgpdRoutes);

// System integration routes
import { createSystemRoutes } from './routes/system';
app.use('/api/v1/protected/system', createSystemRoutes(db, redis));

// Initialize calendar scheduler
import { CalendarSchedulerService } from './services/calendar-scheduler';
const calendarScheduler = new CalendarSchedulerService(db);

app.get('/api/v1/protected/profile', (req, res) => {
  res.json({ 
    user: req.user,
    tenant: req.tenantContext?.tenant
  });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Graceful shutdown
const gracefulShutdown = async (): Promise<void> => {
  console.log('Shutting down gracefully...');
  
  try {
    // Shutdown system integration service
    if ((global as any).systemIntegration) {
      await (global as any).systemIntegration.shutdown();
    }

    await transactionalEmailService.close();
    await redis.disconnect();
    await db.close();
    console.log('All connections closed');
  } catch (error) {
    console.error('Error during shutdown:', error);
  }
  
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const startServer = async (): Promise<void> => {
  try {
    // Test database connection
    await db.query('SELECT 1');
    console.log('Database connected successfully');

    // Test Redis connection
    await redis.connect();
    console.log('Redis connected successfully');

    // Initialize email templates table
    await emailTemplateService.initializeEmailTemplates();
    console.log('Email templates initialized');

    // Initialize AI Hub and providers
    try {
      const { AIIntegrationHub } = await import('./services/ai-hub');
      const aiHub = new AIIntegrationHub(db);
      
      // Test AI provider connectivity
      const providers = await aiHub.getActiveProviders();
      console.log(`AI Hub initialized with ${providers.length} active providers`);
      
      // Perform health checks on providers
      for (const provider of providers) {
        try {
          const healthCheck = await aiHub.testConnectivity(provider.id);
          console.log(`Provider ${provider.name}: ${healthCheck.isHealthy ? 'healthy' : 'unhealthy'}`);
        } catch (error) {
          console.warn(`Provider ${provider.name} health check failed:`, error);
        }
      }
    } catch (error) {
      console.warn('AI Hub initialization failed:', error);
    }

    // Initialize calendar scheduler
    try {
      await calendarScheduler.initialize();
      console.log('Calendar scheduler initialized');
    } catch (error) {
      console.warn('Calendar scheduler initialization failed:', error);
    }

    // Initialize system integration service
    try {
      const { SystemIntegrationService } = await import('./services/system-integration');
      const systemIntegration = new SystemIntegrationService(db, redis);
      await systemIntegration.initialize();
      console.log('System integration service initialized');
      
      // Store reference for graceful shutdown
      (global as any).systemIntegration = systemIntegration;
    } catch (error) {
      console.warn('System integration initialization failed:', error);
    }

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('All systems initialized successfully');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();