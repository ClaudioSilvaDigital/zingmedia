import { v4 as uuidv4 } from 'uuid';
import { Request } from 'express';
import { Tenant, TenantContext, TenantConfig, DatabaseQuery, User, BrandConfig, Permission } from '../types';
import { db } from '../config/database';
import { rbacService } from './rbac';

export class TenantManager {
  async createTenant(config: TenantConfig): Promise<Tenant> {
    const tenantId = uuidv4();
    
    try {
      // Validate hierarchical constraints
      await this.validateTenantHierarchy(config);

      // Create tenant record in main database
      const tenantResult = await db.query(`
        INSERT INTO public.tenants (id, name, type, parent_id, brand_config, settings, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *
      `, [
        tenantId,
        config.name,
        config.type,
        config.parentId || null,
        JSON.stringify(config.brandConfig),
        JSON.stringify(config.settings)
      ]);

      const tenant = this.mapDbTenantToTenant(tenantResult.rows[0]);

      // Provision resources for the tenant
      await this.provisionResources(tenantId);

      // Log tenant creation
      await this.logAuditEvent(tenantId, null, 'tenant_created', 'tenant', tenantId, {
        tenantName: config.name,
        tenantType: config.type,
        parentId: config.parentId
      });

      return tenant;
    } catch (error) {
      console.error('Error creating tenant:', error);
      throw new Error('Failed to create tenant');
    }
  }

  async getTenantContext(request: Request): Promise<TenantContext | null> {
    try {
      // Extract tenant ID from various sources (header, subdomain, etc.)
      const tenantId = this.extractTenantId(request);
      
      if (!tenantId) {
        return null;
      }

      // Get tenant information with hierarchy validation
      const tenant = await this.getTenantById(tenantId);
      
      if (!tenant) {
        return null;
      }

      // Get user from request (assuming it's set by auth middleware)
      const user = (request as any).user as User;
      
      if (!user) {
        return null;
      }

      // Validate user belongs to tenant or has access through hierarchy
      const hasAccess = await this.validateTenantAccess(user.id, tenantId);
      
      if (!hasAccess) {
        return null;
      }

      // Get user permissions with tenant context
      const permissions = await this.getUserPermissions(user.id, tenantId);

      return {
        tenantId,
        tenant,
        user,
        permissions,
      };
    } catch (error) {
      console.error('Error getting tenant context:', error);
      return null;
    }
  }

  isolateData(query: DatabaseQuery, tenantId: string): DatabaseQuery {
    // Transform query to use tenant-specific schema
    const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;
    
    // Replace table references with schema-qualified names
    let isolatedSql = query.sql;
    
    // Common table patterns to isolate
    const tables = ['users', 'briefings', 'content', 'workflows', 'best_practices'];
    
    tables.forEach(table => {
      // Replace unqualified table names with schema-qualified names
      const tableRegex = new RegExp(`\\b${table}\\b(?!\\.)`, 'gi');
      isolatedSql = isolatedSql.replace(tableRegex, `"${schemaName}".${table}`);
    });

    // Add tenant_id filter if not already present
    if (!isolatedSql.toLowerCase().includes('tenant_id') && 
        !isolatedSql.toLowerCase().includes('where')) {
      isolatedSql += ` WHERE tenant_id = $${query.params.length + 1}`;
      return {
        sql: isolatedSql,
        params: [...query.params, tenantId]
      };
    }

    return {
      sql: isolatedSql,
      params: query.params
    };
  }

  async provisionResources(tenantId: string): Promise<void> {
    try {
      // Create tenant-specific database schema
      await db.createTenantSchema(tenantId);

      // Initialize default roles and permissions for the tenant
      await this.initializeTenantDefaults(tenantId);

      console.log(`Resources provisioned for tenant: ${tenantId}`);
    } catch (error) {
      console.error('Error provisioning resources:', error);
      throw new Error('Failed to provision tenant resources');
    }
  }

  private extractTenantId(request: Request): string | null {
    // Try to get tenant ID from various sources
    
    // 1. From custom header
    const headerTenantId = request.headers['x-tenant-id'] as string;
    if (headerTenantId) {
      return headerTenantId;
    }

    // 2. From subdomain
    const host = request.headers.host;
    if (host) {
      const subdomain = host.split('.')[0];
      if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
        // Look up tenant by subdomain
        // This would require a database lookup - simplified for now
        return subdomain;
      }
    }

    // 3. From JWT token (if user is authenticated)
    const user = (request as any).user as User;
    if (user && user.tenantId) {
      return user.tenantId;
    }

