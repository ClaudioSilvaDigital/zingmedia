import { v4 as uuidv4 } from 'uuid';
import { 
  BillingPlan, 
  Subscription, 
  CreditBalance, 
  Invoice, 
  InvoiceLineItem, 
  TaxDetails, 
  PaymentMethod, 
  BillingHistory, 
  NotaFiscal, 
  FiscalProvider, 
  BillingAlert,
  UsageBreakdown,
  PlanLimits
} from '../types';
import { db } from '../config/database';
import { aiBillingService } from './ai-billing';

/**
 * Comprehensive Billing Service
 * Handles subscriptions, credit tracking, invoicing, and Brazilian tax compliance
 */
export class BillingService {
  private fiscalProviders: Map<string, FiscalProvider> = new Map();

  constructor() {
    this.initializeFiscalProviders();
  }

  /**
   * Create a new subscription for a tenant
   */
  async createSubscription(tenantId: string, planId: string, trialDays?: number): Promise<Subscription> {
    try {
      // Get plan details
      const plan = await this.getBillingPlan(planId);
      if (!plan) {
        throw new Error('Billing plan not found');
      }

      // Calculate subscription dates
      const now = new Date();
      const currentPeriodStart = now;
      const currentPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
      const trialEnd = trialDays ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000) : undefined;

      const subscriptionId = uuidv4();
      
      // Create subscription
      await db.query(`
        INSERT INTO public.subscriptions (
          id, tenant_id, plan_id, status, current_period_start, 
          current_period_end, trial_end, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        subscriptionId,
        tenantId,
        planId,
        trialEnd ? 'trial' : 'active',
        currentPeriodStart,
        currentPeriodEnd,
        trialEnd
      ]);

      // Initialize credit balance based on plan
      await this.initializeCreditBalance(tenantId, plan.limits);

      // Update tenant settings
      await db.query(`
        UPDATE public.tenants 
        SET settings = jsonb_set(settings, '{billingPlan}', $2)
        WHERE id = $1
      `, [tenantId, JSON.stringify(plan.name.toLowerCase())]);

      return {
        id: subscriptionId,
        tenantId,
        planId,
        status: trialEnd ? 'trial' : 'active',
        currentPeriodStart,
        currentPeriodEnd,
        trialEnd,
        createdAt: now,
        updatedAt: now
      };
    } catch (error) {
      console.error('Error creating subscription:', error);
      throw new Error('Failed to create subscription');
    }
  }

  /**
   * Get billing plan by ID
   */
  async getBillingPlan(planId: string): Promise<BillingPlan | null> {
    try {
      const result = await db.query(`
        SELECT * FROM public.billing_plans WHERE id = $1 AND is_active = true
      `, [planId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        type: row.type,
        pricing: JSON.parse(row.pricing),
        limits: JSON.parse(row.limits),
        features: JSON.parse(row.features),
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      console.error('Error getting billing plan:', error);
      return null;
    }
  }

  /**
   * Initialize credit balance for a tenant
   */
  async initializeCreditBalance(tenantId: string, planLimits: PlanLimits): Promise<void> {
    try {
      await db.query(`
        INSERT INTO public.credit_balances (
          tenant_id, balance, monthly_usage, daily_usage, 
          monthly_limit, daily_limit, last_reset_date, 
          created_at, updated_at
        ) VALUES ($1, $2, 0, 0, $3, $4, CURRENT_DATE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (tenant_id) DO UPDATE SET
          monthly_limit = $3,
          daily_limit = $4,
          updated_at = CURRENT_TIMESTAMP
      `, [
        tenantId,
        planLimits.monthlyCredits,
        planLimits.monthlyCredits,
        planLimits.dailyCredits
      ]);
    } catch (error) {
      console.error('Error initializing credit balance:', error);
      throw new Error('Failed to initialize credit balance');
    }
  }

  /**
   * Add credits to tenant balance
   */
  async addCredits(tenantId: string, credits: number, reason: string): Promise<CreditBalance> {
    try {
      await db.query(`
        UPDATE public.credit_balances 
        SET balance = balance + $2, updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = $1
      `, [tenantId, credits]);

      // Log the credit addition
      await db.query(`
        INSERT INTO public.credit_transactions (
          id, tenant_id, amount, type, reason, created_at
        ) VALUES ($1, $2, $3, 'credit', $4, CURRENT_TIMESTAMP)
      `, [uuidv4(), tenantId, credits, reason]);

      return await this.getCreditBalance(tenantId);
    } catch (error) {
      console.error('Error adding credits:', error);
      throw new Error('Failed to add credits');
    }
  }

  /**
   * Get tenant credit balance
   */
  async getCreditBalance(tenantId: string): Promise<CreditBalance> {
    try {
      const result = await db.query(`
        SELECT * FROM public.credit_balances WHERE tenant_id = $1
      `, [tenantId]);

      if (result.rows.length === 0) {
        throw new Error('Credit balance not found');
      }

      const row = result.rows[0];
      return {
        tenantId: row.tenant_id,
        balance: parseInt(row.balance),
        monthlyUsage: parseInt(row.monthly_usage),
        dailyUsage: parseInt(row.daily_usage),
        monthlyLimit: parseInt(row.monthly_limit),
        dailyLimit: parseInt(row.daily_limit),
        lastResetDate: row.last_reset_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      console.error('Error getting credit balance:', error);
      throw new Error('Failed to get credit balance');
    }
  }

  /**
   * Generate invoice for tenant usage
   */
  async generateInvoice(tenantId: string, periodStart: Date, periodEnd: Date): Promise<Invoice> {
    try {
      // Get tenant details
      const tenantResult = await db.query(`
        SELECT * FROM public.tenants WHERE id = $1
      `, [tenantId]);

      if (tenantResult.rows.length === 0) {
        throw new Error('Tenant not found');
      }

      const tenant = tenantResult.rows[0];
      
      // Get usage summary for the period
      const usageSummary = await aiBillingService.getUsageSummary(tenantId, {
        start: periodStart,
        end: periodEnd
      });

      // Get subscription details
      const subscription = await this.getActiveSubscription(tenantId);
      if (!subscription) {
        throw new Error('No active subscription found');
      }

      const plan = await this.getBillingPlan(subscription.planId);
      if (!plan) {
        throw new Error('Billing plan not found');
      }

      // Calculate line items
      const lineItems: InvoiceLineItem[] = [];
      
      // Subscription fee
      if (plan.pricing.monthlyPrice && plan.pricing.monthlyPrice > 0) {
        lineItems.push({
          id: uuidv4(),
          description: `${plan.name} - Monthly Subscription`,
          quantity: 1,
          unitPrice: plan.pricing.monthlyPrice,
          amount: plan.pricing.monthlyPrice,
          taxRate: 0.18, // 18% Brazilian tax rate
        });
      }

      // Credit usage charges
      if (plan.pricing.creditPrice && usageSummary.totalCredits > plan.limits.monthlyCredits) {
        const extraCredits = usageSummary.totalCredits - plan.limits.monthlyCredits;
        const creditAmount = extraCredits * plan.pricing.creditPrice;
        
        lineItems.push({
          id: uuidv4(),
          description: `Additional Credits (${extraCredits} credits)`,
          quantity: extraCredits,
          unitPrice: plan.pricing.creditPrice,
          amount: creditAmount,
          taxRate: 0.18,
        });
      }

      // Calculate totals
      const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
      const taxAmount = lineItems.reduce((sum, item) => sum + (item.amount * item.taxRate), 0);
      const total = subtotal + taxAmount;

      // Generate invoice number
      const invoiceNumber = await this.generateInvoiceNumber(tenantId);

      const invoiceId = uuidv4();
      const now = new Date();
      const dueDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

      // Create invoice
      await db.query(`
        INSERT INTO public.invoices (
          id, tenant_id, subscription_id, invoice_number, status,
          issue_date, due_date, subtotal, tax_amount, total,
          currency, line_items, tax_details, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'sent', $5, $6, $7, $8, $9, 'BRL', $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        invoiceId,
        tenantId,
        subscription.id,
        invoiceNumber,
        now,
        dueDate,
        subtotal,
        taxAmount,
        total,
        JSON.stringify(lineItems),
        JSON.stringify(this.getTaxDetails(tenant))
      ]);

      return {
        id: invoiceId,
        tenantId,
        subscriptionId: subscription.id,
        invoiceNumber,
        status: 'sent',
        issueDate: now,
        dueDate,
        subtotal,
        taxAmount,
        total,
        currency: 'BRL',
        lineItems,
        taxDetails: this.getTaxDetails(tenant),
        createdAt: now,
        updatedAt: now
      };
    } catch (error) {
      console.error('Error generating invoice:', error);
      throw new Error('Failed to generate invoice');
    }
  }

