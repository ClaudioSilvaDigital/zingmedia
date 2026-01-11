import { v4 as uuidv4 } from 'uuid';
import { 
  AIRequest, 
  AIResponse, 
  GenerationOptions, 
  UsageMetrics,
  AIProvider,
  HealthCheck
} from '../types';
import { aiIntegrationHub } from './ai-hub';
import { db } from '../config/database';

/**
 * AI Service Router with advanced routing and fallback capabilities
 * Handles intelligent provider selection, load balancing, and failure recovery
 */
export class AIServiceRouter {
  private routingStrategies: Map<string, RoutingStrategy> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private loadBalancer: LoadBalancer;

  constructor() {
    this.loadBalancer = new LoadBalancer();
    this.initializeDefaultStrategies();
  }

  /**
   * Route AI request with intelligent provider selection and fallback
   */
  async routeRequest(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    
    try {
      // Get routing strategy for request type
      const strategy = this.getRoutingStrategy(request.type);
      
      // Get suitable providers with health and performance ranking
      const rankedProviders = await this.getRankedProviders(request.type, request.tenantId);
      
      if (rankedProviders.length === 0) {
        throw new Error(`No suitable providers available for request type: ${request.type}`);
      }

      // Apply circuit breaker filtering
      const availableProviders = rankedProviders.filter(provider => 
        !this.isCircuitBreakerOpen(provider.id)
      );

      if (availableProviders.length === 0) {
        // All providers are circuit broken, try with degraded service
        console.warn('All providers circuit broken, attempting degraded service');
        return await this.handleDegradedService(request);
      }

      // Apply routing strategy to select provider
      const selectedProvider = strategy.selectProvider(availableProviders, request);
      
      // Route request through AI hub
      const response = await aiIntegrationHub.routeRequest(request);
      
      // Update provider performance metrics
      await this.updateProviderMetrics(selectedProvider.id, response, Date.now() - startTime);
      
      // Reset circuit breaker on success
      this.resetCircuitBreaker(selectedProvider.id);
      
      return response;
    } catch (error) {
      console.error('Error in AI service routing:', error);
      
      // Try fallback providers
      return await this.handleFallback(request, error);
    }
  }

  /**
   * Handle fallback when primary routing fails
   */
  private async handleFallback(request: AIRequest, primaryError: Error): Promise<AIResponse> {
    try {
      // Get fallback providers (different from primary selection)
      const fallbackProviders = await this.getFallbackProviders(request.type, request.tenantId);
      
      for (const provider of fallbackProviders) {
        if (this.isCircuitBreakerOpen(provider.id)) {
          continue;
        }

        try {
          // Create fallback request with adjusted options
          const fallbackRequest: AIRequest = {
            ...request,
            id: uuidv4(), // New request ID for fallback
            options: this.adjustOptionsForFallback(request.options, provider)
          };

          const response = await aiIntegrationHub.routeRequest(fallbackRequest);
          
          // Mark as fallback response
          response.metadata = {
            ...response.metadata,
            isFallback: true,
            primaryError: primaryError.message,
            fallbackProvider: provider.id
          };

          return response;
        } catch (fallbackError) {
          console.warn(`Fallback provider ${provider.id} failed:`, fallbackError);
          this.recordCircuitBreakerFailure(provider.id);
          continue;
        }
      }

      // All fallbacks failed, return error response
      throw new Error(`All providers failed. Primary error: ${primaryError.message}`);
    } catch (error) {
      return this.createErrorResponse(request, error);
    }
  }

  /**
   * Handle degraded service when all providers are unavailable
   */
  private async handleDegradedService(request: AIRequest): Promise<AIResponse> {
    // Return a degraded response with cached or default content
    return {
      id: uuidv4(),
      requestId: request.id,
      providerId: 'degraded-service',
      content: {
        type: request.type,
        data: 'Service temporarily unavailable. Please try again later.',
        metadata: {
          isDegraded: true,
          reason: 'All providers unavailable'
        }
      },
      usage: {
        creditsConsumed: 0,
        requestCount: 1,
        processingTime: 0
      },
      status: 'partial',
      error: 'Degraded service mode - all providers unavailable',
      processingTime: 0,
      createdAt: new Date()
    };
  }