    return null;
  }

  private async initializeTenantDefaults(tenantId: string): Promise<void> {
    try {
      // Initialize default roles for the tenant
      await rbacService.initializeDefaultRoles(tenantId);

      console.log(`Initialized default roles for tenant: ${tenantId}`);
    } catch (error) {
      console.error('Error initializing tenant defaults:', error);
      throw new Error('Failed to initialize tenant defaults');
    }
  }

  private mapDbTenantToTenant(dbTenant: any): Tenant {
    return {
      id: dbTenant.id,
      name: dbTenant.name,
      type: dbTenant.type,
      parentId: dbTenant.parent_id,
      brandConfig: dbTenant.brand_config,
      settings: dbTenant.settings,
      createdAt: dbTenant.created_at,
      updatedAt: dbTenant.updated_at,
    };
  }

  /**
   * Get tenant by ID with full hierarchy information
   */
  async getTenantById(tenantId: string): Promise<Tenant | null> {
    try {
      const result = await db.query(
        'SELECT * FROM public.tenants WHERE id = $1',
        [tenantId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapDbTenantToTenant(result.rows[0]);
    } catch (error) {
      console.error('Error getting tenant by ID:', error);
      return null;
    }
  }

  /**
   * Validate tenant hierarchy constraints
   */
  private async validateTenantHierarchy(config: TenantConfig): Promise<void> {
    // Platform tenants cannot have parents
    if (config.type === 'platform' && config.parentId) {
      throw new Error('Platform tenants cannot have parent tenants');
    }

    // Agency tenants must have platform parent or no parent
    if (config.type === 'agency' && config.parentId) {
      const parent = await this.getTenantById(config.parentId);
      if (!parent || parent.type !== 'platform') {
        throw new Error('Agency tenants can only have platform parents');
      }
    }

    // Client tenants must have agency parent
    if (config.type === 'client') {
      if (!config.parentId) {
        throw new Error('Client tenants must have an agency parent');
      }
      
      const parent = await this.getTenantById(config.parentId);
      if (!parent || parent.type !== 'agency') {
        throw new Error('Client tenants must have agency parents');
      }
    }
  }

  /**
   * Validate user access to tenant based on hierarchy
   */
  async validateTenantAccess(userId: string, tenantId: string): Promise<boolean> {
    try {
      // Get user's tenant
      const userResult = await db.query(
        'SELECT tenant_id FROM public.users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return false;
      }

      const userTenantId = userResult.rows[0].tenant_id;

      // If user belongs to the requested tenant, access is granted
      if (userTenantId === tenantId) {
        return true;
      }

      // Check if user has access through hierarchy
      return await this.checkHierarchicalAccess(userTenantId, tenantId);
    } catch (error) {
      console.error('Error validating tenant access:', error);
      return false;
    }
  }

  /**
   * Check hierarchical access between tenants
   */
  private async checkHierarchicalAccess(userTenantId: string, requestedTenantId: string): Promise<boolean> {
    try {
      // Get both tenants
      const [userTenant, requestedTenant] = await Promise.all([
        this.getTenantById(userTenantId),
        this.getTenantById(requestedTenantId)
      ]);

      if (!userTenant || !requestedTenant) {
        return false;
      }

      // Platform users can access all tenants
      if (userTenant.type === 'platform') {
        return true;
      }

      // Agency users can access their clients
      if (userTenant.type === 'agency' && requestedTenant.type === 'client') {
        return requestedTenant.parentId === userTenantId;
      }

      // No other cross-tenant access allowed
      return false;
    } catch (error) {
      console.error('Error checking hierarchical access:', error);
      return false;
    }
  }

  /**
   * Get user permissions within tenant context
   */
  private async getUserPermissions(userId: string, tenantId: string): Promise<Permission[]> {
    try {
      // Get user's roles and permissions for the specific tenant
      const userResult = await db.query(
        'SELECT permissions FROM public.users WHERE id = $1 AND tenant_id = $2',
        [userId, tenantId]
      );

      if (userResult.rows.length === 0) {
        return [];
      }

      return userResult.rows[0].permissions || [];
    } catch (error) {
      console.error('Error getting user permissions:', error);
      return [];
    }
  }

  /**
   * Get tenant hierarchy (children)
   */
  async getTenantChildren(tenantId: string): Promise<Tenant[]> {
    try {
      const result = await db.query(
        'SELECT * FROM public.tenants WHERE parent_id = $1 ORDER BY created_at',
        [tenantId]
      );

      return result.rows.map(row => this.mapDbTenantToTenant(row));
    } catch (error) {
      console.error('Error getting tenant children:', error);
      return [];
    }
  }

  /**
   * Get full tenant hierarchy path
   */
  async getTenantHierarchyPath(tenantId: string): Promise<Tenant[]> {
    const path: Tenant[] = [];
    let currentTenantId: string | null = tenantId;

    try {
      while (currentTenantId) {
        const tenant = await this.getTenantById(currentTenantId);
        if (!tenant) break;

        path.unshift(tenant);
        currentTenantId = tenant.parentId || null;
      }

      return path;
    } catch (error) {
      console.error('Error getting tenant hierarchy path:', error);
      return [];
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

export class WhiteLabelService {
  async applyBranding(tenantId: string, config: BrandConfig): Promise<void> {
    try {
      await db.query(`
        UPDATE public.tenants 
        SET brand_config = $1, updated_at = CURRENT_TIMESTAMP 
        WHERE id = $2
      `, [JSON.stringify(config), tenantId]);

      console.log(`Branding applied for tenant: ${tenantId}`);
    } catch (error) {
      console.error('Error applying branding:', error);
      throw new Error('Failed to apply branding');
    }
  }

  async generateCustomDomain(tenantId: string, domain: string): Promise<void> {
    try {
      const currentConfig = await db.query(
        'SELECT brand_config FROM public.tenants WHERE id = $1',
        [tenantId]
      );

      if (currentConfig.rows.length === 0) {
        throw new Error('Tenant not found');
      }

      const brandConfig = currentConfig.rows[0].brand_config;
      brandConfig.customDomain = domain;

      await db.query(`
        UPDATE public.tenants 
        SET brand_config = $1, updated_at = CURRENT_TIMESTAMP 
        WHERE id = $2
      `, [JSON.stringify(brandConfig), tenantId]);

      console.log(`Custom domain ${domain} configured for tenant: ${tenantId}`);
    } catch (error) {
      console.error('Error configuring custom domain:', error);
      throw new Error('Failed to configure custom domain');
    }
  }

  async customizeEmailTemplates(tenantId: string, templates: any[]): Promise<void> {
    // This would typically store email templates in a dedicated table
    console.log(`Email templates customized for tenant: ${tenantId}`);
  }
}

export const tenantManager = new TenantManager();
export const whiteLabelService = new WhiteLabelService();