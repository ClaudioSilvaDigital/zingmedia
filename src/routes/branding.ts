import { Router, Request, Response } from 'express';
import { brandingService } from '../services/branding';
import { emailTemplateService } from '../services/email-templates';
import { transactionalEmailService } from '../services/email';
import { authenticateToken } from '../middleware/auth';
import { tenantContextMiddleware } from '../middleware/tenant';
import { TenantContext, BrandConfig } from '../types';

const router = Router();

// Apply authentication and tenant middleware to all routes
router.use(authenticateToken);
router.use(tenantContextMiddleware);

/**
 * Get brand configuration for current tenant
 */
router.get('/config', async (req: Request, res: Response) => {
  try {
    const tenantContext = (req as any).tenantContext as TenantContext;
    
    const brandConfig = await brandingService.getBrandConfig(tenantContext.tenantId);
    
    if (!brandConfig) {
      return res.status(404).json({ error: 'Brand configuration not found' });
    }

    res.json({ brandConfig });
  } catch (error) {
    console.error('Error getting brand config:', error);
    res.status(500).json({ error: 'Failed to get brand configuration' });
  }
});

/**
 * Update brand configuration for current tenant
 */
router.put('/config', async (req: Request, res: Response) => {
  try {
    const tenantContext = (req as any).tenantContext as TenantContext;
    const brandConfig: Partial<BrandConfig> = req.body;

    await brandingService.updateBrandConfig(tenantContext.tenantId, brandConfig);

    res.json({ message: 'Brand configuration updated successfully' });
  } catch (error) {
    console.error('Error updating brand config:', error);
    res.status(500).json({ error: 'Failed to update brand configuration' });
  }
});

/**
 * Generate theme CSS for current tenant
 */
router.get('/theme.css', async (req: Request, res: Response) => {
  try {
    const tenantContext = (req as any).tenantContext as TenantContext;
    
    const brandConfig = await brandingService.getBrandConfig(tenantContext.tenantId);
    
    if (!brandConfig) {
      return res.status(404).json({ error: 'Brand configuration not found' });
    }

    const themeCSS = brandingService.generateThemeCSS(brandConfig);

    res.setHeader('Content-Type', 'text/css');
    res.send(themeCSS);
  } catch (error) {
    console.error('Error generating theme CSS:', error);
    res.status(500).json({ error: 'Failed to generate theme CSS' });
  }
});

/**
 * Configure custom domain for current tenant
 */
router.post('/domain', async (req: Request, res: Response) => {
  try {
    const tenantContext = (req as any).tenantContext as TenantContext;
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }

    await brandingService.configureCustomDomain(tenantContext.tenantId, domain);

    res.json({ message: 'Custom domain configured successfully' });
  } catch (error) {
    console.error('Error configuring custom domain:', error);
    res.status(500).json({ error: 'Failed to configure custom domain' });
  }
});

/**
 * Get branded assets for current tenant
 */
router.get('/assets', async (req: Request, res: Response) => {
  try {
    const tenantContext = (req as any).tenantContext as TenantContext;
    
    const assets = await brandingService.generateBrandedAssets(tenantContext.tenantId);

    res.json({ assets });
  } catch (error) {
    console.error('Error getting branded assets:', error);
    res.status(500).json({ error: 'Failed to get branded assets' });
  }
});

/**
 * Get all email templates for current tenant
 */
router.get('/email-templates', async (req: Request, res: Response) => {
  try {
    const tenantContext = (req as any).tenantContext as TenantContext;
    
    const templates = await emailTemplateService.getEmailTemplates(tenantContext.tenantId);

    res.json({ templates });
  } catch (error) {
    console.error('Error getting email templates:', error);
    res.status(500).json({ error: 'Failed to get email templates' });
  }
});

/**
 * Get specific email template
 */
router.get('/email-templates/:templateId', async (req: Request, res: Response) => {
  try {
    const tenantContext = (req as any).tenantContext as TenantContext;
    const { templateId } = req.params;
    
    const template = await emailTemplateService.getEmailTemplate(templateId, tenantContext.tenantId);

    if (!template) {
      return res.status(404).json({ error: 'Email template not found' });
    }

    res.json({ template });
  } catch (error) {
    console.error('Error getting email template:', error);
    res.status(500).json({ error: 'Failed to get email template' });
  }
});

/**
 * Create new email template
 */
router.post('/email-templates', async (req: Request, res: Response) => {
  try {
    const tenantContext = (req as any).tenantContext as TenantContext;
    const templateData = {
      ...req.body,
      tenantId: tenantContext.tenantId
    };
    
    const template = await emailTemplateService.createEmailTemplate(templateData);

    res.status(201).json({ template });
  } catch (error) {
    console.error('Error creating email template:', error);
    res.status(500).json({ error: 'Failed to create email template' });
  }
});

/**
 * Update email template
 */
router.put('/email-templates/:templateId', async (req: Request, res: Response) => {
  try {
    const tenantContext = (req as any).tenantContext as TenantContext;
    const { templateId } = req.params;
    
    await emailTemplateService.updateEmailTemplate(templateId, tenantContext.tenantId, req.body);

    res.json({ message: 'Email template updated successfully' });
  } catch (error) {
    console.error('Error updating email template:', error);
    res.status(500).json({ error: 'Failed to update email template' });
  }
});

/**
 * Delete email template
 */
router.delete('/email-templates/:templateId', async (req: Request, res: Response) => {
  try {
    const tenantContext = (req as any).tenantContext as TenantContext;
    const { templateId } = req.params;
    
    await emailTemplateService.deleteEmailTemplate(templateId, tenantContext.tenantId);

    res.json({ message: 'Email template deleted successfully' });
  } catch (error) {
    console.error('Error deleting email template:', error);
    res.status(500).json({ error: 'Failed to delete email template' });
  }
});

