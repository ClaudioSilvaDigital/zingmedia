import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth';
import { rbacService } from '../services/rbac';
import { User, Permission } from '../types';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Middleware to authenticate JWT tokens and attach user to request
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({
        error: 'Access token required',
        message: 'Please provide a valid access token'
      });
      return;
    }

    const user = await authService.verifyToken(token);

    if (!user) {
      res.status(401).json({
        error: 'Invalid token',
        message: 'The provided token is invalid or expired'
      });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    res.status(500).json({
      error: 'Authentication failed',
      message: 'Internal server error during authentication'
    });
  }
};

/**
 * Middleware factory to check specific permissions
 */
export const requirePermission = (resource: string, action: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User must be authenticated to access this resource'
        });
        return;
      }

      if (!req.tenantContext) {
        res.status(400).json({
          error: 'Tenant context required',
          message: 'Tenant context middleware must be applied first'
        });
        return;
      }

      const hasPermission = await rbacService.checkPermission(
        req.user.id,
        req.tenantContext.tenantId,
        resource,
        action
      );

      if (!hasPermission) {
        res.status(403).json({
          error: 'Insufficient permissions',
          message: `User does not have permission to ${action} ${resource}`,
          required: { resource, action }
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Permission check middleware error:', error);
      res.status(500).json({
        error: 'Authorization failed',
        message: 'Internal server error during authorization'
      });
    }
  };
};

/**
 * Middleware to check multiple permissions (user needs at least one)
 */
export const requireAnyPermission = (permissions: Array<{ resource: string; action: string }>) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User must be authenticated to access this resource'
        });
        return;
      }

      if (!req.tenantContext) {
        res.status(400).json({
          error: 'Tenant context required',
          message: 'Tenant context middleware must be applied first'
        });
        return;
      }

      let hasAnyPermission = false;

      for (const permission of permissions) {
        const hasPermission = await rbacService.checkPermission(
          req.user.id,
          req.tenantContext.tenantId,
          permission.resource,
          permission.action
        );

        if (hasPermission) {
          hasAnyPermission = true;
          break;
        }
      }

      if (!hasAnyPermission) {
        res.status(403).json({
          error: 'Insufficient permissions',
          message: 'User does not have any of the required permissions',
          required: permissions
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Multiple permission check middleware error:', error);
      res.status(500).json({
        error: 'Authorization failed',
        message: 'Internal server error during authorization'
      });
    }
  };
};

/**
 * Middleware to check if user has specific role
 */
export const requireRole = (roleName: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User must be authenticated to access this resource'
        });
        return;
      }

      if (!req.tenantContext) {
        res.status(400).json({
          error: 'Tenant context required',
          message: 'Tenant context middleware must be applied first'
        });
        return;
      }

      const userRoles = await rbacService.getTenantRoles(req.tenantContext.tenantId);
      const hasRole = req.user.roles.some(role => role.name === roleName);

      if (!hasRole) {
        res.status(403).json({
          error: 'Insufficient role',
          message: `User must have ${roleName} role to access this resource`,
          required: { role: roleName }
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Role check middleware error:', error);
      res.status(500).json({
        error: 'Authorization failed',
        message: 'Internal server error during role verification'
      });
    }
  };
};

/**
 * Middleware to check if user can access specific client data
 */
export const requireClientAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'User must be authenticated to access this resource'
      });
      return;
    }

    if (!req.tenantContext) {
      res.status(400).json({
        error: 'Tenant context required',
        message: 'Tenant context middleware must be applied first'
      });
      return;
    }

    const clientId = req.params.clientId || req.body.clientId;
    
    if (!clientId) {
      res.status(400).json({
        error: 'Client ID required',
        message: 'Client ID must be provided in request'
      });
      return;
    }

    // Check if user has permission to access this client's data
    // This could involve checking if the client belongs to the user's agency
    // For now, we'll check if user has general client access permissions
    const hasClientAccess = await rbacService.checkPermission(
      req.user.id,
      req.tenantContext.tenantId,
      'clients',
      'read'
    );

    if (!hasClientAccess) {
      res.status(403).json({
        error: 'Client access denied',
        message: 'User does not have permission to access client data'
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Client access middleware error:', error);
    res.status(500).json({
      error: 'Authorization failed',
      message: 'Internal server error during client access verification'
    });
  }
};

/**
 * Middleware to check resource ownership or admin access
 */
export const requireOwnershipOrAdmin = (resourceType: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User must be authenticated to access this resource'
        });
        return;
      }

      if (!req.tenantContext) {
        res.status(400).json({
          error: 'Tenant context required',
          message: 'Tenant context middleware must be applied first'
        });
        return;
      }

      const resourceId = req.params.id || req.params.resourceId;
      
      if (!resourceId) {
        res.status(400).json({
          error: 'Resource ID required',
          message: 'Resource ID must be provided in request'
        });
        return;
      }

      // Check if user is admin (can access any resource)
      const isAdmin = await rbacService.checkPermission(
        req.user.id,
        req.tenantContext.tenantId,
        resourceType,
        'admin'
      );

      if (isAdmin) {
        next();
        return;
      }

      // Check if user owns the resource
      // This would typically involve a database query to check ownership
      // For now, we'll assume ownership check is handled in the service layer
      const hasManagePermission = await rbacService.checkPermission(
        req.user.id,
        req.tenantContext.tenantId,
        resourceType,
        'update'
      );

      if (!hasManagePermission) {
        res.status(403).json({
          error: 'Access denied',
          message: 'User does not have permission to access this resource'
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Ownership check middleware error:', error);
      res.status(500).json({
        error: 'Authorization failed',
        message: 'Internal server error during ownership verification'
      });
    }
  };
};