  /**
   * Get providers ranked by health, performance, and cost
   */
  private async getRankedProviders(requestType: string, tenantId: string): Promise<AIProvider[]> {
    try {
      const providers = await aiIntegrationHub.getProviders(tenantId);
      
      // Filter by capability
      const suitableProviders = providers.filter(provider => 
        provider.capabilities.some(cap => 
          cap.type === `${requestType}_generation` || cap.type === requestType
        ) && provider.isActive
      );

      // Get performance metrics for ranking
      const rankedProviders = await Promise.all(
        suitableProviders.map(async provider => {
          const metrics = await this.getProviderMetrics(provider.id);
          return {
            ...provider,
            ranking: this.calculateProviderRanking(provider, metrics)
          };
        })
      );

      // Sort by ranking (higher is better)
      return rankedProviders.sort((a, b) => b.ranking - a.ranking);
    } catch (error) {
      console.error('Error ranking providers:', error);
      return [];
    }
  }

  /**
   * Get fallback providers (different selection criteria)
   */
  private async getFallbackProviders(requestType: string, tenantId: string): Promise<AIProvider[]> {
    try {
      const allProviders = await aiIntegrationHub.getProviders(tenantId);
      
      // For fallback, prioritize reliability over performance
      return allProviders
        .filter(provider => 
          provider.capabilities.some(cap => 
            cap.type === `${requestType}_generation` || cap.type === requestType
          ) && provider.isActive
        )
        .sort((a, b) => {
          // Sort by health status and consecutive failures
          const aFailures = a.healthStatus.consecutiveFailures || 0;
          const bFailures = b.healthStatus.consecutiveFailures || 0;
          
          if (a.healthStatus.isHealthy !== b.healthStatus.isHealthy) {
            return a.healthStatus.isHealthy ? -1 : 1;
          }
          
          return aFailures - bFailures;
        });
    } catch (error) {
      console.error('Error getting fallback providers:', error);
      return [];
    }
  }

  /**
   * Calculate provider ranking based on multiple factors
   */
  private calculateProviderRanking(provider: AIProvider, metrics: ProviderMetrics): number {
    let ranking = 0;

    // Health score (40% weight)
    if (provider.healthStatus.isHealthy) {
      ranking += 40;
      ranking -= (provider.healthStatus.consecutiveFailures || 0) * 5;
    }

    // Performance score (30% weight)
    if (provider.healthStatus.responseTime) {
      const responseTimeScore = Math.max(0, 30 - (provider.healthStatus.responseTime / 100));
      ranking += responseTimeScore;
    }

    // Reliability score (20% weight)
    const successRate = metrics.successRate || 0;
    ranking += successRate * 20;

    // Cost efficiency score (10% weight)
    const costScore = Math.max(0, 10 - (metrics.averageCost || 0));
    ranking += costScore;

    return Math.max(0, ranking);
  }

