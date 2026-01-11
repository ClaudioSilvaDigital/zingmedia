import { EmailTemplate, BrandConfig } from '../types';
import { db } from '../config/database';
import { brandingService } from './branding';

export class EmailTemplateService {
  /**
   * Create email template table if it doesn't exist
   */
  async initializeEmailTemplates(): Promise<void> {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS public.email_templates (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          subject VARCHAR(500) NOT NULL,
          html_content TEXT NOT NULL,
          text_content TEXT NOT NULL,
          variables JSONB DEFAULT '[]',
          tenant_id UUID NOT NULL REFERENCES public.tenants(id),
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(name, tenant_id)
        );

        CREATE INDEX IF NOT EXISTS idx_email_templates_tenant_id ON public.email_templates(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_email_templates_name ON public.email_templates(name);

        CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON public.email_templates
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      `);

      console.log('Email templates table initialized');
    } catch (error) {
      console.error('Error initializing email templates:', error);
      throw new Error('Failed to initialize email templates');
    }
  }

  /**
   * Create a new email template
   */
  async createEmailTemplate(template: Omit<EmailTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<EmailTemplate> {
    try {
      const result = await db.query(`
        INSERT INTO public.email_templates (name, subject, html_content, text_content, variables, tenant_id, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        template.name,
        template.subject,
        template.htmlContent,
        template.textContent,
        JSON.stringify(template.variables),
        template.tenantId,
        template.isActive
      ]);

      return this.mapDbTemplateToTemplate(result.rows[0]);
    } catch (error) {
      console.error('Error creating email template:', error);
      throw new Error('Failed to create email template');
    }
  }

  /**
   * Get email template by ID
   */
  async getEmailTemplate(templateId: string, tenantId: string): Promise<EmailTemplate | null> {
    try {
      const result = await db.query(`
        SELECT * FROM public.email_templates 
        WHERE id = $1 AND tenant_id = $2
      `, [templateId, tenantId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapDbTemplateToTemplate(result.rows[0]);
    } catch (error) {
      console.error('Error getting email template:', error);
      return null;
    }
  }

  /**
   * Get email template by name
   */
  async getEmailTemplateByName(name: string, tenantId: string): Promise<EmailTemplate | null> {
    try {
      const result = await db.query(`
        SELECT * FROM public.email_templates 
        WHERE name = $1 AND tenant_id = $2 AND is_active = true
      `, [name, tenantId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapDbTemplateToTemplate(result.rows[0]);
    } catch (error) {
      console.error('Error getting email template by name:', error);
      return null;
    }
  }

  /**
   * Get all email templates for a tenant
   */
  async getEmailTemplates(tenantId: string): Promise<EmailTemplate[]> {
    try {
      const result = await db.query(`
        SELECT * FROM public.email_templates 
        WHERE tenant_id = $1 
        ORDER BY name
      `, [tenantId]);

      return result.rows.map(row => this.mapDbTemplateToTemplate(row));
    } catch (error) {
      console.error('Error getting email templates:', error);
      return [];
    }
  }

  /**
   * Update email template
   */
  async updateEmailTemplate(templateId: string, tenantId: string, updates: Partial<EmailTemplate>): Promise<void> {
    try {
      const setClause = [];
      const values = [];
      let paramIndex = 1;

      if (updates.name !== undefined) {
        setClause.push(`name = $${paramIndex++}`);
        values.push(updates.name);
      }

      if (updates.subject !== undefined) {
        setClause.push(`subject = $${paramIndex++}`);
        values.push(updates.subject);
      }

      if (updates.htmlContent !== undefined) {
        setClause.push(`html_content = $${paramIndex++}`);
        values.push(updates.htmlContent);
      }

      if (updates.textContent !== undefined) {
        setClause.push(`text_content = $${paramIndex++}`);
        values.push(updates.textContent);
      }

      if (updates.variables !== undefined) {
        setClause.push(`variables = $${paramIndex++}`);
        values.push(JSON.stringify(updates.variables));
      }

      if (updates.isActive !== undefined) {
        setClause.push(`is_active = $${paramIndex++}`);
        values.push(updates.isActive);
      }

      if (setClause.length === 0) {
        return;
      }

      setClause.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(templateId, tenantId);

      await db.query(`
        UPDATE public.email_templates 
        SET ${setClause.join(', ')}
        WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex++}
      `, values);

      console.log(`Email template ${templateId} updated for tenant: ${tenantId}`);
    } catch (error) {
      console.error('Error updating email template:', error);
      throw new Error('Failed to update email template');
    }
  }

  /**
   * Delete email template
   */
  async deleteEmailTemplate(templateId: string, tenantId: string): Promise<void> {
    try {
      await db.query(`
        DELETE FROM public.email_templates 
        WHERE id = $1 AND tenant_id = $2
      `, [templateId, tenantId]);

      console.log(`Email template ${templateId} deleted for tenant: ${tenantId}`);
    } catch (error) {
      console.error('Error deleting email template:', error);
      throw new Error('Failed to delete email template');
    }
  }

  /**
   * Render email template with branding and variables
   */
  async renderEmailTemplate(
    templateName: string, 
    tenantId: string, 
    variables: Record<string, any> = {}
  ): Promise<{ subject: string; htmlContent: string; textContent: string } | null> {
    try {
      // Get template
      const template = await this.getEmailTemplateByName(templateName, tenantId);
      if (!template) {
        return null;
      }

      // Get brand configuration
      const brandConfig = await brandingService.getBrandConfig(tenantId);
      if (!brandConfig) {
        throw new Error('Brand configuration not found');
      }

      // Merge brand variables with provided variables
      const allVariables = {
        ...variables,
        companyName: brandConfig.companyName || 'Company',
        primaryColor: brandConfig.primaryColor,
        secondaryColor: brandConfig.secondaryColor,
        logo: brandConfig.logo || '',
        website: brandConfig.socialLinks?.website || '',
        footerText: brandConfig.footerText || ''
      };

      // Render template
      const renderedSubject = this.replaceVariables(template.subject, allVariables);
      const renderedHtmlContent = this.applyBrandingToHtml(
        this.replaceVariables(template.htmlContent, allVariables),
        brandConfig
      );
      const renderedTextContent = this.replaceVariables(template.textContent, allVariables);

      return {
        subject: renderedSubject,
        htmlContent: renderedHtmlContent,
        textContent: renderedTextContent
      };
    } catch (error) {
      console.error('Error rendering email template:', error);
      throw new Error('Failed to render email template');
    }
  }

  /**
   * Create default email templates for a tenant
   */
  async createDefaultTemplates(tenantId: string): Promise<void> {
    try {
      const defaultTemplates = [
        {
          name: 'welcome',
          subject: 'Welcome to {{companyName}}!',
          htmlContent: this.getWelcomeHtmlTemplate(),
          textContent: this.getWelcomeTextTemplate(),
          variables: ['userName', 'companyName', 'loginUrl'],
          tenantId,
          isActive: true
        },
        {
          name: 'password-reset',
          subject: 'Reset your password - {{companyName}}',
          htmlContent: this.getPasswordResetHtmlTemplate(),
          textContent: this.getPasswordResetTextTemplate(),
          variables: ['userName', 'resetUrl', 'companyName'],
          tenantId,
          isActive: true
        },
        {
          name: 'content-approved',
          subject: 'Content Approved - {{companyName}}',
          htmlContent: this.getContentApprovedHtmlTemplate(),
          textContent: this.getContentApprovedTextTemplate(),
          variables: ['userName', 'contentTitle', 'approverName', 'companyName'],
          tenantId,
          isActive: true
        },
        {
          name: 'content-rejected',
          subject: 'Content Needs Revision - {{companyName}}',
          htmlContent: this.getContentRejectedHtmlTemplate(),
          textContent: this.getContentRejectedTextTemplate(),
          variables: ['userName', 'contentTitle', 'rejectionReason', 'companyName'],
          tenantId,
          isActive: true
        }
      ];

      for (const template of defaultTemplates) {
        try {
          await this.createEmailTemplate(template);
        } catch (error) {
          // Template might already exist, continue with others
          console.log(`Template ${template.name} already exists for tenant ${tenantId}`);
        }
      }

      console.log(`Default email templates created for tenant: ${tenantId}`);
    } catch (error) {
      console.error('Error creating default templates:', error);
      throw new Error('Failed to create default email templates');
    }
  }

  /**
   * Replace variables in template content
   */
  private replaceVariables(content: string, variables: Record<string, any>): string {
    let result = content;
    
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      // Escape special characters in the replacement value
      const escapedValue = String(value).replace(/\$/g, '$$$$');
      result = result.replace(regex, escapedValue);
    }

    return result;
  }

  /**
   * Apply branding to HTML content
   */
  private applyBrandingToHtml(htmlContent: string, brandConfig: BrandConfig): string {
    // Generate CSS from brand config
    const css = `
      <style>
        .email-container {
          font-family: ${brandConfig.fontFamily};
          color: ${brandConfig.textColor || '#333333'};
          background-color: ${brandConfig.backgroundColor || '#ffffff'};
        }
        .email-header {
          background-color: ${brandConfig.primaryColor};
          color: white;
          padding: 20px;
          text-align: center;
        }
        .email-content {
          padding: 20px;
        }
        .email-footer {
          background-color: ${brandConfig.secondaryColor};
          color: white;
          padding: 15px;
          text-align: center;
          font-size: 12px;
        }
        .btn-primary {
          background-color: ${brandConfig.primaryColor};
          color: white;
          padding: 10px 20px;
          text-decoration: none;
          border-radius: 4px;
          display: inline-block;
        }
        .btn-secondary {
          background-color: ${brandConfig.secondaryColor};
          color: white;
          padding: 10px 20px;
          text-decoration: none;
          border-radius: 4px;
          display: inline-block;
        }
      </style>
    `;

    // Wrap content with branded container if not already wrapped
    if (!htmlContent.includes('email-container')) {
      htmlContent = `
        <div class="email-container">
          ${htmlContent}
        </div>
      `;
    }

    // Prepend CSS
    return css + htmlContent;
  }

  /**
   * Map database row to EmailTemplate
   */
  private mapDbTemplateToTemplate(dbTemplate: any): EmailTemplate {
    return {
      id: dbTemplate.id,
      name: dbTemplate.name,
      subject: dbTemplate.subject,
      htmlContent: dbTemplate.html_content,
      textContent: dbTemplate.text_content,
      variables: dbTemplate.variables || [],
      tenantId: dbTemplate.tenant_id,
      isActive: dbTemplate.is_active,
      createdAt: dbTemplate.created_at,
      updatedAt: dbTemplate.updated_at
    };
  }

  // Default template content methods
  private getWelcomeHtmlTemplate(): string {
    return `
      <div class="email-header">
        <h1>Welcome to {{companyName}}!</h1>
      </div>
      <div class="email-content">
        <p>Hello {{userName}},</p>
        <p>Welcome to {{companyName}}! We're excited to have you on board.</p>
        <p>You can now access your account and start creating amazing content.</p>
        <p><a href="{{loginUrl}}" class="btn-primary">Get Started</a></p>
        <p>If you have any questions, feel free to reach out to our support team.</p>
        <p>Best regards,<br>The {{companyName}} Team</p>
      </div>
      <div class="email-footer">
        <p>{{footerText}}</p>
      </div>
    `;
  }

  private getWelcomeTextTemplate(): string {
    return `
Welcome to {{companyName}}!

Hello {{userName}},

Welcome to {{companyName}}! We're excited to have you on board.

You can now access your account and start creating amazing content.

Get started: {{loginUrl}}

If you have any questions, feel free to reach out to our support team.

Best regards,
The {{companyName}} Team

{{footerText}}
    `;
  }

  private getPasswordResetHtmlTemplate(): string {
    return `
      <div class="email-header">
        <h1>Password Reset Request</h1>
      </div>
      <div class="email-content">
        <p>Hello {{userName}},</p>
        <p>We received a request to reset your password for your {{companyName}} account.</p>
        <p>Click the button below to reset your password:</p>
        <p><a href="{{resetUrl}}" class="btn-primary">Reset Password</a></p>
        <p>If you didn't request this password reset, please ignore this email.</p>
        <p>This link will expire in 24 hours for security reasons.</p>
        <p>Best regards,<br>The {{companyName}} Team</p>
      </div>
      <div class="email-footer">
        <p>{{footerText}}</p>
      </div>
    `;
  }

  private getPasswordResetTextTemplate(): string {
    return `
Password Reset Request

Hello {{userName}},

We received a request to reset your password for your {{companyName}} account.

Reset your password: {{resetUrl}}

If you didn't request this password reset, please ignore this email.

This link will expire in 24 hours for security reasons.

Best regards,
The {{companyName}} Team

{{footerText}}
    `;
  }

  private getContentApprovedHtmlTemplate(): string {
    return `
      <div class="email-header">
        <h1>Content Approved!</h1>
      </div>
      <div class="email-content">
        <p>Hello {{userName}},</p>
        <p>Great news! Your content "{{contentTitle}}" has been approved by {{approverName}}.</p>
        <p>Your content is now ready for publication and will be scheduled according to your editorial calendar.</p>
        <p>Keep up the excellent work!</p>
        <p>Best regards,<br>The {{companyName}} Team</p>
      </div>
      <div class="email-footer">
        <p>{{footerText}}</p>
      </div>
    `;
  }

  private getContentApprovedTextTemplate(): string {
    return `
Content Approved!

Hello {{userName}},

Great news! Your content "{{contentTitle}}" has been approved by {{approverName}}.

Your content is now ready for publication and will be scheduled according to your editorial calendar.

Keep up the excellent work!

Best regards,
The {{companyName}} Team

{{footerText}}
    `;
  }

  private getContentRejectedHtmlTemplate(): string {
    return `
      <div class="email-header">
        <h1>Content Needs Revision</h1>
      </div>
      <div class="email-content">
        <p>Hello {{userName}},</p>
        <p>Your content "{{contentTitle}}" needs some revisions before it can be approved.</p>
        <p><strong>Feedback:</strong></p>
        <p>{{rejectionReason}}</p>
        <p>Please make the necessary changes and resubmit for approval.</p>
        <p>Best regards,<br>The {{companyName}} Team</p>
      </div>
      <div class="email-footer">
        <p>{{footerText}}</p>
      </div>
    `;
  }

  private getContentRejectedTextTemplate(): string {
    return `
Content Needs Revision

Hello {{userName}},

Your content "{{contentTitle}}" needs some revisions before it can be approved.

Feedback:
{{rejectionReason}}

Please make the necessary changes and resubmit for approval.

Best regards,
The {{companyName}} Team

{{footerText}}
    `;
  }
}

export const emailTemplateService = new EmailTemplateService();