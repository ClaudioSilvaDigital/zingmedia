import { v4 as uuidv4 } from 'uuid';
import { UsageMetrics, AIResponse, AIRequest } from '../types';
import { db } from '../config/database';

/**
 * AI Billing Integration Service
 * Handles usage tracking, credit consumption, and billing integration
 */
export class AIBillingService {
  private creditRates: Map<string, CreditRate> = new Map();
  private planLimits: Map<string, PlanLimits> = new Map();

  constructor() {
    this.initializeDefaultRates();
    this.initializePlanLimits();
  }

  /**
   * Track AI usage and consume credits
   */
  async trackUsage(request: AIRequest, response: AIResponse): Promise<UsageTrackingResult> {
    try {
      // Calculate credit consumption
      const creditConsumption = await this.calculateCreditConsumption(request, response);
      
      // Check tenant credit limits
      const limitCheck = await this.checkCreditLimits(request.tenantId, creditConsumption.credits);
      
      if (!limitCheck.allowed) {
        throw new Error(`Credit limit exceeded. Available: ${limitCheck.availableCredits}, Required: ${creditConsumption.credits}`);
      }

      // Record usage in database
      await this.recordUsage(request.tenantId, response.providerId, creditConsumption);
      
      // Update tenant credit balance
      await this.updateCreditBalance(request.tenantId, creditConsumption.credits);

      return {
        success: true,
        creditsConsumed: creditConsumption.credits,
        remainingCredits: limitCheck.availableCredits - creditConsumption.credits,
        billingDetails: creditConsumption
      };
    } catch (error) {
      console.error('Error tracking AI usage:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        creditsConsumed: 0,
        remainingCredits: 0
      };
    }
  }

  /**
   * Calculate credit consumption based on request and response
   */
  private async calculateCreditConsumption(request: AIRequest, response: AIResponse): Promise<CreditConsumption> {
    const providerId = response.providerId;
    const requestType = request.type;
    
    // Get provider-specific rates
    const rateKey = `${providerId}_${requestType}`;
    let rate = this.creditRates.get(rateKey) || this.creditRates.get(requestType) || this.creditRates.get('default')!;

    let credits = 0;
    let breakdown: CreditBreakdown = {
      baseCredits: 0,
      tokenCredits: 0,
      qualityCredits: 0,
      processingCredits: 0
    };

    switch (requestType) {
      case 'text':
        credits = this.calculateTextCredits(request, response, rate);
        breakdown = this.getTextCreditBreakdown(request, response, rate);
        break;
      case 'image':
        credits = this.calculateImageCredits(request, response, rate);
        breakdown = this.getImageCreditBreakdown(request, response, rate);
        break;
      case 'video':
        credits = this.calculateVideoCredits(request, response, rate);
        breakdown = this.getVideoCreditBreakdown(request, response, rate);
        break;
      default:
        credits = rate.baseRate;
        breakdown.baseCredits = rate.baseRate;
    }

    return {
      credits,
      breakdown,
      rate,
      metadata: {
        requestId: request.id,
        providerId,
        requestType,
        processingTime: response.processingTime,
        timestamp: new Date()
      }
    };
  }

  /**
   * Calculate credits for text generation
   */
  private calculateTextCredits(request: AIRequest, response: AIResponse, rate: CreditRate): number {
    const tokensUsed = response.usage.tokensUsed || 0;
    const baseCredits = rate.baseRate;
    const tokenCredits = Math.ceil(tokensUsed / 1000) * (rate.perTokenRate || 1);
    
    // Quality multiplier based on model
    const qualityMultiplier = this.getQualityMultiplier(request.options.model);
    
    return Math.ceil((baseCredits + tokenCredits) * qualityMultiplier);
  }

