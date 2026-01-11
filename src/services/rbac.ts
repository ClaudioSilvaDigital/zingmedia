import { v4 as uuidv4 } from 'uuid';
import { Role, Permission, User } from '../types';
import { db } from '../config/database';

/**
 * Comprehensive Role-Based Access Control system
 * Manages roles, permissions, and authorization for multi-tenant platform
 */
export class RBACService {
  
  /**
   * Create a new role with permissions
   */
  async createRole(tenantId: string, name: string, permissions: Permission[]): Promise<Role> {
    const roleId = uuidv4();
    const role: Role = {
      id: roleId,
      name,
      permissions,
      tenantId
    };

    try {
      // Store role in tenant-specific table or global roles table
      await db.query(`
        INSERT INTO public.roles (id, name, permissions, tenant_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [roleId, name, JSON.stringify(permissions), tenantId]);

      return role;
    } catch (error) {
      console.error('Error creating role:', error);
      throw new Error('Failed to create role');
    }
  }

  /**
   * Get all roles for a tenant
   */
  async getTenantRoles(tenantId: string): Promise<Role[]> {
    try {
      const result = await db.query(
        'SELECT * FROM public.roles WHERE tenant_id = $1 ORDER BY name',
        [tenantId]
      );

      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        permissions: row.permissions,
        tenantId: row.tenant_id
      }));
    } catch (error) {
      console.error('Error getting tenant roles:', error);
      return [];
    }
  }

  /**
   * Assign role to user within tenant context
   */
  async assignRole(userId: string, tenantId: string, roleId: string): Promise<void> {
    try {
      // Verify role exists and belongs to tenant
      const roleResult = await db.query(
        'SELECT * FROM public.roles WHERE id = $1 AND tenant_id = $2',
        [roleId, tenantId]
      );

      if (roleResult.rows.length === 0) {
        throw new Error('Role not found or does not belong to tenant');
      }

      const role = roleResult.rows[0];

      // Get user's current roles
      const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;
      const userResult = await db.query(
        `SELECT roles FROM "${schemaName}".users WHERE id = $1`,
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found in tenant');
      }

      const currentRoles = userResult.rows[0].roles || [];
      
      // Check if role is already assigned
      const hasRole = currentRoles.some((r: Role) => r.id === roleId);
      if (hasRole) {
        return; // Role already assigned
      }

      // Add new role
      const updatedRoles = [...currentRoles, {
        id: role.id,
        name: role.name,
        permissions: role.permissions,
        tenantId: role.tenant_id
      }];

      await db.query(
        `UPDATE "${schemaName}".users SET roles = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [JSON.stringify(updatedRoles), userId]
      );

      // Log role assignment
      await this.logAuditEvent(tenantId, userId, 'role_assigned', 'user', userId, {
        roleId,
        roleName: role.name
      });

    } catch (error) {
      console.error('Error assigning role:', error);
      throw new Error('Failed to assign role');
    }
  }

