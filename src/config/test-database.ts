import sqlite3 from 'sqlite3';
import { promisify } from 'util';

export class TestDatabaseManager {
  private db: sqlite3.Database;
  private initialized = false;

  constructor() {
    // Use in-memory SQLite database for testing
    this.db = new sqlite3.Database(':memory:');
  }

  async query(text: string, params?: unknown[]): Promise<any> {
    if (!this.initialized) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      // Convert PostgreSQL-style queries to SQLite
      const sqliteQuery = this.convertPostgresToSQLite(text);
      
      if (sqliteQuery.toLowerCase().trim().startsWith('select')) {
        this.db.all(sqliteQuery, params || [], (err, rows) => {
          if (err) reject(err);
          else resolve({ rows: rows || [] });
        });
      } else if (sqliteQuery.toLowerCase().includes('returning')) {
        // Handle INSERT/UPDATE with RETURNING clause
        const baseQuery = sqliteQuery.replace(/RETURNING \*/g, '').trim();
        const db = this.db; // Capture reference for closure
        
        this.db.run(baseQuery, params || [], function(err) {
          if (err) {
            reject(err);
          } else {
            // For RETURNING queries, we need to fetch the inserted/updated row
            // Since SQLite doesn't support RETURNING, we'll simulate it
            const tableName = extractTableName(baseQuery);
            if (tableName) {
              let selectQuery: string;
              let selectParams: unknown[];
              
              if (baseQuery.toLowerCase().includes('insert')) {
                // For INSERT, use the lastID
                selectQuery = `SELECT * FROM ${tableName} WHERE rowid = ?`;
                selectParams = [this.lastID];
              } else if (baseQuery.toLowerCase().includes('update')) {
                // For UPDATE, try to extract the WHERE clause to find the updated row
                const whereMatch = baseQuery.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s*$)/i);
                if (whereMatch && params && params.length > 0) {
                  // Use the WHERE clause from the original query
                  // For briefing updates, the WHERE clause is typically "id = ? AND tenant_id = ?"
                  // The last two parameters are usually the id and tenant_id
                  const updateParams = params.slice(0, -2); // Remove id and tenant_id from end
                  const id = params[params.length - 2]; // Second to last param is usually the id
                  const tenantId = params[params.length - 1]; // Last param is usually tenant_id
                  
                  selectQuery = `SELECT * FROM ${tableName} WHERE id = ? AND tenant_id = ?`;
                  selectParams = [id, tenantId];
                } else {
                  // Fallback: return empty result
                  resolve({ rowCount: this.changes, rows: [] });
                  return;
                }
              } else {
                // Unknown query type, return empty result
                resolve({ rowCount: this.changes, rows: [] });
                return;
              }
              
              db.get(selectQuery, selectParams, (selectErr, row) => {
                if (selectErr) reject(selectErr);
                else resolve({ rows: row ? [row] : [], rowCount: this.changes });
              });
            } else {
              // If we can't get the specific row, return success with changes count
              resolve({ rowCount: this.changes, rows: [] });
            }
          }
        });
      } else {
        this.db.run(sqliteQuery, params || [], function(err) {
          if (err) reject(err);
          else resolve({ rowCount: this.changes, rows: [] });
        });
      }
    });
    
    function extractTableName(query: string): string {
      // Extract table name from INSERT/UPDATE query
      const insertMatch = query.match(/INSERT INTO\s+(\w+)/i);
      if (insertMatch) return insertMatch[1];
      
      const updateMatch = query.match(/UPDATE\s+(\w+)/i);
      if (updateMatch) return updateMatch[1];
      
      return '';
    }
  }

  private convertPostgresToSQLite(query: string): string {
    // Convert PostgreSQL syntax to SQLite
    let converted = query
      .replace(/UUID/g, 'TEXT')
      .replace(/gen_random_uuid\(\)/g, 'lower(hex(randomblob(16)))')
      .replace(/JSONB/g, 'TEXT')
      .replace(/VARCHAR\(\d+\)/g, 'TEXT')
      .replace(/TIMESTAMP/g, 'DATETIME')
      .replace(/CURRENT_TIMESTAMP/g, 'datetime("now")')
      .replace(/CREATE SCHEMA IF NOT EXISTS "([^"]+)"/g, '')
      .replace(/DROP SCHEMA IF EXISTS "([^"]+)" CASCADE/g, '')
      .replace(/"([^"]+)"\./g, '') // Remove schema prefixes
      .replace(/\$(\d+)/g, '?'); // Convert $1, $2 to ?

    // Handle COALESCE in UPDATE statements for SQLite compatibility
    // COALESCE(?, column) should become: CASE WHEN ? IS NOT NULL THEN ? ELSE column END
    // But we need to duplicate the parameter for this to work
    // For simplicity, let's just handle the common UPDATE pattern differently
    if (converted.includes('COALESCE(?, ')) {
      // For UPDATE statements, we'll handle COALESCE by modifying the query structure
      // Instead of using COALESCE, we'll let the service handle null values
      converted = converted.replace(/COALESCE\(\?, ([^)]+)\)/g, '?');
    }
    
    return converted;
  }

  async createTenantSchema(tenantId: string): Promise<void> {
    // For SQLite testing, we'll use table prefixes instead of schemas
    const tablePrefix = `tenant_${tenantId.replace(/-/g, '_')}`;
    
    await this.query(`
      CREATE TABLE IF NOT EXISTS ${tablePrefix}_users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        roles TEXT DEFAULT '[]',
        permissions TEXT DEFAULT '[]',
        is_active INTEGER DEFAULT 1,
        last_login_at DATETIME,
        created_at DATETIME DEFAULT (datetime('now')),
        updated_at DATETIME DEFAULT (datetime('now'))
      )
    `);

    await this.query(`
      CREATE TABLE IF NOT EXISTS ${tablePrefix}_briefings (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('internal', 'external')),
        template_id TEXT,
        fields TEXT DEFAULT '{}',
        version INTEGER DEFAULT 1,
        status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
        tenant_id TEXT NOT NULL,
        client_id TEXT,
        created_by TEXT NOT NULL,
        created_at DATETIME DEFAULT (datetime('now')),
        updated_at DATETIME DEFAULT (datetime('now'))
      )
    `);

    await this.query(`
      CREATE TABLE IF NOT EXISTS ${tablePrefix}_content (
        id TEXT PRIMARY KEY,
        briefing_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        content_type TEXT NOT NULL CHECK (content_type IN ('text', 'image', 'video', 'carousel')),
        base_content TEXT DEFAULT '{}',
        adapted_content TEXT DEFAULT '{}',
        workflow_id TEXT,
        tenant_id TEXT NOT NULL,
        client_id TEXT,
        created_by TEXT NOT NULL,
        created_at DATETIME DEFAULT (datetime('now')),
        updated_at DATETIME DEFAULT (datetime('now'))
      )
    `);
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;

    // Set initialized flag first to prevent recursion
    this.initialized = true;

    // Create main tables using direct database calls to avoid recursion
    await new Promise<void>((resolve, reject) => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS tenants (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('platform', 'agency', 'client')),
          parent_id TEXT,
          brand_config TEXT DEFAULT '{}',
          settings TEXT DEFAULT '{}',
          created_at DATETIME DEFAULT (datetime('now')),
          updated_at DATETIME DEFAULT (datetime('now'))
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          tenant_id TEXT NOT NULL,
          roles TEXT DEFAULT '[]',
          permissions TEXT DEFAULT '[]',
          is_active INTEGER DEFAULT 1,
          last_login_at DATETIME,
          created_at DATETIME DEFAULT (datetime('now')),
          updated_at DATETIME DEFAULT (datetime('now'))
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS email_templates (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          subject TEXT NOT NULL,
          html_content TEXT NOT NULL,
          text_content TEXT NOT NULL,
          variables TEXT DEFAULT '[]',
          tenant_id TEXT NOT NULL,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT (datetime('now')),
          updated_at DATETIME DEFAULT (datetime('now'))
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          user_id TEXT,
          action TEXT NOT NULL,
          resource TEXT NOT NULL,
          resource_id TEXT,
          details TEXT DEFAULT '{}',
          ip_address TEXT,
          user_agent TEXT,
          created_at DATETIME DEFAULT (datetime('now'))
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create briefing templates table
    await new Promise<void>((resolve, reject) => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS briefing_templates (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          fields TEXT DEFAULT '[]',
          required_fields TEXT DEFAULT '[]',
          tenant_id TEXT NOT NULL,
          is_active INTEGER DEFAULT 1,
          created_by TEXT NOT NULL,
          created_at DATETIME DEFAULT (datetime('now')),
          updated_at DATETIME DEFAULT (datetime('now'))
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create briefings table
    await new Promise<void>((resolve, reject) => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS briefings (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('internal', 'external')),
          template_id TEXT NOT NULL,
          fields TEXT DEFAULT '{}',
          version INTEGER DEFAULT 1,
          status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
          tenant_id TEXT NOT NULL,
          client_id TEXT,
          created_by TEXT NOT NULL,
          created_at DATETIME DEFAULT (datetime('now')),
          updated_at DATETIME DEFAULT (datetime('now'))
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create briefing_versions table
    await new Promise<void>((resolve, reject) => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS briefing_versions (
          id TEXT PRIMARY KEY,
          briefing_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          fields TEXT NOT NULL DEFAULT '{}',
          changes TEXT NOT NULL DEFAULT '[]',
          tenant_id TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at DATETIME DEFAULT (datetime('now')),
          UNIQUE(briefing_id, version)
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create content table
    await new Promise<void>((resolve, reject) => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS content (
          id TEXT PRIMARY KEY,
          briefing_id TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          content_type TEXT NOT NULL CHECK (content_type IN ('text', 'image', 'video', 'carousel')),
          base_content TEXT DEFAULT '{}',
          adapted_content TEXT DEFAULT '{}',
          workflow_id TEXT,
          tenant_id TEXT NOT NULL,
          client_id TEXT,
          created_by TEXT NOT NULL,
          created_at DATETIME DEFAULT (datetime('now')),
          updated_at DATETIME DEFAULT (datetime('now'))
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create workflows table
    await new Promise<void>((resolve, reject) => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS workflows (
          id TEXT PRIMARY KEY,
          content_id TEXT NOT NULL,
          current_state TEXT NOT NULL DEFAULT 'research' CHECK (current_state IN (
            'research', 'planning', 'content', 'creative', 'brand_apply', 
            'compliance_check', 'approval', 'publish', 'monitor'
          )),
          tenant_id TEXT NOT NULL,
          created_at DATETIME DEFAULT (datetime('now')),
          updated_at DATETIME DEFAULT (datetime('now'))
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create workflow events table
    await new Promise<void>((resolve, reject) => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS workflow_events (
          id TEXT PRIMARY KEY,
          workflow_id TEXT NOT NULL,
          from_state TEXT CHECK (from_state IN (
            'research', 'planning', 'content', 'creative', 'brand_apply', 
            'compliance_check', 'approval', 'publish', 'monitor'
          )),
          to_state TEXT NOT NULL CHECK (to_state IN (
            'research', 'planning', 'content', 'creative', 'brand_apply', 
            'compliance_check', 'approval', 'publish', 'monitor'
          )),
          user_id TEXT NOT NULL,
          reason TEXT,
          metadata TEXT DEFAULT '{}',
          created_at DATETIME DEFAULT (datetime('now'))
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create workflow comments table
    await new Promise<void>((resolve, reject) => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS workflow_comments (
          id TEXT PRIMARY KEY,
          workflow_id TEXT NOT NULL,
          parent_id TEXT,
          user_id TEXT NOT NULL,
          content TEXT NOT NULL,
          state TEXT NOT NULL CHECK (state IN (
            'research', 'planning', 'content', 'creative', 'brand_apply', 
            'compliance_check', 'approval', 'publish', 'monitor'
          )),
          is_resolved INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT (datetime('now')),
          updated_at DATETIME DEFAULT (datetime('now'))
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create approvals table
    await new Promise<void>((resolve, reject) => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS approvals (
          id TEXT PRIMARY KEY,
          workflow_id TEXT NOT NULL,
          requested_by TEXT NOT NULL,
          approvers TEXT NOT NULL DEFAULT '[]',
          required_approvals INTEGER NOT NULL DEFAULT 1,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
          requested_at DATETIME DEFAULT (datetime('now')),
          completed_at DATETIME
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create approval responses table
    await new Promise<void>((resolve, reject) => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS approval_responses (
          id TEXT PRIMARY KEY,
          approval_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
          comment TEXT,
          created_at DATETIME DEFAULT (datetime('now'))
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create AI provider tables for testing
    await new Promise<void>((resolve, reject) => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS ai_providers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          capabilities TEXT DEFAULT '[]',
          config TEXT DEFAULT '{}',
          is_active INTEGER DEFAULT 1,
          health_status TEXT DEFAULT '{}',
          tenant_id TEXT,
          created_at DATETIME DEFAULT (datetime('now')),
          updated_at DATETIME DEFAULT (datetime('now'))
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create AI request logs table
    await new Promise<void>((resolve, reject) => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS ai_request_logs (
          id TEXT PRIMARY KEY,
          request_id TEXT NOT NULL,
          provider_id TEXT,
          tenant_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          request_type TEXT NOT NULL,
          prompt TEXT NOT NULL,
          options TEXT DEFAULT '{}',
          response_status TEXT NOT NULL,
          error_message TEXT,
          processing_time INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT (datetime('now'))
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create AI usage logs table
    await new Promise<void>((resolve, reject) => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS ai_usage_logs (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          credits_consumed INTEGER DEFAULT 0,
          request_count INTEGER DEFAULT 0,
          processing_time INTEGER DEFAULT 0,
          tokens_used INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT (datetime('now'))
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create best practices table
    await new Promise<void>((resolve, reject) => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS best_practices (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          content_type TEXT NOT NULL,
          objective TEXT NOT NULL,
          rules TEXT DEFAULT '[]',
          examples TEXT DEFAULT '{"positive": [], "negative": []}',
          priority INTEGER DEFAULT 1,
          is_custom INTEGER DEFAULT 0,
          tenant_id TEXT,
          created_at DATETIME DEFAULT (datetime('now'))
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create brand voice guidelines table
    await new Promise<void>((resolve, reject) => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS brand_voice_guidelines (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          tone TEXT NOT NULL,
          personality TEXT DEFAULT '[]',
          dos_list TEXT DEFAULT '[]',
          donts_list TEXT DEFAULT '[]',
          examples TEXT DEFAULT '[]',
          tenant_id TEXT NOT NULL,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT (datetime('now')),
          updated_at DATETIME DEFAULT (datetime('now'))
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create calendar events table
    await new Promise<void>((resolve, reject) => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS calendar_events (
          id TEXT PRIMARY KEY,
          content_id TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          scheduled_at DATETIME NOT NULL,
          platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'facebook', 'linkedin')),
          status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'published', 'failed', 'cancelled')),
          tenant_id TEXT NOT NULL,
          client_id TEXT,
          created_by TEXT NOT NULL,
          published_at DATETIME,
          failure_reason TEXT,
          retry_count INTEGER NOT NULL DEFAULT 0,
          metadata TEXT DEFAULT '{}',
          created_at DATETIME DEFAULT (datetime('now')),
          updated_at DATETIME DEFAULT (datetime('now'))
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create platform scheduling rules table
    await new Promise<void>((resolve, reject) => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS platform_scheduling_rules (
          id TEXT PRIMARY KEY,
          platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'facebook', 'linkedin')),
          max_posts_per_hour INTEGER NOT NULL DEFAULT 1,
          max_posts_per_day INTEGER NOT NULL DEFAULT 10,
          min_interval_minutes INTEGER NOT NULL DEFAULT 60,
          optimal_times TEXT NOT NULL DEFAULT '[]',
          blackout_periods TEXT DEFAULT '[]',
          tenant_id TEXT NOT NULL,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT (datetime('now')),
          updated_at DATETIME DEFAULT (datetime('now'))
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create rescheduling rules table
    await new Promise<void>((resolve, reject) => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS rescheduling_rules (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          condition TEXT NOT NULL CHECK (condition IN ('failure', 'conflict', 'manual')),
          action TEXT NOT NULL CHECK (action IN ('retry', 'reschedule', 'cancel')),
          delay_minutes INTEGER NOT NULL DEFAULT 60,
          max_retries INTEGER NOT NULL DEFAULT 3,
          tenant_id TEXT NOT NULL,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT (datetime('now')),
          updated_at DATETIME DEFAULT (datetime('now'))
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      this.db.close(() => resolve());
    });
  }

  async dropTenantTables(tenantId: string): Promise<void> {
    const tablePrefix = `tenant_${tenantId.replace(/-/g, '_')}`;
    
    try {
      await this.query(`DROP TABLE IF EXISTS ${tablePrefix}_users`);
      await this.query(`DROP TABLE IF EXISTS ${tablePrefix}_briefings`);
      await this.query(`DROP TABLE IF EXISTS ${tablePrefix}_content`);
    } catch (error) {
      console.warn(`Failed to drop tables for tenant ${tenantId}:`, error);
    }
  }
}