  /**
   * Calculate credits for image generation
   */
  private calculateImageCredits(request: AIRequest, response: AIResponse, rate: CreditRate): number {
    const baseCredits = rate.baseRate;
    const dimensions = request.options.dimensions;
    const quality = request.options.quality || 'standard';
    
    // Size multiplier
    let sizeMultiplier = 1;
    if (dimensions) {
      const pixels = dimensions.width * dimensions.height;
      sizeMultiplier = Math.max(1, pixels / (1024 * 1024)); // Base on 1MP
    }
    
    // Quality multiplier
    const qualityMultiplier = quality === 'high' ? 2 : 1;
    
    return Math.ceil(baseCredits * sizeMultiplier * qualityMultiplier);
  }

  /**
   * Calculate credits for video generation
   */
  private calculateVideoCredits(request: AIRequest, response: AIResponse, rate: CreditRate): number {
    const baseCredits = rate.baseRate;
    const duration = request.options.metadata?.duration || 30; // Default 30 seconds
    const quality = request.options.quality || 'standard';
    
    // Duration multiplier (per second)
    const durationMultiplier = duration / 10; // Base on 10 seconds
    
    // Quality multiplier
    const qualityMultiplier = quality === 'high' ? 3 : 1;
    
    return Math.ceil(baseCredits * durationMultiplier * qualityMultiplier);
  }

  /**
   * Get detailed credit breakdown for text generation
   */
  private getTextCreditBreakdown(request: AIRequest, response: AIResponse, rate: CreditRate): CreditBreakdown {
    const tokensUsed = response.usage.tokensUsed || 0;
    const baseCredits = rate.baseRate;
    const tokenCredits = Math.ceil(tokensUsed / 1000) * (rate.perTokenRate || 1);
    const qualityMultiplier = this.getQualityMultiplier(request.options.model);
    const qualityCredits = Math.ceil((baseCredits + tokenCredits) * (qualityMultiplier - 1));

    return {
      baseCredits,
      tokenCredits,
      qualityCredits,
      processingCredits: 0
    };
  }

  /**
   * Get detailed credit breakdown for image generation
   */
  private getImageCreditBreakdown(request: AIRequest, response: AIResponse, rate: CreditRate): CreditBreakdown {
    const baseCredits = rate.baseRate;
    const dimensions = request.options.dimensions;
    const quality = request.options.quality || 'standard';
    
    let sizeCredits = 0;
    if (dimensions) {
      const pixels = dimensions.width * dimensions.height;
      const sizeMultiplier = Math.max(1, pixels / (1024 * 1024));
      sizeCredits = Math.ceil(baseCredits * (sizeMultiplier - 1));
    }
    
    const qualityCredits = quality === 'high' ? baseCredits : 0;

    return {
      baseCredits,
      tokenCredits: sizeCredits,
      qualityCredits,
      processingCredits: 0
    };
  }

  /**
   * Get detailed credit breakdown for video generation
   */
  private getVideoCreditBreakdown(request: AIRequest, response: AIResponse, rate: CreditRate): CreditBreakdown {
    const baseCredits = rate.baseRate;
    const duration = request.options.metadata?.duration || 30;
    const quality = request.options.quality || 'standard';
    
    const durationCredits = Math.ceil(baseCredits * (duration / 10 - 1));
    const qualityCredits = quality === 'high' ? baseCredits * 2 : 0;

    return {
      baseCredits,
      tokenCredits: 0,
      qualityCredits,
      processingCredits: durationCredits
    };
  }

