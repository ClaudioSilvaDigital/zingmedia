import { BrandConfig, ThemeConfig, EmailTemplate, Tenant } from '../types';
import { db } from '../config/database';
import { tenantManager } from './tenant';

export class BrandingService {
  /**
   * Get brand configuration for a tenant
   */
  async getBrandConfig(tenantId: string): Promise<BrandConfig | null> {
    try {
      const result = await db.query(
        'SELECT brand_config FROM public.tenants WHERE id = $1',
        [tenantId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0].brand_config;
    } catch (error) {
      console.error('Error getting brand config:', error);
      throw new Error('Failed to get brand configuration');
    }
  }

  /**
   * Update brand configuration for a tenant
   */
  async updateBrandConfig(tenantId: string, brandConfig: Partial<BrandConfig>): Promise<void> {
    try {
      // Get current brand config
      const currentConfig = await this.getBrandConfig(tenantId);
      
      if (!currentConfig) {
        throw new Error('Tenant not found');
      }

      // Merge with new config
      const updatedConfig = { ...currentConfig, ...brandConfig };

      // Validate brand config
      this.validateBrandConfig(updatedConfig);

      // Update in database
      await db.query(`
        UPDATE public.tenants 
        SET brand_config = $1, updated_at = CURRENT_TIMESTAMP 
        WHERE id = $2
      `, [JSON.stringify(updatedConfig), tenantId]);

      // Log audit event
      await this.logAuditEvent(tenantId, null, 'brand_config_updated', 'tenant', tenantId, {
        updatedFields: Object.keys(brandConfig)
      });

      console.log(`Brand configuration updated for tenant: ${tenantId}`);
    } catch (error) {
      console.error('Error updating brand config:', error);
      throw new Error('Failed to update brand configuration');
    }
  }

  /**
   * Generate CSS theme from brand configuration
   */
  generateThemeCSS(brandConfig: BrandConfig): string {
    const theme = this.brandConfigToTheme(brandConfig);
    
    return `
      :root {
        /* Colors */
        --color-primary: ${theme.colors.primary};
        --color-secondary: ${theme.colors.secondary};
        --color-accent: ${theme.colors.accent || theme.colors.primary};
        --color-background: ${theme.colors.background};
        --color-surface: ${theme.colors.surface};
        --color-text: ${theme.colors.text};
        --color-text-secondary: ${theme.colors.textSecondary};
        --color-border: ${theme.colors.border};
        --color-success: ${theme.colors.success};
        --color-warning: ${theme.colors.warning};
        --color-error: ${theme.colors.error};

        /* Typography */
        --font-family: ${theme.typography.fontFamily};
        --font-size-xs: ${theme.typography.fontSize.xs};
        --font-size-sm: ${theme.typography.fontSize.sm};
        --font-size-base: ${theme.typography.fontSize.base};
        --font-size-lg: ${theme.typography.fontSize.lg};
        --font-size-xl: ${theme.typography.fontSize.xl};
        --font-size-2xl: ${theme.typography.fontSize['2xl']};
        --font-size-3xl: ${theme.typography.fontSize['3xl']};
        --font-weight-normal: ${theme.typography.fontWeight.normal};
        --font-weight-medium: ${theme.typography.fontWeight.medium};
        --font-weight-semibold: ${theme.typography.fontWeight.semibold};
        --font-weight-bold: ${theme.typography.fontWeight.bold};

        /* Spacing */
        --spacing-xs: ${theme.spacing.xs};
        --spacing-sm: ${theme.spacing.sm};
        --spacing-md: ${theme.spacing.md};
        --spacing-lg: ${theme.spacing.lg};
        --spacing-xl: ${theme.spacing.xl};

        /* Border Radius */
        --border-radius-sm: ${theme.borderRadius.sm};
        --border-radius-md: ${theme.borderRadius.md};
        --border-radius-lg: ${theme.borderRadius.lg};
      }

      /* Base styles */
      body {
        font-family: var(--font-family);
        color: var(--color-text);
        background-color: var(--color-background);
      }

      /* Custom CSS */
      ${brandConfig.customCss || ''}
    `;
  }

  /**
   * Convert brand config to theme config
   */
  private brandConfigToTheme(brandConfig: BrandConfig): ThemeConfig {
    return {
      colors: {
        primary: brandConfig.primaryColor,
        secondary: brandConfig.secondaryColor,
        accent: brandConfig.accentColor,
        background: brandConfig.backgroundColor || '#ffffff',
        surface: '#f8f9fa',
        text: brandConfig.textColor || '#212529',
        textSecondary: '#6c757d',
        border: '#dee2e6',
        success: '#28a745',
        warning: '#ffc107',
        error: '#dc3545'
      },
      typography: {
        fontFamily: brandConfig.fontFamily,
        fontSize: {
          xs: '0.75rem',
          sm: '0.875rem',
          base: '1rem',
          lg: '1.125rem',
          xl: '1.25rem',
          '2xl': '1.5rem',
          '3xl': '1.875rem'
        },
        fontWeight: {
          normal: 400,
          medium: 500,
          semibold: 600,
          bold: 700
        }
      },
      spacing: {
        xs: '0.25rem',
        sm: '0.5rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '3rem'
      },
      borderRadius: {
        sm: '0.125rem',
        md: '0.375rem',
        lg: '0.5rem'
      }
    };
  }

  /**
   * Handle custom domain configuration
   */
  async configureCustomDomain(tenantId: string, domain: string): Promise<void> {
    try {
      // Validate domain format
      if (!this.isValidDomain(domain)) {
        throw new Error('Invalid domain format');
      }

      // Check if domain is already in use
      const existingDomain = await this.checkDomainAvailability(domain);
      if (!existingDomain) {
        throw new Error('Domain is already in use');
      }

      // Update brand config with custom domain
      await this.updateBrandConfig(tenantId, { customDomain: domain });

      // Log audit event
      await this.logAuditEvent(tenantId, null, 'custom_domain_configured', 'tenant', tenantId, {
        domain
      });

      console.log(`Custom domain ${domain} configured for tenant: ${tenantId}`);
    } catch (error) {
      console.error('Error configuring custom domain:', error);
      throw new Error('Failed to configure custom domain');
    }
  }

  /**
   * Get tenant by custom domain
   */
  async getTenantByDomain(domain: string): Promise<Tenant | null> {
    try {
      const result = await db.query(`
        SELECT * FROM public.tenants 
        WHERE brand_config->>'customDomain' = $1
      `, [domain]);

      if (result.rows.length === 0) {
        return null;
      }

      return {
        id: result.rows[0].id,
        name: result.rows[0].name,
        type: result.rows[0].type,
        parentId: result.rows[0].parent_id,
        brandConfig: result.rows[0].brand_config,
        settings: result.rows[0].settings,
        createdAt: result.rows[0].created_at,
        updatedAt: result.rows[0].updated_at
      };
    } catch (error) {
      console.error('Error getting tenant by domain:', error);
      return null;
    }
  }

  /**
   * Generate branded assets (logos, favicons, etc.)
   */
  async generateBrandedAssets(tenantId: string): Promise<{ logoUrl?: string; faviconUrl?: string }> {
    try {
      const brandConfig = await this.getBrandConfig(tenantId);
      
      if (!brandConfig) {
        throw new Error('Brand configuration not found');
      }

      // In a real implementation, this would generate or process uploaded assets
      // For now, return the configured URLs
      return {
        logoUrl: brandConfig.logo,
        faviconUrl: brandConfig.favicon
      };
    } catch (error) {
      console.error('Error generating branded assets:', error);
      throw new Error('Failed to generate branded assets');
    }
  }

  /**
   * Validate brand configuration
   */
  private validateBrandConfig(brandConfig: BrandConfig): void {
    // Validate required fields
    if (!brandConfig.primaryColor) {
      throw new Error('Primary color is required');
    }

    if (!brandConfig.secondaryColor) {
      throw new Error('Secondary color is required');
    }

    if (!brandConfig.fontFamily) {
      throw new Error('Font family is required');
    }

    // Validate color formats (hex, rgb, hsl)
    const colorRegex = /^(#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3}|rgb\(.*\)|hsl\(.*\))$/;
    
    if (!colorRegex.test(brandConfig.primaryColor)) {
      throw new Error('Invalid primary color format');
    }

    if (!colorRegex.test(brandConfig.secondaryColor)) {
      throw new Error('Invalid secondary color format');
    }

    if (brandConfig.accentColor && !colorRegex.test(brandConfig.accentColor)) {
      throw new Error('Invalid accent color format');
    }

    if (brandConfig.backgroundColor && !colorRegex.test(brandConfig.backgroundColor)) {
      throw new Error('Invalid background color format');
    }

    if (brandConfig.textColor && !colorRegex.test(brandConfig.textColor)) {
      throw new Error('Invalid text color format');
    }

    // Validate custom domain if provided
    if (brandConfig.customDomain && !this.isValidDomain(brandConfig.customDomain)) {
      throw new Error('Invalid custom domain format');
    }
  }

  /**
   * Validate domain format
   */
  private isValidDomain(domain: string): boolean {
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/;
    return domainRegex.test(domain) && domain.length <= 253;
  }

  /**
   * Check if domain is available
   */
  private async checkDomainAvailability(domain: string): Promise<boolean> {
    try {
      const result = await db.query(`
        SELECT id FROM public.tenants 
        WHERE brand_config->>'customDomain' = $1
      `, [domain]);

      return result.rows.length === 0;
    } catch (error) {
      console.error('Error checking domain availability:', error);
      return false;
    }
  }

  /**
   * Log audit events using centralized audit service
   */
  private async logAuditEvent(
    tenantId: string,
    userId: string | null,
    action: string,
    resource: string,
    resourceId: string,
    details: Record<string, any> = {}
  ): Promise<void> {
    const { auditService, createAuditContext } = await import('../middleware/audit');
    const context = createAuditContext(tenantId, userId || undefined);
    await auditService.logEvent(context, action, resource, resourceId, details);
  }
}

export const brandingService = new BrandingService();