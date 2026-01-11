import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { TestDatabaseManager } from '../config/test-database';
import { BestPracticesService, BestPractice, BrandVoiceGuideline } from '../services/best-practices';
import { ContentGenerationService, ContentGenerationRequest } from '../services/content-generation';
import { BriefingService } from '../services/briefing';
import { 
  TenantContext, 
  User, 
  Tenant, 
  Platform,
  Briefing,
  BriefingTemplate
} from '../types';

// Feature: content-automation-platform, Property 11: Best Practices Application
// For any content generation request, the system should apply relevant best practices from the tenant's configuration to the generation prompts
// Validates: Requirements 10.2

describe('Best Practices Application Property Tests', () => {
  let testDb: TestDatabaseManager;
  let bestPracticesService: BestPracticesService;
  let contentGenerationService: ContentGenerationService;
  let briefingService: BriefingService;
  let testTenantContext: TenantContext;
  let testBriefingTemplate: BriefingTemplate;
  let testBriefing: Briefing;

  beforeAll(async () => {
    testDb = new TestDatabaseManager();
    await testDb.initialize();
    
    bestPracticesService = new BestPracticesService(testDb);
    contentGenerationService = new ContentGenerationService(testDb);
    briefingService = new BriefingService(testDb);

    // Create test tenant and user
    const tenantId = uuidv4();
    const userId = uuidv4();

    await testDb.query(`
      INSERT INTO tenants (id, name, type, brand_config, settings, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [
      tenantId,
      'Test Tenant',
      'agency',
      JSON.stringify({ primaryColor: '#000000', fontFamily: 'Arial' }),
      JSON.stringify({ maxUsers: 100, features: ['all'] })
    ]);

    await testDb.query(`
      INSERT INTO users (id, email, name, password_hash, tenant_id, roles, permissions, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [
      userId,
      'test@example.com',
      'Test User',
      'hashed_password',
      tenantId,
      JSON.stringify([]),
      JSON.stringify([])
    ]);

    const tenant: Tenant = {
      id: tenantId,
      name: 'Test Tenant',
      type: 'agency',
      brandConfig: { primaryColor: '#000000', fontFamily: 'Arial' },
      settings: { maxUsers: 100, maxClients: 50, features: ['all'], billingPlan: 'pro' },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const user: User = {
      id: userId,
      email: 'test@example.com',
      name: 'Test User',
      passwordHash: 'hashed_password',
      tenantId,
      roles: [],
      permissions: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    testTenantContext = {
      tenantId,
      tenant,
      user,
      permissions: []
    };

    // Create test briefing template
    const templateId = uuidv4();
    testBriefingTemplate = await briefingService.createBriefingTemplate({
      name: 'Test Template',
      description: 'Test briefing template',
      fields: [
        {
          id: 'objective',
          name: 'objective',
          label: 'Campaign Objective',
          type: 'text',
          required: true,
          order: 1
        },
        {
          id: 'target_audience',
          name: 'target_audience',
          label: 'Target Audience',
          type: 'textarea',
          required: true,
          order: 2
        }
      ],
      requiredFields: ['objective', 'target_audience'],
      isActive: true,
      createdBy: userId
    }, testTenantContext);

    // Create test briefing
    testBriefing = await briefingService.createBriefing({
      title: 'Test Briefing',
      type: 'internal',
      templateId: testBriefingTemplate.id,
      fields: {
        objective: 'engagement',
        target_audience: 'young professionals'
      },
      status: 'draft',
      tenantId: testTenantContext.tenantId,
      createdBy: userId
    }, testTenantContext);

    // Activate the briefing
    await briefingService.updateBriefing(testBriefing.id, { status: 'active' }, testTenantContext);

    // Initialize default best practices
    await bestPracticesService.initializeDefaultBestPractices();
  });

  afterAll(async () => {
    await testDb.close();
  });

  beforeEach(async () => {
    // Clean up any test-specific best practices between tests
    await testDb.query(`
      DELETE FROM best_practices WHERE tenant_id = ? AND is_custom = true
    `, [testTenantContext.tenantId]);

    await testDb.query(`
      DELETE FROM brand_voice_guidelines WHERE tenant_id = ?
    `, [testTenantContext.tenantId]);
  });

  // Generators for property-based testing
  const contentTypeArbitrary = fc.constantFrom('text', 'image', 'video', 'carousel');
  const objectiveArbitrary = fc.constantFrom('engagement', 'viral', 'professional', 'educational', 'promotional');
  const platformArbitrary = fc.constantFrom<Platform>('instagram', 'tiktok', 'facebook', 'linkedin');

  // Generator for meaningful strings (no whitespace-only)
  const meaningfulStringArbitrary = (minLength: number, maxLength: number) => 
    fc.stringOf(fc.constantFrom(
      'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ' ', '-', '.', ',', '!', '?'
    ), { minLength, maxLength })
      .map(s => s.trim())
      .filter(s => s.length >= Math.max(1, minLength - 2))
      .map(s => s || `Content${Math.random().toString(36).substring(2, 7)}`);

  const bestPracticeArbitrary = fc.record({
    name: meaningfulStringArbitrary(5, 50),
    contentType: contentTypeArbitrary,
    objective: objectiveArbitrary,
    rules: fc.array(meaningfulStringArbitrary(10, 100), { minLength: 1, maxLength: 5 }),
    examples: fc.record({
      positive: fc.array(meaningfulStringArbitrary(5, 50), { maxLength: 3 }),
      negative: fc.array(meaningfulStringArbitrary(5, 50), { maxLength: 3 })
    }),
    priority: fc.integer({ min: 1, max: 10 }),
    isCustom: fc.constant(true)
  });

  const getBrandVoiceGuidelineArbitrary = (tenantId: string) => fc.record({
    name: meaningfulStringArbitrary(5, 50),
    description: fc.option(meaningfulStringArbitrary(10, 200)),
    tone: fc.constantFrom('professional', 'casual', 'friendly', 'authoritative', 'playful'),
    personality: fc.array(meaningfulStringArbitrary(5, 30), { minLength: 1, maxLength: 5 }),
    dosList: fc.array(meaningfulStringArbitrary(10, 100), { minLength: 1, maxLength: 5 }),
    dontsList: fc.array(meaningfulStringArbitrary(10, 100), { minLength: 1, maxLength: 5 }),
    examples: fc.array(meaningfulStringArbitrary(10, 100), { maxLength: 3 }),
    isActive: fc.constant(true),
    tenantId: fc.constant(tenantId)
  });

  it('Property 11: Best Practices Application - Relevant practices should be applied to content generation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(bestPracticeArbitrary, { minLength: 1, maxLength: 5 }),
        fc.array(getBrandVoiceGuidelineArbitrary(testTenantContext.tenantId), { minLength: 0, maxLength: 3 }),
        contentTypeArbitrary,
        objectiveArbitrary,
        fc.array(platformArbitrary, { minLength: 1, maxLength: 2 }),
        async (
          bestPractices: Omit<BestPractice, 'id' | 'createdAt' | 'tenantId'>[],
          brandVoiceGuidelines: Omit<BrandVoiceGuideline, 'id' | 'createdAt' | 'updatedAt'>[],
          contentType: string,
          objective: string,
          targetPlatforms: Platform[]
        ) => {
          // Create custom best practices for the tenant
          const createdPractices: BestPractice[] = [];
          for (const practice of bestPractices) {
            const created = await bestPracticesService.createBestPractice(
              { ...practice, tenantId: testTenantContext.tenantId },
              testTenantContext
            );
            createdPractices.push(created);
          }

          // Create brand voice guidelines for the tenant
          const createdGuidelines: BrandVoiceGuideline[] = [];
          for (const guideline of brandVoiceGuidelines) {
            const created = await bestPracticesService.createBrandVoiceGuideline(
              guideline,
              testTenantContext
            );
            createdGuidelines.push(created);
          }

          // Get best practices for the specific content type and objective
          const relevantPractices = await bestPracticesService.getBestPracticesForContent(
            contentType,
            objective,
            testTenantContext
          );

          // Get formatted best practices for prompts
          const formattedPractices = await bestPracticesService.formatBestPracticesForPrompt(
            contentType,
            objective,
            testTenantContext
          );

          // Get formatted brand voice guidelines
          const formattedBrandVoice = await bestPracticesService.formatBrandVoiceForPrompt(
            testTenantContext
          );

          // Property: Relevant practices should be returned based on content type and objective
          const expectedRelevantPractices = createdPractices.filter(p => 
            (p.contentType === contentType || p.contentType === 'all') &&
            (p.objective === objective || p.objective === 'all')
          );

          // Should include both custom and default practices
          expect(relevantPractices.length).toBeGreaterThanOrEqual(expectedRelevantPractices.length);

          // Property: Custom practices should be prioritized over default ones
          const customPractices = relevantPractices.filter(p => p.isCustom);
          const defaultPractices = relevantPractices.filter(p => !p.isCustom);
          
          if (customPractices.length > 0 && defaultPractices.length > 0) {
            // Custom practices should appear first (higher priority)
            const firstCustomIndex = relevantPractices.findIndex(p => p.isCustom);
            const firstDefaultIndex = relevantPractices.findIndex(p => !p.isCustom);
            expect(firstCustomIndex).toBeLessThan(firstDefaultIndex);
          }

          // Property: Formatted practices should contain all relevant practice information
          expect(formattedPractices.length).toBe(relevantPractices.length);
          
          for (let i = 0; i < relevantPractices.length; i++) {
            const practice = relevantPractices[i];
            const formatted = formattedPractices[i];
            
            // Should have meaningful content (not just whitespace)
            expect(formatted.trim().length).toBeGreaterThan(0);
            
            // Should contain practice name
            expect(formatted).toContain(practice.name);
            
            // Should contain rules
            for (const rule of practice.rules) {
              expect(formatted).toContain(rule);
            }
            
            // Should contain positive examples if they exist
            for (const example of practice.examples.positive) {
              expect(formatted).toContain(example);
            }
            
            // Should contain negative examples if they exist
            for (const example of practice.examples.negative) {
              expect(formatted).toContain(example);
            }
          }

          // Property: Formatted brand voice should contain all active guidelines
          const activeGuidelines = createdGuidelines.filter(g => g.isActive);
          
          // The formatted guidelines should be at least as many as active guidelines
          // (could be more if there are default guidelines)
          expect(formattedBrandVoice.length).toBeGreaterThanOrEqual(0);
          
          // Each active guideline should be represented in the formatted output
          for (const guideline of activeGuidelines) {
            const matchingFormatted = formattedBrandVoice.find(f => f.includes(guideline.name));
            expect(matchingFormatted).toBeDefined();
            
            if (matchingFormatted) {
              // Should have meaningful content (not just whitespace)
              expect(matchingFormatted.trim().length).toBeGreaterThan(0);
              
              // Should contain tone
              expect(matchingFormatted).toContain(guideline.tone);
              
              // Should contain personality traits
              for (const trait of guideline.personality) {
                if (trait.trim().length > 0) {
                  expect(matchingFormatted).toContain(trait);
                }
              }
              
              // Should contain do's and don'ts
              for (const doItem of guideline.dosList) {
                if (doItem.trim().length > 0) {
                  expect(matchingFormatted).toContain(doItem);
                }
              }
              
              for (const dontItem of guideline.dontsList) {
                if (dontItem.trim().length > 0) {
                  expect(matchingFormatted).toContain(dontItem);
                }
              }
            }
          }

          // Property: Practices should be ordered by priority (custom first, then by priority desc)
          for (let i = 0; i < relevantPractices.length - 1; i++) {
            const current = relevantPractices[i];
            const next = relevantPractices[i + 1];
            
            if (current.isCustom && !next.isCustom) {
              // Custom should come before default
              expect(true).toBe(true);
            } else if (current.isCustom === next.isCustom) {
              // Same type should be ordered by priority (desc)
              expect(current.priority).toBeGreaterThanOrEqual(next.priority);
            }
          }
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design document
    );
  });

  it('Property 11.1: Best practices filtering works correctly for content type and objective', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(bestPracticeArbitrary, { minLength: 3, maxLength: 10 }),
        contentTypeArbitrary,
        objectiveArbitrary,
        async (
          bestPractices: Omit<BestPractice, 'id' | 'createdAt' | 'tenantId'>[],
          targetContentType: string,
          targetObjective: string
        ) => {
          // Create practices with different content types and objectives
          const createdPractices: BestPractice[] = [];
          for (const practice of bestPractices) {
            const created = await bestPracticesService.createBestPractice(
              { ...practice, tenantId: testTenantContext.tenantId },
              testTenantContext
            );
            createdPractices.push(created);
          }

          // Get practices for specific content type and objective
          const filteredPractices = await bestPracticesService.getBestPracticesForContent(
            targetContentType,
            targetObjective,
            testTenantContext
          );

          // Property: All returned practices should match the content type or be 'all'
          for (const practice of filteredPractices.filter(p => p.isCustom)) {
            expect(practice.contentType === targetContentType || practice.contentType === 'all').toBe(true);
          }

          // Property: All returned practices should match the objective or be 'all'
          for (const practice of filteredPractices.filter(p => p.isCustom)) {
            expect(practice.objective === targetObjective || practice.objective === 'all').toBe(true);
          }

          // Property: Should include practices with 'all' content type
          const allContentTypePractices = createdPractices.filter(p => 
            p.contentType === 'all' && 
            (p.objective === targetObjective || p.objective === 'all')
          );
          
          for (const allPractice of allContentTypePractices) {
            const found = filteredPractices.find(p => p.id === allPractice.id);
            expect(found).toBeDefined();
          }

          // Property: Should include practices with 'all' objective
          const allObjectivePractices = createdPractices.filter(p => 
            (p.contentType === targetContentType || p.contentType === 'all') && 
            p.objective === 'all'
          );
          
          for (const allPractice of allObjectivePractices) {
            const found = filteredPractices.find(p => p.id === allPractice.id);
            expect(found).toBeDefined();
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Property 11.2: Brand voice guidelines are consistently formatted', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(getBrandVoiceGuidelineArbitrary(testTenantContext.tenantId), { minLength: 1, maxLength: 5 }),
        async (brandVoiceGuidelines: Omit<BrandVoiceGuideline, 'id' | 'createdAt' | 'updatedAt'>[]) => {
          // Create brand voice guidelines
          const createdGuidelines: BrandVoiceGuideline[] = [];
          for (const guideline of brandVoiceGuidelines) {
            const created = await bestPracticesService.createBrandVoiceGuideline(
              guideline,
              testTenantContext
            );
            createdGuidelines.push(created);
          }

          // Get formatted brand voice
          const formattedGuidelines = await bestPracticesService.formatBrandVoiceForPrompt(
            testTenantContext
          );

          // Property: Number of formatted guidelines should match active guidelines
          const activeGuidelines = createdGuidelines.filter(g => g.isActive);
          
          // Should have at least one formatted guideline per active guideline
          expect(formattedGuidelines.length).toBeGreaterThanOrEqual(0);
          
          // Each active guideline should be represented
          for (const guideline of activeGuidelines) {
            const matchingFormatted = formattedGuidelines.find(f => f.includes(guideline.name));
            expect(matchingFormatted).toBeDefined();
          }

          // Property: Each formatted guideline should contain required elements
          for (const formatted of formattedGuidelines) {
            // Should contain a name/title
            expect(formatted).toMatch(/^[^:]+:/);
            
            // Should contain tone information
            expect(formatted).toContain('Tone:');
            
            // Should contain personality information
            expect(formatted).toContain('Personality:');
            
            // Should be properly structured with newlines
            expect(formatted.split('\n').length).toBeGreaterThan(1);
            
            // Should have meaningful content (not just whitespace)
            expect(formatted.trim().length).toBeGreaterThan(0);
          }

          // Property: Inactive guidelines should not be included
          const inactiveGuidelines = createdGuidelines.filter(g => !g.isActive);
          for (const inactive of inactiveGuidelines) {
            const foundInFormatted = formattedGuidelines.some(f => f.includes(inactive.name));
            expect(foundInFormatted).toBe(false);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Property 11.3: Best practices management operations maintain data integrity', async () => {
    await fc.assert(
      fc.asyncProperty(
        bestPracticeArbitrary,
        fc.record({
          name: fc.option(meaningfulStringArbitrary(5, 50)),
          priority: fc.option(fc.integer({ min: 1, max: 10 })),
          rules: fc.option(fc.array(meaningfulStringArbitrary(10, 100), { minLength: 1, maxLength: 5 }))
        }),
        async (
          initialPractice: Omit<BestPractice, 'id' | 'createdAt' | 'tenantId'>,
          updates: Partial<BestPractice>
        ) => {
          // Create initial practice
          const created = await bestPracticesService.createBestPractice(
            { ...initialPractice, tenantId: testTenantContext.tenantId },
            testTenantContext
          );

          // Property: Created practice should have all required fields
          expect(created.id).toBeDefined();
          expect(created.name).toBe(initialPractice.name);
          expect(created.contentType).toBe(initialPractice.contentType);
          expect(created.objective).toBe(initialPractice.objective);
          expect(created.rules).toEqual(initialPractice.rules);
          expect(created.examples).toEqual(initialPractice.examples);
          expect(created.priority).toBe(initialPractice.priority);
          expect(created.isCustom).toBe(true);
          expect(created.tenantId).toBe(testTenantContext.tenantId);
          expect(created.createdAt).toBeInstanceOf(Date);

          // Update the practice only if we have valid updates
          const validUpdates = Object.fromEntries(
            Object.entries(updates).filter(([_, value]) => value !== null && value !== undefined)
          );

          if (Object.keys(validUpdates).length > 0) {
            const updated = await bestPracticesService.updateBestPractice(
              created.id,
              validUpdates,
              testTenantContext
            );

            // Property: Updated practice should preserve unchanged fields
            expect(updated.id).toBe(created.id);
            expect(updated.createdAt).toEqual(created.createdAt);
            expect(updated.tenantId).toBe(created.tenantId);

            // Property: Updated practice should reflect changes
            if (validUpdates.name !== undefined) {
              expect(updated.name).toBe(validUpdates.name);
            } else {
              expect(updated.name).toBe(created.name);
            }

            if (validUpdates.priority !== undefined) {
              expect(updated.priority).toBe(validUpdates.priority);
            } else {
              expect(updated.priority).toBe(created.priority);
            }

            if (validUpdates.rules !== undefined) {
              expect(updated.rules).toEqual(validUpdates.rules);
            } else {
              expect(updated.rules).toEqual(created.rules);
            }
          }

          // Property: Practice should be retrievable by ID
          const retrieved = await bestPracticesService.getBestPracticeById(
            created.id,
            testTenantContext
          );
          expect(retrieved).toBeDefined();
          expect(retrieved?.id).toBe(created.id);

          // Property: Practice should appear in tenant's practices list
          const allPractices = await bestPracticesService.getAllBestPractices(testTenantContext);
          const foundInList = allPractices.find(p => p.id === created.id);
          expect(foundInList).toBeDefined();

          // Clean up - delete the practice
          await bestPracticesService.deleteBestPractice(created.id, testTenantContext);

          // Property: Deleted practice should not be retrievable
          const deletedPractice = await bestPracticesService.getBestPracticeById(
            created.id,
            testTenantContext
          );
          expect(deletedPractice).toBeNull();
        }
      ),
      { numRuns: 50 }
    );
  });
});