  /**
   * Check if tenant has sufficient credits
   */
  private async checkCreditLimits(tenantId: string, requiredCredits: number): Promise<CreditLimitCheck> {
    try {
      // Get tenant's current credit balance and plan
      const result = await db.query(`
        SELECT 
          t.settings,
          COALESCE(cb.balance, 0) as current_balance,
          COALESCE(cb.monthly_usage, 0) as monthly_usage,
          COALESCE(cb.daily_usage, 0) as daily_usage,
          COALESCE(cb.monthly_limit, 0) as monthly_limit,
          COALESCE(cb.daily_limit, 0) as daily_limit
        FROM public.tenants t
        LEFT JOIN public.credit_balances cb ON t.id = cb.tenant_id
        WHERE t.id = $1
      `, [tenantId]);

      if (result.rows.length === 0) {
        throw new Error('Tenant not found');
      }

      const row = result.rows[0];
      const settings = row.settings;
      const currentBalance = parseInt(row.current_balance) || 0;
      const monthlyUsage = parseInt(row.monthly_usage) || 0;
      const dailyUsage = parseInt(row.daily_usage) || 0;
      const monthlyLimit = parseInt(row.monthly_limit) || 0;
      const dailyLimit = parseInt(row.daily_limit) || 0;

      // Get plan limits
      const billingPlan = settings.billingPlan || 'basic';
      const planLimits = this.planLimits.get(billingPlan) || this.planLimits.get('basic')!;

      // Check various limits
      const checks = {
        balance: currentBalance >= requiredCredits,
        monthly: monthlyLimit === 0 || (monthlyUsage + requiredCredits) <= planLimits.monthlyCredits,
        daily: dailyLimit === 0 || (dailyUsage + requiredCredits) <= planLimits.dailyCredits
      };

      const allowed = checks.balance && checks.monthly && checks.daily;

      return {
        allowed,
        availableCredits: currentBalance,
        monthlyUsed: monthlyUsage,
        dailyUsed: dailyUsage,
        planLimits,
        checks
      };
    } catch (error) {
      console.error('Error checking credit limits:', error);
      return {
        allowed: false,
        availableCredits: 0,
        monthlyUsed: 0,
        dailyUsed: 0,
        planLimits: this.planLimits.get('basic')!,
        checks: { balance: false, monthly: false, daily: false }
      };
    }
  }

  /**
   * Record usage in database
   */
  private async recordUsage(tenantId: string, providerId: string, consumption: CreditConsumption): Promise<void> {
    try {
      await db.query(`
        INSERT INTO public.ai_usage_logs (
          id, tenant_id, provider_id, credits_consumed, request_count, 
          processing_time, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      `, [
        uuidv4(),
        tenantId,
        providerId,
        consumption.credits,
        1,
        consumption.metadata.processingTime
      ]);

      // Record detailed billing entry
      await db.query(`
        INSERT INTO public.billing_entries (
          id, tenant_id, provider_id, request_id, credits_consumed,
          breakdown, rate_info, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      `, [
        uuidv4(),
        tenantId,
        providerId,
        consumption.metadata.requestId,
        consumption.credits,
        JSON.stringify(consumption.breakdown),
        JSON.stringify(consumption.rate)
      ]);
    } catch (error) {
      console.error('Error recording usage:', error);
      throw new Error('Failed to record usage');
    }
  }

  /**
   * Update tenant credit balance
   */
  private async updateCreditBalance(tenantId: string, creditsConsumed: number): Promise<void> {
    try {
      await db.query(`
        INSERT INTO public.credit_balances (tenant_id, balance, monthly_usage, daily_usage, updated_at)
        VALUES ($1, -$2, $2, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (tenant_id) DO UPDATE SET
          balance = credit_balances.balance - $2,
          monthly_usage = credit_balances.monthly_usage + $2,
          daily_usage = credit_balances.daily_usage + $2,
          updated_at = CURRENT_TIMESTAMP
      `, [tenantId, creditsConsumed]);
    } catch (error) {
      console.error('Error updating credit balance:', error);
      throw new Error('Failed to update credit balance');
    }
  }

  /**
   * Get quality multiplier based on model
   */
  private getQualityMultiplier(model?: string): number {
    if (!model) return 1;

    const modelMultipliers: Record<string, number> = {
      'gpt-4': 2.0,
      'gpt-4-turbo': 1.5,
      'gpt-3.5-turbo': 1.0,
      'dall-e-3': 2.0,
      'dall-e-2': 1.0
    };

    return modelMultipliers[model] || 1.0;
  }

  /**
   * Initialize default credit rates
   */
  private initializeDefaultRates(): void {
    this.creditRates.set('default', {
      baseRate: 1,
      perTokenRate: 0.001,
      perSecondRate: 0.1,
      qualityMultiplier: 1.0
    });

    this.creditRates.set('text', {
      baseRate: 1,
      perTokenRate: 0.001,
      perSecondRate: 0,
      qualityMultiplier: 1.0
    });

    this.creditRates.set('image', {
      baseRate: 5,
      perTokenRate: 0,
      perSecondRate: 0,
      qualityMultiplier: 1.5
    });

    this.creditRates.set('video', {
      baseRate: 20,
      perTokenRate: 0,
      perSecondRate: 2,
      qualityMultiplier: 2.0
    });
  }