/**
 * Render email template with variables
 */
router.post('/email-templates/:templateName/render', async (req: Request, res: Response) => {
  try {
    const tenantContext = (req as any).tenantContext as TenantContext;
    const { templateName } = req.params;
    const { variables = {} } = req.body;
    
    const renderedTemplate = await emailTemplateService.renderEmailTemplate(
      templateName, 
      tenantContext.tenantId, 
      variables
    );

    if (!renderedTemplate) {
      return res.status(404).json({ error: 'Email template not found' });
    }

    res.json({ renderedTemplate });
  } catch (error) {
    console.error('Error rendering email template:', error);
    res.status(500).json({ error: 'Failed to render email template' });
  }
});

/**
 * Create default email templates for current tenant
 */
router.post('/email-templates/defaults', async (req: Request, res: Response) => {
  try {
    const tenantContext = (req as any).tenantContext as TenantContext;
    
    await emailTemplateService.createDefaultTemplates(tenantContext.tenantId);

    res.json({ message: 'Default email templates created successfully' });
  } catch (error) {
    console.error('Error creating default email templates:', error);
    res.status(500).json({ error: 'Failed to create default email templates' });
  }
});

/**
 * Send test email using template
 */
router.post('/email/test', async (req: Request, res: Response) => {
  try {
    const tenantContext = (req as any).tenantContext as TenantContext;
    const { templateName, email, variables = {} } = req.body;

    if (!templateName || !email) {
      return res.status(400).json({ error: 'Template name and email are required' });
    }

    const result = await transactionalEmailService.sendBrandedEmail(
      tenantContext.tenantId,
      templateName,
      { to: email },
      variables
    );

    if (result.success) {
      res.json({ message: 'Test email sent successfully', messageId: result.messageId });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

/**
 * Send welcome email
 */
router.post('/email/welcome', async (req: Request, res: Response) => {
  try {
    const tenantContext = (req as any).tenantContext as TenantContext;
    const { userEmail, userName, loginUrl } = req.body;

    if (!userEmail || !userName) {
      return res.status(400).json({ error: 'User email and name are required' });
    }

    const result = await transactionalEmailService.sendWelcomeEmail(
      tenantContext.tenantId,
      userEmail,
      userName,
      loginUrl
    );

    if (result.success) {
      res.json({ message: 'Welcome email sent successfully', messageId: result.messageId });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error sending welcome email:', error);
    res.status(500).json({ error: 'Failed to send welcome email' });
  }
});

/**
 * Send password reset email
 */
router.post('/email/password-reset', async (req: Request, res: Response) => {
  try {
    const tenantContext = (req as any).tenantContext as TenantContext;
    const { userEmail, userName, resetUrl } = req.body;

    if (!userEmail || !userName || !resetUrl) {
      return res.status(400).json({ error: 'User email, name, and reset URL are required' });
    }

    const result = await transactionalEmailService.sendPasswordResetEmail(
      tenantContext.tenantId,
      userEmail,
      userName,
      resetUrl
    );

    if (result.success) {
      res.json({ message: 'Password reset email sent successfully', messageId: result.messageId });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error sending password reset email:', error);
    res.status(500).json({ error: 'Failed to send password reset email' });
  }
});

/**
 * Send content notification emails
 */
router.post('/email/content-notification', async (req: Request, res: Response) => {
  try {
    const tenantContext = (req as any).tenantContext as TenantContext;
    const { type, userEmail, userName, contentTitle, approverName, rejectionReason } = req.body;

    if (!type || !userEmail || !userName || !contentTitle) {
      return res.status(400).json({ error: 'Type, user email, name, and content title are required' });
    }

    let result;
    if (type === 'approved') {
      if (!approverName) {
        return res.status(400).json({ error: 'Approver name is required for approved notifications' });
      }
      result = await transactionalEmailService.sendContentApprovedEmail(
        tenantContext.tenantId,
        userEmail,
        userName,
        contentTitle,
        approverName
      );
    } else if (type === 'rejected') {
      if (!rejectionReason) {
        return res.status(400).json({ error: 'Rejection reason is required for rejected notifications' });
      }
      result = await transactionalEmailService.sendContentRejectedEmail(
        tenantContext.tenantId,
        userEmail,
        userName,
        contentTitle,
        rejectionReason
      );
    } else {
      return res.status(400).json({ error: 'Invalid notification type. Must be "approved" or "rejected"' });
    }

    if (result.success) {
      res.json({ message: `Content ${type} email sent successfully`, messageId: result.messageId });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error sending content notification email:', error);
    res.status(500).json({ error: 'Failed to send content notification email' });
  }
});

/**
 * Get email delivery statistics
 */
router.get('/email/stats', async (req: Request, res: Response) => {
  try {
    const tenantContext = (req as any).tenantContext as TenantContext;
    const days = parseInt(req.query.days as string) || 30;
    
    const stats = await transactionalEmailService.getEmailStats(tenantContext.tenantId, days);

    res.json({ stats });
  } catch (error) {
    console.error('Error getting email stats:', error);
    res.status(500).json({ error: 'Failed to get email statistics' });
  }
});

/**
 * Test email configuration
 */
router.get('/email/test-config', async (req: Request, res: Response) => {
  try {
    const result = await transactionalEmailService.testEmailConfiguration();

    if (result.success) {
      res.json({ message: 'Email configuration is working correctly' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error testing email configuration:', error);
    res.status(500).json({ error: 'Failed to test email configuration' });
  }
});

export default router;