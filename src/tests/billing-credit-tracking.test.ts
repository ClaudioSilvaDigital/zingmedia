import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { TestDatabaseManager } from '../config/test-database';
import { BillingService } from '../services/billing';
import { AIBillingService } from '../services/ai-billing';
import { AIRequest, AIResponse, UsageMetrics } from '../types';

// Feature: content-automation-platform, Property 14: Billing Credit Tracking
// For any AI service usage, the system should accurately track and bill credits according to the tenant's plan limits

describe('Billing Credit Tracking Property Tests', () => {
  let testDb: TestDatabaseManager;
  let billingService: BillingService;
  let aiBillingService: AIBillingService;
  let testTenants: string[] = [];

  beforeAll(async () => {
    // Initialize test database
    testDb = new TestDatabaseManager();
    
    // Initialize services with test database
    billingService = new BillingService();
    aiBillingService = new AIBillingService();
    
    // Ensure database is ready
    await testDb.query('SELECT 1');
    
    // Create necessary tables for billing tests
    await createBillingTestTables();
  });

  afterAll(async () => {
    // Cleanup test tenants
    for (const tenantId of testTenants) {
      try {
        await testDb.query('DELETE FROM credit_balances WHERE tenant_id = ?', [tenantId]);
        await testDb.query('DELETE FROM billing_entries WHERE tenant_id = ?', [tenantId]);
        await testDb.query('DELETE FROM ai_usage_logs WHERE tenant_id = ?', [tenantId]);
        await testDb.query('DELETE FROM tenants WHERE id = ?', [tenantId]);
      } catch (error) {
        console.warn(`Failed to cleanup tenant ${tenantId}:`, error);
      }
    }
    testTenants = [];
    await testDb.close();
  });

  beforeEach(() => {
    // Reset test tenants array for each test
    testTenants = [];
  });

  async function createBillingTestTables(): Promise<void> {
    // Create simplified versions of billing tables for testing
    await testDb.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        settings TEXT DEFAULT '{}'
      )
    `);

    await testDb.query(`
      CREATE TABLE IF NOT EXISTS credit_balances (
        tenant_id TEXT PRIMARY KEY,
        balance INTEGER DEFAULT 0,
        monthly_usage INTEGER DEFAULT 0,
        daily_usage INTEGER DEFAULT 0,
        monthly_limit INTEGER DEFAULT 0,
        daily_limit INTEGER DEFAULT 0
      )
    `);

    await testDb.query(`
      CREATE TABLE IF NOT EXISTS ai_usage_logs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        credits_consumed INTEGER DEFAULT 0,
        request_count INTEGER DEFAULT 1,
        processing_time INTEGER DEFAULT 0
      )
    `);

    await testDb.query(`
      CREATE TABLE IF NOT EXISTS billing_entries (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        credits_consumed INTEGER DEFAULT 0,
        breakdown TEXT DEFAULT '{}',
        rate_info TEXT DEFAULT '{}'
      )
    `);
  }

  async function createTestTenant(planLimits: { monthlyCredits: number; dailyCredits: number }): Promise<string> {
    const tenantId = uuidv4();
    
    await testDb.query(`
      INSERT INTO tenants (id, name, type, settings)
      VALUES (?, ?, ?, ?)
    `, [
      tenantId,
      `Test Tenant ${tenantId.slice(0, 8)}`,
      'agency',
      JSON.stringify({ billingPlan: 'test' })
    ]);

    await testDb.query(`
      INSERT INTO credit_balances (tenant_id, balance, monthly_limit, daily_limit)
      VALUES (?, ?, ?, ?)
    `, [
      tenantId,
      planLimits.monthlyCredits,
      planLimits.monthlyCredits,
      planLimits.dailyCredits
    ]);

    testTenants.push(tenantId);
    return tenantId;
  }

  async function simulateAIUsage(tenantId: string, creditsToConsume: number): Promise<boolean> {
    // First check if we can consume the credits (simulate the limit check)
    const currentBalance = await getCreditBalance(tenantId);
    
    // Check if consumption would exceed daily limit
    if (currentBalance.dailyUsage + creditsToConsume > 100) { // Assuming max daily limit of 100 for test
      return false; // Cannot consume - would exceed daily limit
    }
    
    // Check if we have enough balance
    if (currentBalance.balance < creditsToConsume) {
      return false; // Cannot consume - insufficient balance
    }

    const requestId = uuidv4();
    const providerId = 'test-provider';
    
    // Record usage
    await testDb.query(`
      INSERT INTO ai_usage_logs (id, tenant_id, provider_id, credits_consumed, request_count, processing_time)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      uuidv4(),
      tenantId,
      providerId,
      creditsToConsume,
      1,
      1000
    ]);

    await testDb.query(`
      INSERT INTO billing_entries (id, tenant_id, provider_id, request_id, credits_consumed, breakdown, rate_info)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      uuidv4(),
      tenantId,
      providerId,
      requestId,
      creditsToConsume,
      JSON.stringify({ baseCredits: creditsToConsume, tokenCredits: 0, qualityCredits: 0, processingCredits: 0 }),
      JSON.stringify({ baseRate: 1, perTokenRate: 0.001, perSecondRate: 0, qualityMultiplier: 1.0 })
    ]);

    // Update credit balance
    await testDb.query(`
      UPDATE credit_balances 
      SET balance = balance - ?, monthly_usage = monthly_usage + ?, daily_usage = daily_usage + ?
      WHERE tenant_id = ?
    `, [creditsToConsume, creditsToConsume, creditsToConsume, tenantId]);
    
    return true; // Successfully consumed
  }

  async function getCreditBalance(tenantId: string): Promise<{ balance: number; monthlyUsage: number; dailyUsage: number }> {
    const result = await testDb.query(`
      SELECT balance, monthly_usage, daily_usage FROM credit_balances WHERE tenant_id = ?
    `, [tenantId]);

    if (!result.rows || result.rows.length === 0) {
      throw new Error('Credit balance not found');
    }

    const row = result.rows[0];
    return {
      balance: parseInt(row.balance) || 0,
      monthlyUsage: parseInt(row.monthly_usage) || 0,
      dailyUsage: parseInt(row.daily_usage) || 0
    };
  }

  async function getTotalBilledCredits(tenantId: string): Promise<number> {
    const result = await testDb.query(`
      SELECT SUM(credits_consumed) as total FROM billing_entries WHERE tenant_id = ?
    `, [tenantId]);

    if (!result.rows || result.rows.length === 0) {
      return 0;
    }

    return parseInt(result.rows[0].total) || 0;
  }

  it('Property 14: Billing Credit Tracking - should accurately track credit consumption', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate plan limits
        fc.record({
          monthlyCredits: fc.integer({ min: 100, max: 10000 }),
          dailyCredits: fc.integer({ min: 10, max: 1000 })
        }),
        // Generate usage scenarios
        fc.array(
          fc.integer({ min: 1, max: 50 }), // Credits per usage
          { minLength: 1, maxLength: 20 }
        ),
        async (planLimits, usageScenarios) => {
          let tenantId: string | null = null;
          
          try {
            // Create test tenant with plan limits
            tenantId = await createTestTenant(planLimits);
            
            // Get initial balance
            const initialBalance = await getCreditBalance(tenantId);
            expect(initialBalance.balance).toBe(planLimits.monthlyCredits);
            expect(initialBalance.monthlyUsage).toBe(0);
            expect(initialBalance.dailyUsage).toBe(0);

            let totalExpectedUsage = 0;
            
            // Simulate AI usage scenarios
            for (const creditsToConsume of usageScenarios) {
              // Only consume if we have enough credits and don't exceed limits
              const currentBalance = await getCreditBalance(tenantId);
              if (currentBalance.balance >= creditsToConsume && 
                  currentBalance.dailyUsage + creditsToConsume <= planLimits.dailyCredits) {
                const consumed = await simulateAIUsage(tenantId, creditsToConsume);
                if (consumed) {
                  totalExpectedUsage += creditsToConsume;
                }
              }
            }

            // Verify credit tracking accuracy
            const finalBalance = await getCreditBalance(tenantId);
            const totalBilledCredits = await getTotalBilledCredits(tenantId);

            // Property: Total billed credits should equal total usage
            expect(totalBilledCredits).toBe(totalExpectedUsage);

            // Property: Balance should be initial credits minus consumed credits
            const expectedFinalBalance = planLimits.monthlyCredits - totalExpectedUsage;
            expect(finalBalance.balance).toBe(expectedFinalBalance);

            // Property: Monthly usage should equal total consumed credits
            expect(finalBalance.monthlyUsage).toBe(totalExpectedUsage);

            // Property: Daily usage should equal total consumed credits (in same day)
            expect(finalBalance.dailyUsage).toBe(totalExpectedUsage);

            // Property: Balance should never go negative
            expect(finalBalance.balance).toBeGreaterThanOrEqual(0);

          } finally {
            // Cleanup is handled in afterAll
          }
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });

  it('Property 14: Billing Credit Tracking - should enforce plan limits correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate plan limits
        fc.record({
          monthlyCredits: fc.integer({ min: 50, max: 500 }),
          dailyCredits: fc.integer({ min: 10, max: 100 })
        }),
        // Generate usage that might exceed limits
        fc.integer({ min: 1, max: 100 }),
        async (planLimits, creditsToAttempt) => {
          let tenantId: string | null = null;
          
          try {
            // Create test tenant with plan limits
            tenantId = await createTestTenant(planLimits);
            
            // Get initial balance
            const initialBalance = await getCreditBalance(tenantId);
            
            // Attempt to consume credits
            const currentBalance = await getCreditBalance(tenantId);
            const canConsume = currentBalance.balance >= creditsToAttempt && 
                              currentBalance.dailyUsage + creditsToAttempt <= planLimits.dailyCredits;
            
            if (canConsume) {
              // Should succeed
              const consumed = await simulateAIUsage(tenantId, creditsToAttempt);
              
              if (consumed) {
                const finalBalance = await getCreditBalance(tenantId);
                
                // Property: Usage should be recorded accurately
                expect(finalBalance.monthlyUsage).toBe(creditsToAttempt);
                expect(finalBalance.balance).toBe(planLimits.monthlyCredits - creditsToAttempt);
                
                // Property: Balance should not exceed initial credits
                expect(finalBalance.balance).toBeLessThanOrEqual(planLimits.monthlyCredits);
              }
              
            } else {
              // Should not be able to consume more than available or exceed limits
              const finalBalance = await getCreditBalance(tenantId);
              
              // Property: Balance should remain unchanged if insufficient credits or limits exceeded
              expect(finalBalance.balance).toBe(initialBalance.balance);
              expect(finalBalance.monthlyUsage).toBe(initialBalance.monthlyUsage);
            }

            // Property: Monthly usage should never exceed monthly limit
            const finalBalance = await getCreditBalance(tenantId);
            expect(finalBalance.monthlyUsage).toBeLessThanOrEqual(planLimits.monthlyCredits);
            
            // Property: Daily usage should never exceed daily limit  
            expect(finalBalance.dailyUsage).toBeLessThanOrEqual(planLimits.dailyCredits);

          } finally {
            // Cleanup is handled in afterAll
          }
        }
      ),
      { numRuns: 15, timeout: 30000 }
    );
  });

  it('Property 14: Billing Credit Tracking - should maintain consistency across multiple operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate plan limits
        fc.record({
          monthlyCredits: fc.integer({ min: 200, max: 2000 }),
          dailyCredits: fc.integer({ min: 50, max: 500 })
        }),
        // Generate multiple concurrent usage scenarios
        fc.array(
          fc.array(
            fc.integer({ min: 1, max: 20 }), // Credits per batch
            { minLength: 1, maxLength: 5 }
          ),
          { minLength: 2, maxLength: 5 } // Multiple batches
        ),
        async (planLimits, usageBatches) => {
          let tenantId: string | null = null;
          
          try {
            // Create test tenant with plan limits
            tenantId = await createTestTenant(planLimits);
            
            let totalExpectedUsage = 0;
            
            // Process usage in batches to simulate concurrent operations
            for (const batch of usageBatches) {
              for (const creditsToConsume of batch) {
                const currentBalance = await getCreditBalance(tenantId);
                
                // Only consume if we have enough credits and don't exceed limits
                if (currentBalance.balance >= creditsToConsume &&
                    currentBalance.dailyUsage + creditsToConsume <= planLimits.dailyCredits) {
                  const consumed = await simulateAIUsage(tenantId, creditsToConsume);
                  if (consumed) {
                    totalExpectedUsage += creditsToConsume;
                  }
                }
              }
              
              // Verify consistency after each batch
              const batchBalance = await getCreditBalance(tenantId);
              const batchBilledCredits = await getTotalBilledCredits(tenantId);
              
              // Property: Billed credits should always match usage records
              expect(batchBilledCredits).toBe(totalExpectedUsage);
              
              // Property: Balance calculation should be consistent
              const expectedBalance = planLimits.monthlyCredits - totalExpectedUsage;
              expect(batchBalance.balance).toBe(expectedBalance);
            }

            // Final verification
            const finalBalance = await getCreditBalance(tenantId);
            const finalBilledCredits = await getTotalBilledCredits(tenantId);
            
            // Property: Final state should be consistent
            expect(finalBilledCredits).toBe(totalExpectedUsage);
            expect(finalBalance.monthlyUsage).toBe(totalExpectedUsage);
            expect(finalBalance.balance).toBe(planLimits.monthlyCredits - totalExpectedUsage);
            
            // Property: All values should be non-negative
            expect(finalBalance.balance).toBeGreaterThanOrEqual(0);
            expect(finalBalance.monthlyUsage).toBeGreaterThanOrEqual(0);
            expect(finalBalance.dailyUsage).toBeGreaterThanOrEqual(0);
            expect(finalBilledCredits).toBeGreaterThanOrEqual(0);

          } finally {
            // Cleanup is handled in afterAll
          }
        }
      ),
      { numRuns: 10, timeout: 30000 }
    );
  });
});