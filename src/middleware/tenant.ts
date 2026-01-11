import { Request, Response, NextFunction } from 'express';
import { TenantContext } from '../types';

// Extend Express Request to include tenant context
declare global {
  namespace Express {
    interface Request {
      tenantContext?: TenantContext;
    }
  }
}

export const tenantContextMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // For now, create a basic tenant context
  // In production, this would extract tenant info from JWT token or headers
  req.tenantContext = {
    tenantId: 'default-tenant',
    user: {
      id: 'default-user',
      email: 'user@example.com',
      name: 'Default User'
    }
  };
  
  next();
};