  /**
   * Get provider performance metrics
   */
  private async getProviderMetrics(providerId: string): Promise<ProviderMetrics> {
    try {
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_requests,
          SUM(CASE WHEN response_status = 'success' THEN 1 ELSE 0 END) as successful_requests,
          AVG(processing_time) as avg_processing_time,
          AVG(CASE WHEN response_status = 'success' THEN processing_time ELSE NULL END) as avg_success_time
        FROM public.ai_request_logs 
        WHERE provider_id = $1 
        AND created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
      `, [providerId]);

      const row = result.rows[0];
      const totalRequests = parseInt(row.total_requests) || 0;
      const successfulRequests = parseInt(row.successful_requests) || 0;

      return {
        successRate: totalRequests > 0 ? successfulRequests / totalRequests : 0,
        averageResponseTime: parseFloat(row.avg_processing_time) || 0,
        averageSuccessTime: parseFloat(row.avg_success_time) || 0,
        totalRequests,
        successfulRequests,
        averageCost: 5 // Mock cost metric
      };
    } catch (error) {
      console.error('Error getting provider metrics:', error);
      return {
        successRate: 0,
        averageResponseTime: 0,
        averageSuccessTime: 0,
        totalRequests: 0,
        successfulRequests: 0,
        averageCost: 0
      };
    }
  }

  /**
   * Update provider performance metrics
   */
  private async updateProviderMetrics(providerId: string, response: AIResponse, processingTime: number): Promise<void> {
    try {
      // Update provider-specific metrics
      await db.query(`
        INSERT INTO public.ai_provider_metrics (
          id, provider_id, response_time, success, credits_consumed, created_at
        ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      `, [
        uuidv4(),
        providerId,
        processingTime,
        response.status === 'success',
        response.usage.creditsConsumed
      ]);

      // Update load balancer metrics
      this.loadBalancer.updateMetrics(providerId, processingTime, response.status === 'success');
    } catch (error) {
      console.error('Error updating provider metrics:', error);
    }
  }

  /**
   * Adjust request options for fallback providers
   */
  private adjustOptionsForFallback(options: GenerationOptions, provider: AIProvider): GenerationOptions {
    const adjustedOptions = { ...options };

    // Reduce complexity for fallback
    if (adjustedOptions.maxTokens && adjustedOptions.maxTokens > 1000) {
      adjustedOptions.maxTokens = Math.floor(adjustedOptions.maxTokens * 0.8);
    }

    // Use more conservative temperature
    if (adjustedOptions.temperature && adjustedOptions.temperature > 0.7) {
      adjustedOptions.temperature = 0.7;
    }

    // Select appropriate model for provider
    const availableModels = provider.capabilities
      .flatMap(cap => cap.models)
      .filter(model => model);

    if (availableModels.length > 0 && !availableModels.includes(adjustedOptions.model || '')) {
      adjustedOptions.model = availableModels[0];
    }

    return adjustedOptions;
  }

  /**
   * Circuit breaker management
   */
  private isCircuitBreakerOpen(providerId: string): boolean {
    const breaker = this.circuitBreakers.get(providerId);
    return breaker ? breaker.isOpen() : false;
  }

  private resetCircuitBreaker(providerId: string): void {
    const breaker = this.circuitBreakers.get(providerId);
    if (breaker) {
      breaker.reset();
    }
  }

  private recordCircuitBreakerFailure(providerId: string): void {
    let breaker = this.circuitBreakers.get(providerId);
    if (!breaker) {
      breaker = new CircuitBreaker(providerId);
      this.circuitBreakers.set(providerId, breaker);
    }
    breaker.recordFailure();
  }

  /**
   * Get routing strategy for request type
   */
  private getRoutingStrategy(requestType: string): RoutingStrategy {
    return this.routingStrategies.get(requestType) || this.routingStrategies.get('default')!;
  }

  /**
   * Initialize default routing strategies
   */
  private initializeDefaultStrategies(): void {
    this.routingStrategies.set('default', new RoundRobinStrategy());
    this.routingStrategies.set('text', new PerformanceBasedStrategy());
    this.routingStrategies.set('image', new CostOptimizedStrategy());
    this.routingStrategies.set('video', new ReliabilityFirstStrategy());
  }

  /**
   * Create error response
   */
  private createErrorResponse(request: AIRequest, error: Error): AIResponse {
    return {
      id: uuidv4(),
      requestId: request.id,
      providerId: '',
      content: {
        type: request.type,
        data: '',
        metadata: { error: error.message }
      },
      usage: {
        creditsConsumed: 0,
        requestCount: 1,
        processingTime: 0
      },
      status: 'error',
      error: error.message,
      processingTime: 0,
      createdAt: new Date()
    };
  }
}

/**
 * Circuit Breaker implementation for provider failure handling
 */
class CircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: Date | null = null;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private providerId: string,
    private failureThreshold: number = 5,
    private timeoutMs: number = 60000 // 1 minute
  ) {}

  isOpen(): boolean {
    if (this.state === 'open') {
      // Check if timeout has passed
      if (this.lastFailureTime && 
          Date.now() - this.lastFailureTime.getTime() > this.timeoutMs) {
        this.state = 'half-open';
        return false;
      }
      return true;
    }
    return false;
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = new Date();

    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
      console.warn(`Circuit breaker opened for provider: ${this.providerId}`);
    }
  }

  reset(): void {
    this.failures = 0;
    this.lastFailureTime = null;
    this.state = 'closed';
  }
}

/**
 * Load Balancer for distributing requests across providers
 */
class LoadBalancer {
  private providerMetrics: Map<string, LoadBalancerMetrics> = new Map();

  updateMetrics(providerId: string, responseTime: number, success: boolean): void {
    let metrics = this.providerMetrics.get(providerId);
    if (!metrics) {
      metrics = {
        requestCount: 0,
        totalResponseTime: 0,
        successCount: 0,
        lastUpdated: new Date()
      };
      this.providerMetrics.set(providerId, metrics);
    }

    metrics.requestCount++;
    metrics.totalResponseTime += responseTime;
    if (success) {
      metrics.successCount++;
    }
    metrics.lastUpdated = new Date();
  }

  getProviderLoad(providerId: string): number {
    const metrics = this.providerMetrics.get(providerId);
    if (!metrics || metrics.requestCount === 0) {
      return 0;
    }

    // Calculate load based on recent activity
    const recentActivity = this.getRecentActivity(metrics);
    const averageResponseTime = metrics.totalResponseTime / metrics.requestCount;
    const successRate = metrics.successCount / metrics.requestCount;

    // Higher load = worse performance
    return recentActivity * averageResponseTime * (1 - successRate);
  }

  private getRecentActivity(metrics: LoadBalancerMetrics): number {
    const timeSinceUpdate = Date.now() - metrics.lastUpdated.getTime();
    const minutesSinceUpdate = timeSinceUpdate / (1000 * 60);
    
    // Decay factor for recent activity
    return Math.max(0, 1 - (minutesSinceUpdate / 10));
  }
}

/**
 * Routing Strategies
 */
abstract class RoutingStrategy {
  abstract selectProvider(providers: AIProvider[], request: AIRequest): AIProvider;
}

class RoundRobinStrategy extends RoutingStrategy {
  private currentIndex: number = 0;

  selectProvider(providers: AIProvider[]): AIProvider {
    const provider = providers[this.currentIndex % providers.length];
    this.currentIndex++;
    return provider;
  }
}

class PerformanceBasedStrategy extends RoutingStrategy {
  selectProvider(providers: AIProvider[]): AIProvider {
    // Select provider with best response time
    return providers.reduce((best, current) => {
      const bestTime = best.healthStatus.responseTime || Infinity;
      const currentTime = current.healthStatus.responseTime || Infinity;
      return currentTime < bestTime ? current : best;
    });
  }
}

class CostOptimizedStrategy extends RoutingStrategy {
  selectProvider(providers: AIProvider[]): AIProvider {
    // For now, select first available (would implement cost comparison)
    return providers[0];
  }
}

class ReliabilityFirstStrategy extends RoutingStrategy {
  selectProvider(providers: AIProvider[]): AIProvider {
    // Select provider with fewest consecutive failures
    return providers.reduce((best, current) => {
      const bestFailures = best.healthStatus.consecutiveFailures || 0;
      const currentFailures = current.healthStatus.consecutiveFailures || 0;
      return currentFailures < bestFailures ? current : best;
    });
  }
}

/**
 * Interfaces for metrics and configuration
 */
interface ProviderMetrics {
  successRate: number;
  averageResponseTime: number;
  averageSuccessTime: number;
  totalRequests: number;
  successfulRequests: number;
  averageCost: number;
}

interface LoadBalancerMetrics {
  requestCount: number;
  totalResponseTime: number;
  successCount: number;
  lastUpdated: Date;
}

export const aiServiceRouter = new AIServiceRouter();