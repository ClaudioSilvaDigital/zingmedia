import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export const getDatabaseConfig = (): DatabaseConfig => {
  return {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    database: process.env.DATABASE_NAME || 'content_automation_platform',
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || '',
    ssl: process.env.NODE_ENV === 'production',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };
};

export class DatabaseManager {
  private pool: Pool;

  constructor(config?: DatabaseConfig) {
    const dbConfig = config || getDatabaseConfig();
    this.pool = new Pool(dbConfig as PoolConfig);
  }

  async query(text: string, params?: unknown[]): Promise<any> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  }

  async createTenantSchema(tenantId: string): Promise<void> {
    const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;
    
    await this.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
    
    // Create tenant-specific tables
    await this.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}".users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        tenant_id UUID NOT NULL,
        roles JSONB DEFAULT '[]',
        permissions JSONB DEFAULT '[]',
        is_active BOOLEAN DEFAULT true,
        last_login_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}".briefings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL CHECK (type IN ('internal', 'external')),
        template_id UUID,
        fields JSONB DEFAULT '{}',
        version INTEGER DEFAULT 1,
        status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
        tenant_id UUID NOT NULL,
        client_id UUID,
        created_by UUID NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}".content (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        briefing_id UUID NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('text', 'image', 'video', 'carousel')),
        base_content JSONB DEFAULT '{}',
        adapted_content JSONB DEFAULT '{}',
        workflow_id UUID,
        tenant_id UUID NOT NULL,
        client_id UUID,
        created_by UUID NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export const db = new DatabaseManager();