  /**
   * Remove role from user
   */
  async removeRole(userId: string, tenantId: string, roleId: string): Promise<void> {
    try {
      const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;
      const userResult = await db.query(
        `SELECT roles FROM "${schemaName}".users WHERE id = $1`,
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found in tenant');
      }

      const currentRoles = userResult.rows[0].roles || [];
      const updatedRoles = currentRoles.filter((r: Role) => r.id !== roleId);

      await db.query(
        `UPDATE "${schemaName}".users SET roles = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [JSON.stringify(updatedRoles), userId]
      );

      // Log role removal
      await this.logAuditEvent(tenantId, userId, 'role_removed', 'user', userId, {
        roleId
      });

    } catch (error) {
      console.error('Error removing role:', error);
      throw new Error('Failed to remove role');
    }
  }

  /**
   * Check if user has specific permission
   */
  async checkPermission(userId: string, tenantId: string, resource: string, action: string): Promise<boolean> {
    try {
      const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;
      const userResult = await db.query(
        `SELECT roles, permissions FROM "${schemaName}".users WHERE id = $1 AND is_active = 1`,
        [userId]
      );

      if (userResult.rows.length === 0) {
        return false;
      }

      const user = userResult.rows[0];
      const userPermissions = user.permissions || [];
      const userRoles = user.roles || [];

      // Check direct permissions
      const hasDirectPermission = userPermissions.some((p: Permission) =>
        p.resource === resource && p.action === action
      );

      if (hasDirectPermission) {
        return true;
      }

      // Check role-based permissions
      const hasRolePermission = userRoles.some((role: Role) =>
        role.permissions.some((p: Permission) =>
          p.resource === resource && p.action === action
        )
      );

      return hasRolePermission;
    } catch (error) {
      console.error('Permission check error:', error);
      return false;
    }
  }

  /**
   * Get all permissions for a user (direct + role-based)
   */
  async getUserPermissions(userId: string, tenantId: string): Promise<Permission[]> {
    try {
      const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;
      const userResult = await db.query(
        `SELECT roles, permissions FROM "${schemaName}".users WHERE id = $1`,
        [userId]
      );

      if (userResult.rows.length === 0) {
        return [];
      }

      const user = userResult.rows[0];
      const directPermissions = user.permissions || [];
      const userRoles = user.roles || [];

      // Collect all permissions from roles
      const rolePermissions = userRoles.flatMap((role: Role) => role.permissions);

      // Combine and deduplicate permissions
      const allPermissions = [...directPermissions, ...rolePermissions];
      const uniquePermissions = allPermissions.filter((permission, index, self) =>
        index === self.findIndex(p => p.resource === permission.resource && p.action === permission.action)
      );

      return uniquePermissions;
    } catch (error) {
      console.error('Error getting user permissions:', error);
      return [];
    }
  }

  /**
   * Initialize default roles for a tenant
   */
  async initializeDefaultRoles(tenantId: string): Promise<void> {
    const defaultRoles = this.getDefaultRoleDefinitions();

    try {
      for (const roleConfig of defaultRoles) {
        await this.createRole(tenantId, roleConfig.name, roleConfig.permissions);
      }
    } catch (error) {
      console.error('Error initializing default roles:', error);
      throw new Error('Failed to initialize default roles');
    }
  }

  /**
   * Get default role definitions
   */
  private getDefaultRoleDefinitions(): Array<{ name: string; permissions: Permission[] }> {
    return [
      {
        name: 'Platform Admin',
        permissions: [
          { id: uuidv4(), name: 'manage_all', resource: '*', action: '*' },
          { id: uuidv4(), name: 'create_agencies', resource: 'tenants', action: 'create' },
          { id: uuidv4(), name: 'manage_billing', resource: 'billing', action: 'manage' },
        ]
      },
      {
        name: 'Agency Admin',
        permissions: [
          { id: uuidv4(), name: 'manage_users', resource: 'users', action: 'create' },
          { id: uuidv4(), name: 'manage_users', resource: 'users', action: 'update' },
          { id: uuidv4(), name: 'manage_users', resource: 'users', action: 'delete' },
          { id: uuidv4(), name: 'manage_clients', resource: 'clients', action: 'create' },
          { id: uuidv4(), name: 'manage_clients', resource: 'clients', action: 'update' },
          { id: uuidv4(), name: 'manage_content', resource: 'content', action: 'create' },
          { id: uuidv4(), name: 'manage_content', resource: 'content', action: 'update' },
          { id: uuidv4(), name: 'manage_content', resource: 'content', action: 'delete' },
          { id: uuidv4(), name: 'manage_briefings', resource: 'briefings', action: 'create' },
          { id: uuidv4(), name: 'manage_briefings', resource: 'briefings', action: 'update' },
          { id: uuidv4(), name: 'view_analytics', resource: 'analytics', action: 'read' },
          { id: uuidv4(), name: 'manage_branding', resource: 'branding', action: 'update' },
        ]
      },
      {
        name: 'Social Media Manager',
        permissions: [
          { id: uuidv4(), name: 'create_content', resource: 'content', action: 'create' },
          { id: uuidv4(), name: 'edit_content', resource: 'content', action: 'update' },
          { id: uuidv4(), name: 'view_content', resource: 'content', action: 'read' },
          { id: uuidv4(), name: 'create_briefings', resource: 'briefings', action: 'create' },
          { id: uuidv4(), name: 'edit_briefings', resource: 'briefings', action: 'update' },
          { id: uuidv4(), name: 'view_briefings', resource: 'briefings', action: 'read' },
          { id: uuidv4(), name: 'schedule_content', resource: 'calendar', action: 'update' },
          { id: uuidv4(), name: 'publish_content', resource: 'publishing', action: 'create' },
          { id: uuidv4(), name: 'view_analytics', resource: 'analytics', action: 'read' },
        ]
      },
      {
        name: 'Client Approver',
        permissions: [
          { id: uuidv4(), name: 'approve_content', resource: 'content', action: 'approve' },
          { id: uuidv4(), name: 'view_content', resource: 'content', action: 'read' },
          { id: uuidv4(), name: 'comment_content', resource: 'content', action: 'comment' },
          { id: uuidv4(), name: 'view_briefings', resource: 'briefings', action: 'read' },
          { id: uuidv4(), name: 'view_calendar', resource: 'calendar', action: 'read' },
        ]
      },
      {
        name: 'Viewer',
        permissions: [
          { id: uuidv4(), name: 'view_content', resource: 'content', action: 'read' },
          { id: uuidv4(), name: 'view_briefings', resource: 'briefings', action: 'read' },
          { id: uuidv4(), name: 'view_calendar', resource: 'calendar', action: 'read' },
        ]
      }
    ];
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

export const rbacService = new RBACService();