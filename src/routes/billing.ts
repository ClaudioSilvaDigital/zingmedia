import { Router, Request, Response } from 'express';
import { billingService } from '../services/billing';
import { aiBillingService } from '../services/ai-billing';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';

const router = Router();

// Apply authentication and tenant middleware to all routes
router.use(authMiddleware);
router.use(tenantMiddleware);

/**
 * Get billing plans
 */
router.get('/plans', async (req: Request, res: Response) => {
  try {
    // In a real implementation, you'd fetch from database
    const plans = [
      {
        id: 'basic',
        name: 'Basic',
        description: 'Perfect for small agencies getting started',
        type: 'subscription',
        pricing: { monthlyPrice: 99.00, creditPrice: 0.10, currency: 'BRL' },
        limits: { monthlyCredits: 1000, dailyCredits: 50, maxUsers: 5, maxClients: 10 },
        features: ['content_generation', 'basic_analytics', 'single_platform_publishing']
      },
      {
        id: 'premium',
        name: 'Premium',
        description: 'Ideal for growing agencies with multiple clients',
        type: 'subscription',
        pricing: { monthlyPrice: 299.00, creditPrice: 0.08, currency: 'BRL' },
        limits: { monthlyCredits: 10000, dailyCredits: 500, maxUsers: 25, maxClients: 50 },
        features: ['content_generation', 'advanced_analytics', 'multi_platform_publishing', 'white_label']
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        description: 'For large agencies requiring maximum scale',
        type: 'subscription',
        pricing: { monthlyPrice: 999.00, creditPrice: 0.05, currency: 'BRL' },
        limits: { monthlyCredits: 100000, dailyCredits: 5000, maxUsers: -1, maxClients: -1 },
        features: ['content_generation', 'enterprise_analytics', 'multi_platform_publishing', 'api_access']
      }
    ];

    res.json({ success: true, data: plans });
  } catch (error) {
    console.error('Error getting billing plans:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get billing plans' 
    });
  }
});

/**
 * Create subscription
 */
router.post('/subscriptions', async (req: Request, res: Response) => {
  try {
    const { planId, trialDays } = req.body;
    const tenantId = req.tenantContext!.tenantId;

    if (!planId) {
      return res.status(400).json({
        success: false,
        error: 'Plan ID is required'
      });
    }

    const subscription = await billingService.createSubscription(
      tenantId,
      planId,
      trialDays
    );

    res.status(201).json({
      success: true,
      data: subscription
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create subscription'
    });
  }
});

/**
 * Get credit balance
 */
router.get('/credits/balance', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const balance = await billingService.getCreditBalance(tenantId);

    res.json({
      success: true,
      data: balance
    });
  } catch (error) {
    console.error('Error getting credit balance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get credit balance'
    });
  }
});

/**
 * Add credits to balance
 */
router.post('/credits/add', async (req: Request, res: Response) => {
  try {
    const { credits, reason } = req.body;
    const tenantId = req.tenantContext!.tenantId;

    if (!credits || credits <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid credit amount is required'
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Reason is required'
      });
    }

    const balance = await billingService.addCredits(tenantId, credits, reason);

    res.json({
      success: true,
      data: balance
    });
  } catch (error) {
    console.error('Error adding credits:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add credits'
    });
  }
});

/**
 * Get usage summary
 */
router.get('/usage', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const { startDate, endDate } = req.query;

    let timeRange;
    if (startDate && endDate) {
      timeRange = {
        start: new Date(startDate as string),
        end: new Date(endDate as string)
      };
    }

    const usage = await aiBillingService.getUsageSummary(tenantId, timeRange);

    res.json({
      success: true,
      data: usage
    });
  } catch (error) {
    console.error('Error getting usage summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get usage summary'
    });
  }
});

/**
 * Generate invoice
 */
router.post('/invoices/generate', async (req: Request, res: Response) => {
  try {
    const { periodStart, periodEnd } = req.body;
    const tenantId = req.tenantContext!.tenantId;

    if (!periodStart || !periodEnd) {
      return res.status(400).json({
        success: false,
        error: 'Period start and end dates are required'
      });
    }

    const invoice = await billingService.generateInvoice(
      tenantId,
      new Date(periodStart),
      new Date(periodEnd)
    );

    res.status(201).json({
      success: true,
      data: invoice
    });
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate invoice'
    });
  }
});

/**
 * Generate Nota Fiscal
 */
router.post('/invoices/:invoiceId/nota-fiscal', async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;

    if (!invoiceId) {
      return res.status(400).json({
        success: false,
        error: 'Invoice ID is required'
      });
    }

    const notaFiscal = await billingService.generateNotaFiscal(invoiceId);

    res.status(201).json({
      success: true,
      data: notaFiscal
    });
  } catch (error) {
    console.error('Error generating Nota Fiscal:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate Nota Fiscal'
    });
  }
});

