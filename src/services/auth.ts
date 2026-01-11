import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { User, LoginCredentials, AuthResult, TokenPair, Permission, Role, Resource, Action } from '../types';
import { db } from '../config/database';
import { redis } from '../config/redis';

export class AuthenticationService {
  private jwtSecret: string;
  private jwtExpiresIn: string;
  private refreshExpiresIn: string;
  private bcryptRounds: number;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'default-secret-change-in-production';
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';
    this.refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
    this.bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
  }

  async authenticate(credentials: LoginCredentials): Promise<AuthResult> {
    try {
      const { email, password, tenantId } = credentials;

      // Find user in the appropriate tenant schema
      const schemaName = tenantId ? `tenant_${tenantId.replace(/-/g, '_')}` : 'public';
      
      const userResult = await db.query(
        `SELECT * FROM "${schemaName}".users WHERE email = $1 AND is_active = true`,
        [email]
      );

      if (userResult.rows.length === 0) {
        return { success: false, error: 'Invalid credentials' };
      }

      const user = userResult.rows[0];
      const isValidPassword = await bcrypt.compare(password, user.password_hash);

      if (!isValidPassword) {
        return { success: false, error: 'Invalid credentials' };
      }

      // Update last login
      await db.query(
        `UPDATE "${schemaName}".users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [user.id]
      );

      // Generate tokens
      const tokens = await this.generateTokens(user);

      // Store refresh token in Redis
      await redis.set(
        `refresh_token:${user.id}`,
        tokens.refreshToken,
        7 * 24 * 60 * 60 // 7 days in seconds
      );

      return {
        success: true,
        user: this.mapDbUserToUser(user),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    } catch (error) {
      console.error('Authentication error:', error);
      return { success: false, error: 'Authentication failed' };
    }
  }

  async refreshToken(refreshToken: string): Promise<TokenPair> {
    try {
      const decoded = jwt.verify(refreshToken, this.jwtSecret) as any;
      const userId = decoded.userId;

      // Check if refresh token exists in Redis
      const storedToken = await redis.get(`refresh_token:${userId}`);
      if (!storedToken || storedToken !== refreshToken) {
        throw new Error('Invalid refresh token');
      }

      // Get user data
      const userResult = await db.query(
        'SELECT * FROM public.tenants t JOIN public.users u ON t.id = u.tenant_id WHERE u.id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = userResult.rows[0];
      const tokens = await this.generateTokens(user);

      // Update refresh token in Redis
      await redis.set(
        `refresh_token:${userId}`,
        tokens.refreshToken,
        7 * 24 * 60 * 60
      );

      return tokens;
    } catch (error) {
      throw new Error('Token refresh failed');
    }
  }

  async hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, this.bcryptRounds);
  }

  async verifyToken(token: string): Promise<User | null> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      
      // Get user from database to ensure they still exist and are active
      const userResult = await db.query(
        'SELECT * FROM public.users WHERE id = $1 AND is_active = true',
        [decoded.userId]
      );

      if (userResult.rows.length === 0) {
        return null;
      }

      return this.mapDbUserToUser(userResult.rows[0]);
    } catch (error) {
      return null;
    }
  }

  private async generateTokens(user: any): Promise<TokenPair> {
    const payload = {
      userId: user.id,
      email: user.email,
      tenantId: user.tenant_id,
    };

    const accessToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn,
    });

    const refreshToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.refreshExpiresIn,
    });

    return { accessToken, refreshToken };
  }

  private mapDbUserToUser(dbUser: any): User {
    return {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      passwordHash: dbUser.password_hash,
      tenantId: dbUser.tenant_id,
      roles: dbUser.roles || [],
      permissions: dbUser.permissions || [],
      isActive: dbUser.is_active,
      lastLoginAt: dbUser.last_login_at,
      createdAt: dbUser.created_at,
      updatedAt: dbUser.updated_at,
    };
  }
}

export class RoleBasedAccessControl {
  async assignRole(userId: string, tenantId: string, role: Role): Promise<void> {
    const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;
    
    // Get current roles
    const userResult = await db.query(
      `SELECT roles FROM "${schemaName}".users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const currentRoles = userResult.rows[0].roles || [];
    const updatedRoles = [...currentRoles, role];

    await db.query(
      `UPDATE "${schemaName}".users SET roles = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [JSON.stringify(updatedRoles), userId]
    );
  }

  async checkPermission(userId: string, permission: Permission): Promise<boolean> {
    try {
      // Get user with roles and permissions
      const userResult = await db.query(
        'SELECT roles, permissions FROM public.users WHERE id = $1 AND is_active = true',
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
        p.resource === permission.resource && p.action === permission.action
      );

      if (hasDirectPermission) {
        return true;
      }

      // Check role-based permissions
      const hasRolePermission = userRoles.some((role: Role) =>
        role.permissions.some((p: Permission) =>
          p.resource === permission.resource && p.action === permission.action
        )
      );

      return hasRolePermission;
    } catch (error) {
      console.error('Permission check error:', error);
      return false;
    }
  }

  async getRoles(userId: string, tenantId: string): Promise<Role[]> {
    const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;
    
    const userResult = await db.query(
      `SELECT roles FROM "${schemaName}".users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return [];
    }

    return userResult.rows[0].roles || [];
  }
}

export const authService = new AuthenticationService();
export const rbac = new RoleBasedAccessControl();