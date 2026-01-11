// Database interface abstraction to support both PostgreSQL and SQLite
export interface DatabaseClient {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number }>;
  release?(): void;
}

export interface DatabasePool {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number }>;
  connect?(): Promise<DatabaseClient>;
}

// Adapter for PostgreSQL Pool
export class PostgreSQLAdapter implements DatabasePool {
  constructor(private pool: any) {}

  async query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number }> {
    return this.pool.query(text, params);
  }

  async connect(): Promise<DatabaseClient> {
    const client = await this.pool.connect();
    return {
      query: (text: string, params?: unknown[]) => client.query(text, params),
      release: () => client.release()
    };
  }
}

// Adapter for SQLite (test database)
export class SQLiteAdapter implements DatabasePool {
  constructor(private db: any) {}

  async query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number }> {
    return this.db.query(text, params);
  }

  // SQLite doesn't need connection pooling, so we return the same instance
  async connect(): Promise<DatabaseClient> {
    return {
      query: (text: string, params?: unknown[]) => this.db.query(text, params)
    };
  }
}