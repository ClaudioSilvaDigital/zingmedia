import { Request, Response, NextFunction } from 'express';
import { brandingService } from '../services/branding';
import { TenantContext } from '../types';

export interface BrandedRequest extends Request {
  brandConfig?: any;
  themeCSS?: string;
}

/**
 * Middleware to handle custom domain routing and inject branding
 */
export const brandingMiddleware = async (req: BrandedRequest, res: Response, next: NextFunction) => {
  try {
    // Get tenant context (should be set by tenant middleware)
    const tenantContext = (req as any).tenantContext as TenantContext;
    
    if (!tenantContext) {
      return next();
    }

    // Get brand configuration for the tenant
    const brandConfig = await brandingService.getBrandConfig(tenantContext.tenantId);
    
    if (brandConfig) {
      // Attach brand config to request
      req.brandConfig = brandConfig;
      
      // Generate theme CSS
      req.themeCSS = brandingService.generateThemeCSS(brandConfig);
      
      // Set response headers for branding
      res.locals.brandConfig = brandConfig;
      res.locals.themeCSS = req.themeCSS;
    }

    next();
  } catch (error) {
    console.error('Error in branding middleware:', error);
    next(); // Continue without branding if there's an error
  }
};

/**
 * Middleware to handle custom domain resolution
 */
export const customDomainMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const host = req.headers.host;
    
    if (!host) {
      return next();
    }

    // Extract domain (remove port if present)
    const domain = host.split(':')[0];
    
    // Skip if it's a default domain or localhost
    if (domain === 'localhost' || domain.includes('127.0.0.1') || domain.includes('api.')) {
      return next();
    }

    // Check if this is a custom domain
    const tenant = await brandingService.getTenantByDomain(domain);
    
    if (tenant) {
      // Set tenant context for custom domain
      (req as any).customDomainTenant = tenant;
      
      // Set tenant ID header for downstream middleware
      req.headers['x-tenant-id'] = tenant.id;
    }

    next();
  } catch (error) {
    console.error('Error in custom domain middleware:', error);
    next(); // Continue without custom domain resolution if there's an error
  }
};

/**
 * Middleware to inject branding into HTML responses
 */
export const injectBrandingMiddleware = (req: BrandedRequest, res: Response, next: NextFunction) => {
  // Store original send method
  const originalSend = res.send;

  // Override send method to inject branding
  res.send = function(body: any) {
    // Only process HTML responses
    if (typeof body === 'string' && res.get('Content-Type')?.includes('text/html')) {
      // Inject theme CSS if available
      if (req.themeCSS && body.includes('<head>')) {
        body = body.replace('<head>', `<head>\n<style>${req.themeCSS}</style>`);
      }

      // Inject brand config as JavaScript variable
      if (req.brandConfig && body.includes('<head>')) {
        const brandConfigScript = `
          <script>
            window.BRAND_CONFIG = ${JSON.stringify(req.brandConfig)};
          </script>
        `;
        body = body.replace('<head>', `<head>\n${brandConfigScript}`);
      }

      // Replace favicon if custom one is configured
      if (req.brandConfig?.favicon && body.includes('<head>')) {
        // Remove existing favicon links
        body = body.replace(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*>/gi, '');
        
        // Add custom favicon
        const faviconLink = `<link rel="icon" type="image/x-icon" href="${req.brandConfig.favicon}">`;
        body = body.replace('<head>', `<head>\n${faviconLink}`);
      }

      // Replace title if company name is configured
      if (req.brandConfig?.companyName && body.includes('<title>')) {
        body = body.replace(/<title>([^<]*)<\/title>/gi, `<title>$1 - ${req.brandConfig.companyName}</title>`);
      }
    }

    // Call original send method
    return originalSend.call(this, body);
  };

  next();
};

/**
 * Helper function to get branding context from request
 */
export const getBrandingContext = (req: BrandedRequest) => {
  return {
    brandConfig: req.brandConfig,
    themeCSS: req.themeCSS
  };
};