  /**
   * Generate Nota Fiscal for Brazilian tax compliance
   */
  async generateNotaFiscal(invoiceId: string): Promise<NotaFiscal> {
    try {
      // Get invoice details
      const invoice = await this.getInvoice(invoiceId);
      if (!invoice) {
        throw new Error('Invoice not found');
      }

      // Get fiscal provider
      const fiscalProvider = this.fiscalProviders.get('default');
      if (!fiscalProvider) {
        throw new Error('Fiscal provider not configured');
      }

      // Generate Nota Fiscal number and series
      const notaFiscalNumber = await this.generateNotaFiscalNumber();
      const series = '001';
      const accessKey = this.generateAccessKey(notaFiscalNumber, series);

      // Create XML content for Nota Fiscal
      const xmlContent = this.generateNotaFiscalXML(invoice, notaFiscalNumber, series, accessKey);

      const notaFiscalId = uuidv4();
      const now = new Date();

      // Save Nota Fiscal
      await db.query(`
        INSERT INTO public.nota_fiscals (
          id, invoice_id, tenant_id, number, series, access_key,
          status, issue_date, xml_content, fiscal_provider_id,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        notaFiscalId,
        invoiceId,
        invoice.tenantId,
        notaFiscalNumber,
        series,
        accessKey,
        now,
        xmlContent,
        fiscalProvider.id
      ]);

      // Submit to fiscal authority (simulated)
      await this.submitNotaFiscalToAuthority(notaFiscalId, xmlContent);

      return {
        id: notaFiscalId,
        invoiceId,
        tenantId: invoice.tenantId,
        number: notaFiscalNumber,
        series,
        accessKey,
        status: 'authorized',
        issueDate: now,
        xmlContent,
        fiscalProviderId: fiscalProvider.id,
        createdAt: now,
        updatedAt: now
      };
    } catch (error) {
      console.error('Error generating Nota Fiscal:', error);
      throw new Error('Failed to generate Nota Fiscal');
    }
  }

  /**
   * Get billing history for tenant
   */
  async getBillingHistory(tenantId: string, limit: number = 12): Promise<BillingHistory[]> {
    try {
      const result = await db.query(`
        SELECT * FROM public.billing_history 
        WHERE tenant_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2
      `, [tenantId, limit]);

      return result.rows.map((row: any) => ({
        id: row.id,
        tenantId: row.tenant_id,
        period: JSON.parse(row.period),
        totalCreditsUsed: parseInt(row.total_credits_used),
        totalAmount: parseFloat(row.total_amount),
        invoiceId: row.invoice_id,
        status: row.status,
        breakdown: JSON.parse(row.breakdown),
        createdAt: row.created_at
      }));
    } catch (error) {
      console.error('Error getting billing history:', error);
      throw new Error('Failed to get billing history');
    }
  }

  /**
   * Process monthly billing for all tenants
   */
  async processMonthlyBilling(): Promise<void> {
    try {
      // Get all active subscriptions
      const result = await db.query(`
        SELECT DISTINCT tenant_id FROM public.subscriptions 
        WHERE status IN ('active', 'trial')
      `);

      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0);

      for (const row of result.rows) {
        try {
          const tenantId = row.tenant_id;
          
          // Generate invoice for the period
          const invoice = await this.generateInvoice(tenantId, periodStart, periodEnd);
          
          // Generate Nota Fiscal for Brazilian compliance
          await this.generateNotaFiscal(invoice.id);
          
          // Reset monthly usage counters
          await this.resetMonthlyUsage(tenantId);
          
          console.log(`Processed billing for tenant ${tenantId}`);
        } catch (error) {
          console.error(`Error processing billing for tenant ${row.tenant_id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error processing monthly billing:', error);
      throw new Error('Failed to process monthly billing');
    }
  }

  /**
   * Reset daily usage counters (should be run daily)
   */
  async resetDailyUsage(): Promise<void> {
    try {
      await db.query(`
        UPDATE public.credit_balances 
        SET daily_usage = 0, updated_at = CURRENT_TIMESTAMP
        WHERE last_reset_date < CURRENT_DATE
      `);
    } catch (error) {
      console.error('Error resetting daily usage:', error);
      throw new Error('Failed to reset daily usage');
    }
  }

  /**
   * Reset monthly usage counters
   */
  private async resetMonthlyUsage(tenantId: string): Promise<void> {
    try {
      await db.query(`
        UPDATE public.credit_balances 
        SET monthly_usage = 0, updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = $1
      `, [tenantId]);
    } catch (error) {
      console.error('Error resetting monthly usage:', error);
      throw new Error('Failed to reset monthly usage');
    }
  }

  /**
   * Get active subscription for tenant
   */
  private async getActiveSubscription(tenantId: string): Promise<Subscription | null> {
    try {
      const result = await db.query(`
        SELECT * FROM public.subscriptions 
        WHERE tenant_id = $1 AND status IN ('active', 'trial')
        ORDER BY created_at DESC LIMIT 1
      `, [tenantId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        tenantId: row.tenant_id,
        planId: row.plan_id,
        status: row.status,
        currentPeriodStart: row.current_period_start,
        currentPeriodEnd: row.current_period_end,
        trialEnd: row.trial_end,
        cancelledAt: row.cancelled_at,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      console.error('Error getting active subscription:', error);
      return null;
    }
  }

  /**
   * Get invoice by ID
   */
  private async getInvoice(invoiceId: string): Promise<Invoice | null> {
    try {
      const result = await db.query(`
        SELECT * FROM public.invoices WHERE id = $1
      `, [invoiceId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        tenantId: row.tenant_id,
        subscriptionId: row.subscription_id,
        invoiceNumber: row.invoice_number,
        status: row.status,
        issueDate: row.issue_date,
        dueDate: row.due_date,
        paidAt: row.paid_at,
        subtotal: parseFloat(row.subtotal),
        taxAmount: parseFloat(row.tax_amount),
        total: parseFloat(row.total),
        currency: row.currency,
        lineItems: JSON.parse(row.line_items),
        taxDetails: JSON.parse(row.tax_details),
        paymentMethod: row.payment_method,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      console.error('Error getting invoice:', error);
      return null;
    }
  }

  /**
   * Generate invoice number
   */
  private async generateInvoiceNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const result = await db.query(`
      SELECT COUNT(*) as count FROM public.invoices 
      WHERE tenant_id = $1 AND EXTRACT(YEAR FROM created_at) = $2
    `, [tenantId, year]);
    
    const count = parseInt(result.rows[0].count) + 1;
    return `INV-${year}-${count.toString().padStart(6, '0')}`;
  }

  /**
   * Generate Nota Fiscal number
   */
  private async generateNotaFiscalNumber(): Promise<string> {
    const result = await db.query(`
      SELECT COUNT(*) as count FROM public.nota_fiscals 
      WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)
    `);
    
    const count = parseInt(result.rows[0].count) + 1;
    return count.toString().padStart(9, '0');
  }

  /**
   * Generate access key for Nota Fiscal
   */
  private generateAccessKey(number: string, series: string): string {
    // Simplified access key generation (in production, use proper algorithm)
    const timestamp = Date.now().toString();
    return `${timestamp}${series}${number}`.padEnd(44, '0');
  }

  /**
   * Generate XML content for Nota Fiscal
   */
  private generateNotaFiscalXML(invoice: Invoice, number: string, series: string, accessKey: string): string {
    // Simplified XML generation (in production, use proper NFe XML structure)
    return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe>
    <infNFe Id="NFe${accessKey}">
      <ide>
        <cUF>35</cUF>
        <cNF>${number}</cNF>
        <natOp>Prestação de Serviços</natOp>
        <mod>55</mod>
        <serie>${series}</serie>
        <nNF>${number}</nNF>
        <dhEmi>${invoice.issueDate.toISOString()}</dhEmi>
        <tpNF>1</tpNF>
        <idDest>1</idDest>
        <cMunFG>3550308</cMunFG>
        <tpImp>1</tpImp>
        <tpEmis>1</tpEmis>
        <cDV>0</cDV>
        <tpAmb>2</tpAmb>
        <finNFe>1</finNFe>
        <indFinal>1</indFinal>
        <indPres>0</indPres>
      </ide>
      <total>
        <ICMSTot>
          <vBC>0.00</vBC>
          <vICMS>0.00</vICMS>
          <vICMSDeson>0.00</vICMSDeson>
          <vFCP>0.00</vFCP>
          <vBCST>0.00</vBCST>
          <vST>0.00</vST>
          <vFCPST>0.00</vFCPST>
          <vFCPSTRet>0.00</vFCPSTRet>
          <vProd>${invoice.subtotal.toFixed(2)}</vProd>
          <vFrete>0.00</vFrete>
          <vSeg>0.00</vSeg>
          <vDesc>0.00</vDesc>
          <vII>0.00</vII>
          <vIPI>0.00</vIPI>
          <vIPIDevol>0.00</vIPIDevol>
          <vPIS>0.00</vPIS>
          <vCOFINS>0.00</vCOFINS>
          <vOutro>0.00</vOutro>
          <vNF>${invoice.total.toFixed(2)}</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
</nfeProc>`;
  }

  /**
   * Submit Nota Fiscal to fiscal authority (simulated)
   */
  private async submitNotaFiscalToAuthority(notaFiscalId: string, xmlContent: string): Promise<void> {
    // In production, this would integrate with SEFAZ or fiscal provider API
    // For now, we'll just mark it as authorized
    await db.query(`
      UPDATE public.nota_fiscals 
      SET status = 'authorized', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [notaFiscalId]);
  }

  /**
   * Get tax details for tenant
   */
  private getTaxDetails(tenant: any): TaxDetails {
    const brandConfig = JSON.parse(tenant.brand_config || '{}');
    
    return {
      taxId: brandConfig.cnpj || '',
      companyName: brandConfig.companyName || tenant.name,
      taxRate: 0.18, // 18% Brazilian service tax
      taxType: 'ISS'
    };
  }

  /**
   * Initialize fiscal providers
   */
  private initializeFiscalProviders(): void {
    // Default fiscal provider configuration
    this.fiscalProviders.set('default', {
      id: 'default',
      name: 'Default Fiscal Provider',
      type: 'nfse',
      config: {
        apiUrl: 'https://api.fiscalprovider.com',
        apiKey: process.env.FISCAL_PROVIDER_API_KEY || '',
        environment: 'sandbox'
      },
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }
}

export const billingService = new BillingService();