  /**
   * Initialize plan limits
   */
  private initializePlanLimits(): void {
    this.planLimits.set('basic', {
      monthlyCredits: 1000,
      dailyCredits: 50,
      maxRequestsPerMinute: 10,
      maxConcurrentRequests: 2
    });

    this.planLimits.set('premium', {
      monthlyCredits: 10000,
      dailyCredits: 500,
      maxRequestsPerMinute: 60,
      maxConcurrentRequests: 10
    });

    this.planLimits.set('enterprise', {
      monthlyCredits: 100000,
      dailyCredits: 5000,
      maxRequestsPerMinute: 300,
      maxConcurrentRequests: 50
    });
  }

  /**
   * Get tenant usage summary
   */
  async getUsageSummary(tenantId: string, timeRange?: { start: Date; end: Date }): Promise<UsageSummary> {
    try {
      const startDate = timeRange?.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const endDate = timeRange?.end || new Date();

      const result = await db.query(`
        SELECT 
          SUM(credits_consumed) as total_credits,
          COUNT(*) as total_requests,
          AVG(processing_time) as avg_processing_time,
          provider_id,
          COUNT(*) as provider_requests
        FROM public.ai_usage_logs 
        WHERE tenant_id = $1 
        AND created_at BETWEEN $2 AND $3
        GROUP BY provider_id
        ORDER BY total_credits DESC
      `, [tenantId, startDate, endDate]);

      const providerBreakdown = result.rows.map(row => ({
        providerId: row.provider_id,
        credits: parseInt(row.total_credits) || 0,
        requests: parseInt(row.provider_requests) || 0
      }));

      const totalCredits = providerBreakdown.reduce((sum, p) => sum + p.credits, 0);
      const totalRequests = providerBreakdown.reduce((sum, p) => sum + p.requests, 0);

      return {
        tenantId,
        timeRange: { start: startDate, end: endDate },
        totalCredits,
        totalRequests,
        averageCreditsPerRequest: totalRequests > 0 ? totalCredits / totalRequests : 0,
        providerBreakdown
      };
    } catch (error) {
      console.error('Error getting usage summary:', error);
      throw new Error('Failed to get usage summary');
    }
  }
}

/**
 * Interfaces for billing and usage tracking
 */
interface CreditRate {
  baseRate: number;
  perTokenRate: number;
  perSecondRate: number;
  qualityMultiplier: number;
}

interface PlanLimits {
  monthlyCredits: number;
  dailyCredits: number;
  maxRequestsPerMinute: number;
  maxConcurrentRequests: number;
}

interface CreditConsumption {
  credits: number;
  breakdown: CreditBreakdown;
  rate: CreditRate;
  metadata: {
    requestId: string;
    providerId: string;
    requestType: string;
    processingTime: number;
    timestamp: Date;
  };
}

interface CreditBreakdown {
  baseCredits: number;
  tokenCredits: number;
  qualityCredits: number;
  processingCredits: number;
}

interface CreditLimitCheck {
  allowed: boolean;
  availableCredits: number;
  monthlyUsed: number;
  dailyUsed: number;
  planLimits: PlanLimits;
  checks: {
    balance: boolean;
    monthly: boolean;
    daily: boolean;
  };
}

interface UsageTrackingResult {
  success: boolean;
  creditsConsumed: number;
  remainingCredits: number;
  error?: string;
  billingDetails?: CreditConsumption;
}

interface UsageSummary {
  tenantId: string;
  timeRange: { start: Date; end: Date };
  totalCredits: number;
  totalRequests: number;
  averageCreditsPerRequest: number;
  providerBreakdown: {
    providerId: string;
    credits: number;
    requests: number;
  }[];
}

export const aiBillingService = new AIBillingService();