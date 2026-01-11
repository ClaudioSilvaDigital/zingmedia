import * as nodemailer from 'nodemailer';
import { emailTemplateService } from './email-templates';
import { brandingService } from './branding';

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface SendEmailOptions {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class TransactionalEmailService {
  private transporter: nodemailer.Transporter | null = null;
  private defaultConfig: EmailConfig;

  constructor() {
    // Default configuration - can be overridden by environment variables
    this.defaultConfig = {
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || ''
      }
    };

    this.initializeTransporter();
  }

  /**
   * Initialize email transporter
   */
  private initializeTransporter(): void {
    try {
      this.transporter = nodemailer.createTransport({
        host: this.defaultConfig.host,
        port: this.defaultConfig.port,
        secure: this.defaultConfig.secure,
        auth: this.defaultConfig.auth,
        // Additional options for better deliverability
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        rateDelta: 1000,
        rateLimit: 10
      });

      console.log('Email transporter initialized successfully');
    } catch (error) {
      console.error('Failed to initialize email transporter:', error);
    }
  }

  /**
   * Send branded email using template
   */
  async sendBrandedEmail(
    tenantId: string,
    templateName: string,
    options: SendEmailOptions,
    variables: Record<string, any> = {}
  ): Promise<EmailSendResult> {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      // Render the branded email template
      const renderedTemplate = await emailTemplateService.renderEmailTemplate(
        templateName,
        tenantId,
        variables
      );

      if (!renderedTemplate) {
        throw new Error(`Email template '${templateName}' not found for tenant ${tenantId}`);
      }

      // Get brand configuration for sender info
      const brandConfig = await brandingService.getBrandConfig(tenantId);
      const fromName = brandConfig?.companyName || 'Content Automation Platform';
      const fromEmail = process.env.SMTP_FROM_EMAIL || this.defaultConfig.auth.user;

      // Prepare email options
      const mailOptions = {
        from: `${fromName} <${fromEmail}>`,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined,
        bcc: options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc) : undefined,
        replyTo: options.replyTo,
        subject: renderedTemplate.subject,
        html: renderedTemplate.htmlContent,
        text: renderedTemplate.textContent,
        attachments: options.attachments
      };

      // Send email
      const result = await this.transporter.sendMail(mailOptions);

      // Log successful send
      await this.logEmailEvent(tenantId, templateName, options.to, 'sent', {
        messageId: result.messageId,
        subject: renderedTemplate.subject
      });

      return {
        success: true,
        messageId: result.messageId
      };

    } catch (error) {
      console.error('Error sending branded email:', error);

      // Log failed send
      await this.logEmailEvent(tenantId, templateName, options.to, 'failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Send welcome email to new user
   */
  async sendWelcomeEmail(
    tenantId: string,
    userEmail: string,
    userName: string,
    loginUrl?: string
  ): Promise<EmailSendResult> {
    return this.sendBrandedEmail(
      tenantId,
      'welcome',
      { to: userEmail },
      {
        userName,
        loginUrl: loginUrl || process.env.APP_URL || 'https://app.example.com'
      }
    );
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    tenantId: string,
    userEmail: string,
    userName: string,
    resetUrl: string
  ): Promise<EmailSendResult> {
    return this.sendBrandedEmail(
      tenantId,
      'password-reset',
      { to: userEmail },
      {
        userName,
        resetUrl
      }
    );
  }

  /**
   * Send content approval notification
   */
  async sendContentApprovedEmail(
    tenantId: string,
    userEmail: string,
    userName: string,
    contentTitle: string,
    approverName: string
  ): Promise<EmailSendResult> {
    return this.sendBrandedEmail(
      tenantId,
      'content-approved',
      { to: userEmail },
      {
        userName,
        contentTitle,
        approverName
      }
    );
  }

  /**
   * Send content rejection notification
   */
  async sendContentRejectedEmail(
    tenantId: string,
    userEmail: string,
    userName: string,
    contentTitle: string,
    rejectionReason: string
  ): Promise<EmailSendResult> {
    return this.sendBrandedEmail(
      tenantId,
      'content-rejected',
      { to: userEmail },
      {
        userName,
        contentTitle,
        rejectionReason
      }
    );
  }

  /**
   * Send bulk emails (for notifications, newsletters, etc.)
   */
  async sendBulkBrandedEmails(
    tenantId: string,
    templateName: string,
    recipients: Array<{
      email: string;
      variables: Record<string, any>;
    }>,
    commonOptions: Omit<SendEmailOptions, 'to'> = {}
  ): Promise<Array<{ email: string; result: EmailSendResult }>> {
    const results: Array<{ email: string; result: EmailSendResult }> = [];

    // Send emails in batches to avoid overwhelming the SMTP server
    const batchSize = 10;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (recipient) => {
        const result = await this.sendBrandedEmail(
          tenantId,
          templateName,
          { ...commonOptions, to: recipient.email },
          recipient.variables
        );

        return { email: recipient.email, result };
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add delay between batches to respect rate limits
      if (i + batchSize < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Test email configuration
   */
  async testEmailConfiguration(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      await this.transporter.verify();
      return { success: true };
    } catch (error) {
      console.error('Email configuration test failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Update email configuration for a tenant (if using tenant-specific SMTP)
   */
  async updateTenantEmailConfig(tenantId: string, config: EmailConfig): Promise<void> {
    // In a full implementation, this would store tenant-specific email configurations
    // For now, we'll use the default configuration
    console.log(`Email configuration updated for tenant: ${tenantId}`);
  }

  /**
   * Get email delivery statistics for a tenant
   */
  async getEmailStats(tenantId: string, days: number = 30): Promise<{
    sent: number;
    failed: number;
    templates: Record<string, { sent: number; failed: number }>;
  }> {
    // In a full implementation, this would query the audit logs
    // For now, return mock data
    return {
      sent: 0,
      failed: 0,
      templates: {}
    };
  }

  /**
   * Log email events for audit and analytics
   */
  private async logEmailEvent(
    tenantId: string,
    templateName: string,
    recipients: string | string[],
    status: 'sent' | 'failed',
    details: Record<string, any> = {}
  ): Promise<void> {
    try {
      // In a full implementation, this would use the audit logging system
      console.log(`Email ${status}:`, {
        tenantId,
        templateName,
        recipients: Array.isArray(recipients) ? recipients : [recipients],
        status,
        details,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error logging email event:', error);
      // Don't throw error for logging failures
    }
  }

  /**
   * Close email transporter connections
   */
  async close(): Promise<void> {
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
      console.log('Email transporter closed');
    }
  }
}

export const transactionalEmailService = new TransactionalEmailService();