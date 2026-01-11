import { v4 as uuidv4 } from 'uuid';
import { 
  AIProvider, 
  AIRequest, 
  AIResponse, 
  GenerationOptions, 
  GeneratedContent, 
  HealthCheck, 
  UsageMetrics, 
  ProviderCredentials,
  AIProviderInterface,
  AICapability,
  ProviderConfig,
  HealthStatus
} from '../types';
import { db } from '../config/database';

// Database interface for dependency injection
interface DatabaseConnection {
  query(text: string, params?: unknown[]): Promise<any>;
}

export class AIIntegrationHub {
  private providers: Map<string, AIProviderInterface> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private database: DatabaseConnection;

  constructor(database?: DatabaseConnection) {
    this.database = database || db;
    // Start health monitoring
    this.startHealthMonitoring();
  }

  /**
   * Register a new AI provider
   */
  async registerProvider(provider: AIProviderInterface, config: ProviderConfig, tenantId: string): Promise<void> {
    try {
      // Test provider connectivity
      const credentials: ProviderCredentials = {
        apiKey: config.apiKey,
        secretKey: config.additionalHeaders?.['X-Secret-Key'],
        additionalCredentials: config.additionalHeaders
      };

      const isAuthenticated = await provider.authenticate(credentials);
      if (!isAuthenticated) {
        throw new Error(`Failed to authenticate with provider: ${provider.name}`);
      }

      // Perform initial health check
      const healthCheck = await provider.checkHealth();
      
      const healthStatus: HealthStatus = {
        isHealthy: healthCheck.isHealthy,
        lastChecked: healthCheck.timestamp,
        responseTime: healthCheck.responseTime,
        errorMessage: healthCheck.error,
        consecutiveFailures: healthCheck.isHealthy ? 0 : 1
      };

      // Store provider in database
      const providerId = provider.id; // Use the provider's existing ID instead of generating a new one
      
      // Use different SQL syntax based on database type
      const insertQuery = this.database === db ? 
        // PostgreSQL syntax
        `INSERT INTO public.ai_providers (
          id, name, type, capabilities, config, is_active, health_status, tenant_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)` :
        // SQLite syntax
        `INSERT INTO ai_providers (
          id, name, type, capabilities, config, is_active, health_status, tenant_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`;

      await this.database.query(insertQuery, [
        providerId,
        provider.name,
        this.getProviderType(provider.capabilities),
        JSON.stringify(provider.capabilities),
        JSON.stringify(config),
        true,
        JSON.stringify(healthStatus),
        tenantId
      ]);

      // Store provider instance in memory
      const dbProvider: AIProvider = {
        id: providerId,
        name: provider.name,
        type: this.getProviderType(provider.capabilities),
        capabilities: provider.capabilities,
        config,
        isActive: true,
        healthStatus,
        tenantId,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.providers.set(providerId, provider);

      console.log(`AI provider registered: ${provider.name} (${providerId})`);
    } catch (error) {
      console.error('Error registering AI provider:', error);
      throw new Error(`Failed to register AI provider: ${provider.name}`);
    }
  }

  /**
   * Test connectivity to a specific provider
   */
  async testConnectivity(providerId: string): Promise<HealthCheck> {
    try {
      const provider = this.providers.get(providerId);
      if (!provider) {
        throw new Error(`Provider not found: ${providerId}`);
      }

      const healthCheck = await provider.checkHealth();
      
      // Update health status in database
      await this.updateProviderHealth(providerId, healthCheck);

      return healthCheck;
    } catch (error) {
      console.error('Error testing provider connectivity:', error);
      
      const errorHealthCheck: HealthCheck = {
        providerId,
        isHealthy: false,
        responseTime: 0,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      await this.updateProviderHealth(providerId, errorHealthCheck);
      return errorHealthCheck;
    }
  }

  /**
   * Get all active providers for a tenant
   */
  async getActiveProviders(tenantId?: string): Promise<any[]> {
    try {
      let query = 'SELECT * FROM ai_providers WHERE is_active = 1';
      const params: any[] = [];
      
      if (tenantId) {
        query += ' AND (tenant_id = ? OR tenant_id IS NULL)';
        params.push(tenantId);
      }
      
      // Handle both Pool and TestDatabaseManager interfaces
      let result;
      if (this.db && typeof this.db.query === 'function') {
        result = await this.db.query(query, params);
      } else {
        console.warn('Database not available for getActiveProviders');
        return [];
      }
      
      const rows = result.rows || result || [];
      return rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        capabilities: JSON.parse(row.capabilities || '[]'),
        isActive: Boolean(row.is_active),
        healthStatus: JSON.parse(row.health_status || '{"isHealthy": false}'),
        tenantId: row.tenant_id,
        createdAt: new Date(row.created_at)
      }));
    } catch (error) {
      console.error('Error getting active providers:', error);
      return [];
    }
  }

  /**
   * Route AI request to appropriate provider with fallback
   */
  async routeRequest(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    
    try {
      // Find suitable providers for the request type
      const suitableProviders = await this.findSuitableProviders(request.type, request.tenantId);
      
      if (suitableProviders.length === 0) {
        throw new Error(`No suitable providers found for request type: ${request.type}`);
      }

      // Try providers in order of health and priority
      let lastError: Error | null = null;
      
      for (const dbProvider of suitableProviders) {
        const provider = this.providers.get(dbProvider.id);
        if (!provider) continue;

        try {
          // Generate content using the provider
          const content = await provider.generateContent(request.prompt, request.options);
          
          // Get usage metrics
          const usage = await provider.getUsage(request.tenantId);
          
          const processingTime = Date.now() - startTime;
          
          // Create successful response
          const response: AIResponse = {
            id: uuidv4(),
            requestId: request.id,
            providerId: dbProvider.id,
            content,
            usage,
            status: 'success',
            processingTime,
            createdAt: new Date()
          };

          // Log successful request
          await this.logAIRequest(request, response);
          
          // Update usage tracking
          await this.updateUsageTracking(request.tenantId, dbProvider.id, usage);

          return response;
        } catch (providerError) {
          console.warn(`Provider ${dbProvider.name} failed:`, providerError);
          lastError = providerError instanceof Error ? providerError : new Error('Unknown provider error');
          
          // Update provider health status
          await this.recordProviderFailure(dbProvider.id);
          continue;
        }
      }

      // All providers failed
      throw lastError || new Error('All providers failed');
    } catch (error) {
      console.error('Error routing AI request:', error);
      
      const processingTime = Date.now() - startTime;
      const errorResponse: AIResponse = {
        id: uuidv4(),
        requestId: request.id,
        providerId: '',
        content: { type: request.type, data: '' },
        usage: { creditsConsumed: 0, requestCount: 1, processingTime },
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime,
        createdAt: new Date()
      };

      await this.logAIRequest(request, errorResponse);
      return errorResponse;
    }
  }

  /**
   * Monitor usage for a specific tenant
   */
  async monitorUsage(tenantId: string): Promise<UsageMetrics> {
    try {
      const query = this.database === db ?
        // PostgreSQL syntax
        `SELECT 
          COALESCE(SUM(credits_consumed), 0) as total_credits,
          COALESCE(SUM(request_count), 0) as total_requests,
          COALESCE(AVG(processing_time), 0) as avg_processing_time,
          COALESCE(SUM(tokens_used), 0) as total_tokens
        FROM public.ai_usage_logs 
        WHERE tenant_id = $1 
        AND created_at >= CURRENT_DATE - INTERVAL '30 days'` :
        // SQLite syntax
        `SELECT 
          COALESCE(SUM(credits_consumed), 0) as total_credits,
          COALESCE(SUM(request_count), 0) as total_requests,
          COALESCE(AVG(processing_time), 0) as avg_processing_time,
          COALESCE(SUM(tokens_used), 0) as total_tokens
        FROM ai_usage_logs 
        WHERE tenant_id = ? 
        AND created_at >= date('now', '-30 days')`;

      const result = await this.database.query(query, [tenantId]);

      const row = result.rows ? result.rows[0] : result[0];
      
      return {
        creditsConsumed: parseInt(row.total_credits) || 0,
        requestCount: parseInt(row.total_requests) || 0,
        processingTime: parseFloat(row.avg_processing_time) || 0,
        tokensUsed: parseInt(row.total_tokens) || 0
      };
    } catch (error) {
      console.error('Error monitoring usage:', error);
      return {
        creditsConsumed: 0,
        requestCount: 0,
        processingTime: 0,
        tokensUsed: 0
      };
    }
  }

  /**
   * Get all registered providers for a tenant
   */
  async getProviders(tenantId: string): Promise<AIProvider[]> {
    try {
      const query = this.database === db ?
        // PostgreSQL syntax
        `SELECT * FROM public.ai_providers 
        WHERE tenant_id = $1 OR tenant_id IS NULL
        ORDER BY is_active DESC, name ASC` :
        // SQLite syntax
        `SELECT * FROM ai_providers 
        WHERE tenant_id = ? OR tenant_id IS NULL
        ORDER BY is_active DESC, name ASC`;

      const result = await this.database.query(query, [tenantId]);

      const rows = result.rows || result;
      return rows.map((row: any) => this.mapDbProviderToProvider(row));
    } catch (error) {
      console.error('Error getting providers:', error);
      return [];
    }
  }

  /**
   * Update provider configuration
   */
  async updateProvider(providerId: string, config: Partial<ProviderConfig>): Promise<void> {
    try {
      const selectQuery = this.database === db ?
        'SELECT config FROM public.ai_providers WHERE id = $1' :
        'SELECT config FROM ai_providers WHERE id = ?';

      const currentProvider = await this.database.query(selectQuery, [providerId]);

      const rows = currentProvider.rows || currentProvider;
      if (rows.length === 0) {
        throw new Error('Provider not found');
      }

      const currentConfig = rows[0].config;
      const updatedConfig = { ...currentConfig, ...config };

      const updateQuery = this.database === db ?
        `UPDATE public.ai_providers 
        SET config = $1, updated_at = CURRENT_TIMESTAMP 
        WHERE id = $2` :
        `UPDATE ai_providers 
        SET config = ?, updated_at = datetime('now') 
        WHERE id = ?`;

      await this.database.query(updateQuery, [JSON.stringify(updatedConfig), providerId]);

      console.log(`Provider configuration updated: ${providerId}`);
    } catch (error) {
      console.error('Error updating provider:', error);
      throw new Error('Failed to update provider configuration');
    }
  }

  /**
   * Deactivate a provider
   */
  async deactivateProvider(providerId: string): Promise<void> {
    try {
      const query = this.database === db ?
        `UPDATE public.ai_providers 
        SET is_active = false, updated_at = CURRENT_TIMESTAMP 
        WHERE id = $1` :
        `UPDATE ai_providers 
        SET is_active = 0, updated_at = datetime('now') 
        WHERE id = ?`;

      await this.database.query(query, [providerId]);

      // Remove from memory
      this.providers.delete(providerId);

      console.log(`Provider deactivated: ${providerId}`);
    } catch (error) {
      console.error('Error deactivating provider:', error);
      throw new Error('Failed to deactivate provider');
    }
  }

  /**
   * Find suitable providers for a request type
   */
  private async findSuitableProviders(requestType: string, tenantId: string): Promise<AIProvider[]> {
    try {
      const query = this.database === db ?
        // PostgreSQL syntax
        `SELECT * FROM public.ai_providers 
        WHERE (tenant_id = $1 OR tenant_id IS NULL)
        AND is_active = true
        AND capabilities::text LIKE $2
        ORDER BY 
          CASE WHEN tenant_id = $1 THEN 0 ELSE 1 END,
          (health_status->>'isHealthy')::boolean DESC,
          (health_status->>'consecutiveFailures')::int ASC,
          (health_status->>'responseTime')::int ASC` :
        // SQLite syntax
        `SELECT * FROM ai_providers 
        WHERE (tenant_id = ? OR tenant_id IS NULL)
        AND is_active = 1
        AND capabilities LIKE ?
        ORDER BY 
          CASE WHEN tenant_id = ? THEN 0 ELSE 1 END,
          json_extract(health_status, '$.isHealthy') DESC,
          json_extract(health_status, '$.consecutiveFailures') ASC,
          json_extract(health_status, '$.responseTime') ASC`;

      const params = this.database === db ? 
        [tenantId, `%${requestType}%`] : 
        [tenantId, `%${requestType}%`, tenantId];

      const result = await this.database.query(query, params);

      const rows = result.rows || result;
      return rows.map((row: any) => this.mapDbProviderToProvider(row));
    } catch (error) {
      console.error('Error finding suitable providers:', error);
      return [];
    }
  }

  /**
   * Update provider health status
   */
  private async updateProviderHealth(providerId: string, healthCheck: HealthCheck): Promise<void> {
    try {
      const selectQuery = this.database === db ?
        'SELECT health_status FROM public.ai_providers WHERE id = $1' :
        'SELECT health_status FROM ai_providers WHERE id = ?';

      const currentProvider = await this.database.query(selectQuery, [providerId]);

      const rows = currentProvider.rows || currentProvider;
      if (rows.length === 0) {
        return;
      }

      const currentHealth = typeof rows[0].health_status === 'string' ? 
        JSON.parse(rows[0].health_status) : rows[0].health_status;
      const consecutiveFailures = healthCheck.isHealthy ? 0 : (currentHealth.consecutiveFailures || 0) + 1;

      const updatedHealth: HealthStatus = {
        isHealthy: healthCheck.isHealthy,
        lastChecked: healthCheck.timestamp,
        responseTime: healthCheck.responseTime,
        errorMessage: healthCheck.error,
        consecutiveFailures
      };

      const updateQuery = this.database === db ?
        `UPDATE public.ai_providers 
        SET health_status = $1, updated_at = CURRENT_TIMESTAMP 
        WHERE id = $2` :
        `UPDATE ai_providers 
        SET health_status = ?, updated_at = datetime('now') 
        WHERE id = ?`;

      await this.database.query(updateQuery, [JSON.stringify(updatedHealth), providerId]);
    } catch (error) {
      console.error('Error updating provider health:', error);
    }
  }

  /**
   * Record provider failure
   */
  private async recordProviderFailure(providerId: string): Promise<void> {
    try {
      const selectQuery = this.database === db ?
        'SELECT health_status FROM public.ai_providers WHERE id = $1' :
        'SELECT health_status FROM ai_providers WHERE id = ?';

      const result = await this.database.query(selectQuery, [providerId]);

      const rows = result.rows || result;
      if (rows.length === 0) {
        return;
      }

      const currentHealth = typeof rows[0].health_status === 'string' ? 
        JSON.parse(rows[0].health_status) : rows[0].health_status;
      const consecutiveFailures = (currentHealth.consecutiveFailures || 0) + 1;

      const updatedHealth: HealthStatus = {
        ...currentHealth,
        isHealthy: false,
        lastChecked: new Date(),
        consecutiveFailures
      };

      const updateQuery = this.database === db ?
        `UPDATE public.ai_providers 
        SET health_status = $1, updated_at = CURRENT_TIMESTAMP 
        WHERE id = $2` :
        `UPDATE ai_providers 
        SET health_status = ?, updated_at = datetime('now') 
        WHERE id = ?`;

      await this.database.query(updateQuery, [JSON.stringify(updatedHealth), providerId]);

      // Deactivate provider if too many consecutive failures
      if (consecutiveFailures >= 5) {
        await this.deactivateProvider(providerId);
        console.warn(`Provider ${providerId} deactivated due to consecutive failures`);
      }
    } catch (error) {
      console.error('Error recording provider failure:', error);
    }
  }

  /**
   * Log AI request and response
   */
  private async logAIRequest(request: AIRequest, response: AIResponse): Promise<void> {
    try {
      const query = this.database === db ?
        // PostgreSQL syntax
        `INSERT INTO public.ai_request_logs (
          id, request_id, provider_id, tenant_id, user_id, request_type, 
          prompt, options, response_status, error_message, processing_time, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)` :
        // SQLite syntax
        `INSERT INTO ai_request_logs (
          id, request_id, provider_id, tenant_id, user_id, request_type, 
          prompt, options, response_status, error_message, processing_time, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`;

      await this.database.query(query, [
        uuidv4(),
        request.id,
        response.providerId || null,
        request.tenantId,
        request.userId,
        request.type,
        request.prompt,
        JSON.stringify(request.options),
        response.status,
        response.error || null,
        response.processingTime
      ]);
    } catch (error) {
      console.error('Error logging AI request:', error);
    }
  }

  /**
   * Update usage tracking
   */
  private async updateUsageTracking(tenantId: string, providerId: string, usage: UsageMetrics): Promise<void> {
    try {
      const query = this.database === db ?
        // PostgreSQL syntax
        `INSERT INTO public.ai_usage_logs (
          id, tenant_id, provider_id, credits_consumed, request_count, 
          processing_time, tokens_used, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)` :
        // SQLite syntax
        `INSERT INTO ai_usage_logs (
          id, tenant_id, provider_id, credits_consumed, request_count, 
          processing_time, tokens_used, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`;

      await this.database.query(query, [
        uuidv4(),
        tenantId,
        providerId,
        usage.creditsConsumed,
        usage.requestCount,
        usage.processingTime,
        usage.tokensUsed || 0
      ]);
    } catch (error) {
      console.error('Error updating usage tracking:', error);
    }
  }

  /**
   * Start health monitoring for all providers
   */
  private startHealthMonitoring(): void {
    // Check provider health every 5 minutes
    this.healthCheckInterval = setInterval(async () => {
      try {
        const providers = Array.from(this.providers.keys());
        
        for (const providerId of providers) {
          await this.testConnectivity(providerId);
        }
      } catch (error) {
        console.error('Error in health monitoring:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Get provider type from capabilities
   */
  private getProviderType(capabilities: AICapability[]): 'text' | 'image' | 'video' | 'avatar' | 'research' {
    // Return the first capability type as the primary type
    return capabilities.length > 0 ? 
      capabilities[0].type.replace('_generation', '').replace('_creation', '') as any : 
      'text';
  }

  /**
   * Map database provider to AIProvider interface
   */
  private mapDbProviderToProvider(dbProvider: any): AIProvider {
    return {
      id: dbProvider.id,
      name: dbProvider.name,
      type: dbProvider.type,
      capabilities: dbProvider.capabilities,
      config: dbProvider.config,
      isActive: dbProvider.is_active,
      healthStatus: dbProvider.health_status,
      tenantId: dbProvider.tenant_id,
      createdAt: dbProvider.created_at,
      updatedAt: dbProvider.updated_at
    };
  }
}

export const aiIntegrationHub = new AIIntegrationHub();