/**
 * Get billing history
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const limit = parseInt(req.query.limit as string) || 12;

    const history = await billingService.getBillingHistory(tenantId, limit);

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Error getting billing history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get billing history'
    });
  }
});

/**
 * Download Nota Fiscal PDF
 */
router.get('/nota-fiscal/:notaFiscalId/pdf', async (req: Request, res: Response) => {
  try {
    const { notaFiscalId } = req.params;
    
    // Import the nota fiscal service
    const { notaFiscalService } = await import('../services/nota-fiscal');
    
    // Generate PDF
    const pdfBuffer = await notaFiscalService.generatePDF(notaFiscalId);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="nota-fiscal-${notaFiscalId}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error getting Nota Fiscal PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get Nota Fiscal PDF'
    });
  }
});

/**
 * Download Nota Fiscal XML
 */
router.get('/nota-fiscal/:notaFiscalId/xml', async (req: Request, res: Response) => {
  try {
    const { notaFiscalId } = req.params;
    
    // Import the nota fiscal service
    const { notaFiscalService } = await import('../services/nota-fiscal');
    
    // Get XML content
    const xmlContent = await notaFiscalService.getXMLContent(notaFiscalId);
    
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="nota-fiscal-${notaFiscalId}.xml"`);
    res.send(xmlContent);
  } catch (error) {
    console.error('Error getting Nota Fiscal XML:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get Nota Fiscal XML'
    });
  }
});

/**
 * Get Nota Fiscals for tenant
 */
router.get('/nota-fiscal', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const limit = parseInt(req.query.limit as string) || 50;
    
    // Import the nota fiscal service
    const { notaFiscalService } = await import('../services/nota-fiscal');
    
    const notaFiscals = await notaFiscalService.getNotaFiscalsByTenant(tenantId, limit);
    
    res.json({
      success: true,
      data: notaFiscals
    });
  } catch (error) {
    console.error('Error getting Nota Fiscals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get Nota Fiscals'
    });
  }
});

/**
 * Cancel Nota Fiscal
 */
router.post('/nota-fiscal/:notaFiscalId/cancel', async (req: Request, res: Response) => {
  try {
    const { notaFiscalId } = req.params;
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Cancellation reason is required'
      });
    }
    
    // Import the nota fiscal service
    const { notaFiscalService } = await import('../services/nota-fiscal');
    
    await notaFiscalService.cancelNotaFiscal(notaFiscalId, reason);
    
    res.json({
      success: true,
      message: 'Nota Fiscal cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling Nota Fiscal:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel Nota Fiscal'
    });
  }
});

/**
 * Get billing dashboard data
 */
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantContext!.tenantId;

    // Get current credit balance
    const creditBalance = await billingService.getCreditBalance(tenantId);

    // Get usage summary for current month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    const monthlyUsage = await aiBillingService.getUsageSummary(tenantId, {
      start: monthStart,
      end: monthEnd
    });

    // Get recent billing history
    const recentHistory = await billingService.getBillingHistory(tenantId, 3);

    const dashboard = {
      creditBalance,
      monthlyUsage,
      recentHistory,
      alerts: {
        lowCredits: creditBalance.balance < 100,
        approachingLimit: creditBalance.monthlyUsage > (creditBalance.monthlyLimit * 0.8)
      }
    };

    res.json({
      success: true,
      data: dashboard
    });
  } catch (error) {
    console.error('Error getting billing dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get billing dashboard'
    });
  }
});

/**
 * Process monthly billing (admin only)
 */
router.post('/admin/process-monthly', async (req: Request, res: Response) => {
  try {
    // Check if user has admin permissions
    const user = req.tenantContext!.user;
    const hasAdminRole = user.roles.some(role => role.name === 'Platform Admin');
    
    if (!hasAdminRole) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    await billingService.processMonthlyBilling();

    res.json({
      success: true,
      message: 'Monthly billing processed successfully'
    });
  } catch (error) {
    console.error('Error processing monthly billing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process monthly billing'
    });
  }
});

/**
 * Reset daily usage (admin only)
 */
router.post('/admin/reset-daily', async (req: Request, res: Response) => {
  try {
    // Check if user has admin permissions
    const user = req.tenantContext!.user;
    const hasAdminRole = user.roles.some(role => role.name === 'Platform Admin');
    
    if (!hasAdminRole) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    await billingService.resetDailyUsage();

    res.json({
      success: true,
      message: 'Daily usage reset successfully'
    });
  } catch (error) {
    console.error('Error resetting daily usage:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset daily usage'
    });
  }
});

export default router;