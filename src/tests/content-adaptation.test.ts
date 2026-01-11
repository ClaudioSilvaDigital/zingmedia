import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { TestDatabaseManager } from '../config/test-database';
import { ContentGenerationService } from '../services/content-generation';
import { BestPracticesService } from '../services/best-practices';
import { 
  ContentData, 
  AdaptedContent, 
  Platform, 
  TenantContext, 
  User, 
  Tenant, 
  Permission 
} from '../types';

// Feature: content-automation-platform, Property 7: Multi-Platform Content Adaptation
// For any base content and target platform, the adapted content should conform to the platform's specific requirements (dimensions, format, character limits)
// Validates: Requirements 7.2, 14.2

describe('Content Adaptation Property Tests', () => {
  let testDb: TestDatabaseManager;
  let contentGenerationService: ContentGenerationService;
  let bestPracticesService: BestPracticesService;
  let testTenantContext: TenantContext;

  beforeAll(async () => {
    testDb = new TestDatabaseManager();
    await testDb.initialize();
    
    contentGenerationService = new ContentGenerationService(testDb);
    bestPracticesService = new BestPracticesService(testDb);

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

    // Initialize default best practices
    await bestPracticesService.initializeDefaultBestPractices();
  });

  afterAll(async () => {
    await testDb.close();
  });

  beforeEach(async () => {
    // Clean up any test data between tests if needed
  });

  // Generators for property-based testing
  const contentDataArbitrary = fc.record({
    text: fc.option(fc.string({ minLength: 1, maxLength: 5000 })),
    mediaUrls: fc.option(fc.array(fc.webUrl(), { maxLength: 5 })),
    metadata: fc.option(fc.dictionary(fc.string(), fc.anything()))
  });

  const platformArbitrary = fc.constantFrom<Platform>('instagram', 'tiktok', 'facebook', 'linkedin');

  const brandVoiceGuidelinesArbitrary = fc.array(
    fc.string({ minLength: 10, maxLength: 200 }),
    { maxLength: 5 }
  );

  const bestPracticesArbitrary = fc.array(
    fc.string({ minLength: 10, maxLength: 200 }),
    { maxLength: 5 }
  );

  it('Property 7: Multi-Platform Content Adaptation - Content should conform to platform requirements', async () => {
    await fc.assert(
      fc.asyncProperty(
        contentDataArbitrary,
        platformArbitrary,
        brandVoiceGuidelinesArbitrary,
        bestPracticesArbitrary,
        async (baseContent: ContentData, platform: Platform, brandVoice: string[], bestPractices: string[]) => {
          // Adapt content for the platform
          const adaptedContent = await contentGenerationService.adaptContentForPlatform(
            baseContent,
            platform,
            brandVoice,
            bestPractices
          );

          // Get platform requirements
          const requirements = contentGenerationService.getPlatformRequirements(platform);
          expect(requirements).toBeDefined();

          // Validate that adapted content conforms to platform requirements
          const validation = await contentGenerationService.validatePlatformRequirements(
            adaptedContent,
            platform
          );

          // Property: Adapted content should always be valid for the target platform
          expect(validation.isValid).toBe(true);
          expect(validation.errors).toHaveLength(0);

          // Property: Adapted content should have platform-specific metadata
          expect(adaptedContent.metadata).toBeDefined();
          expect(adaptedContent.metadata?.platform).toBe(platform);
          expect(adaptedContent.metadata?.adaptedAt).toBeDefined();

          // Property: Platform-specific data should be present
          expect(adaptedContent.platformSpecific).toBeDefined();

          // Platform-specific validations
          if (requirements?.maxTextLength && adaptedContent.text) {
            // Property: Text should not exceed platform limits
            expect(adaptedContent.text.length).toBeLessThanOrEqual(requirements.maxTextLength);
          }

          // Platform-specific structure validations
          switch (platform) {
            case 'instagram':
              expect(adaptedContent.platformSpecific?.aspectRatio).toBeDefined();
              expect(adaptedContent.platformSpecific?.mediaType).toBeDefined();
              expect(adaptedContent.platformSpecific?.caption).toBeDefined();
              expect(adaptedContent.platformSpecific?.hashtags).toBeDefined();
              expect(Array.isArray(adaptedContent.platformSpecific?.hashtags)).toBe(true);
              break;

            case 'tiktok':
              expect(adaptedContent.platformSpecific?.duration).toBeDefined();
              expect(adaptedContent.platformSpecific?.hashtags).toBeDefined();
              expect(adaptedContent.platformSpecific?.privacy).toBeDefined();
              expect(Array.isArray(adaptedContent.platformSpecific?.hashtags)).toBe(true);
              break;

            case 'facebook':
              expect(adaptedContent.platformSpecific?.postType).toBeDefined();
              expect(adaptedContent.platformSpecific?.content).toBeDefined();
              expect(adaptedContent.platformSpecific?.targetAudience).toBeDefined();
              break;

            case 'linkedin':
              expect(adaptedContent.platformSpecific?.postType).toBeDefined();
              expect(adaptedContent.platformSpecific?.content).toBeDefined();
              expect(adaptedContent.platformSpecific?.targetAudience).toBeDefined();
              break;
          }
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design document
    );
  });

  it('Property 7.1: Content adaptation preserves original content meaning', async () => {
    await fc.assert(
      fc.asyncProperty(
        contentDataArbitrary.filter(content => content.text !== undefined && content.text !== null),
        platformArbitrary,
        async (baseContent: ContentData, platform: Platform) => {
          const adaptedContent = await contentGenerationService.adaptContentForPlatform(
            baseContent,
            platform,
            [],
            []
          );

          // Property: Original text should be preserved or properly truncated
          if (baseContent.text && adaptedContent.text) {
            const requirements = contentGenerationService.getPlatformRequirements(platform);
            
            if (requirements?.maxTextLength && baseContent.text.length > requirements.maxTextLength) {
              // Text should be truncated but still meaningful
              expect(adaptedContent.text.length).toBeLessThanOrEqual(requirements.maxTextLength);
              expect(adaptedContent.text).toMatch(/\.\.\.$/); // Should end with ellipsis if truncated
            } else {
              // Text should be preserved if within limits
              expect(adaptedContent.text).toBe(baseContent.text);
            }
          }

          // Property: Media URLs should be preserved
          if (baseContent.mediaUrls) {
            expect(adaptedContent.mediaUrls).toEqual(baseContent.mediaUrls);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 7.2: Platform requirements are consistently applied', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(contentDataArbitrary, { minLength: 2, maxLength: 10 }),
        platformArbitrary,
        async (contentArray: ContentData[], platform: Platform) => {
          const adaptedContentArray: AdaptedContent[] = [];

          // Adapt all content for the same platform
          for (const baseContent of contentArray) {
            const adaptedContent = await contentGenerationService.adaptContentForPlatform(
              baseContent,
              platform,
              [],
              []
            );
            adaptedContentArray.push(adaptedContent);
          }

          // Property: All adapted content should have the same platform-specific structure
          const firstAdapted = adaptedContentArray[0];
          for (let i = 1; i < adaptedContentArray.length; i++) {
            const currentAdapted = adaptedContentArray[i];
            
            // Same platform metadata
            expect(currentAdapted.metadata?.platform).toBe(firstAdapted.metadata?.platform);
            
            // Same platform-specific keys
            const firstKeys = Object.keys(firstAdapted.platformSpecific || {}).sort();
            const currentKeys = Object.keys(currentAdapted.platformSpecific || {}).sort();
            expect(currentKeys).toEqual(firstKeys);
          }

          // Property: All content should pass validation for the platform
          for (const adaptedContent of adaptedContentArray) {
            const validation = await contentGenerationService.validatePlatformRequirements(
              adaptedContent,
              platform
            );
            expect(validation.isValid).toBe(true);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Property 7.3: Hashtag limits are enforced across platforms', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          text: fc.string().map(s => s + ' ' + Array.from({length: 50}, (_, i) => `#hashtag${i}`).join(' ')),
          mediaUrls: fc.option(fc.array(fc.webUrl(), { maxLength: 2 })),
          metadata: fc.option(fc.dictionary(fc.string(), fc.anything()))
        }),
        platformArbitrary,
        async (baseContent: ContentData, platform: Platform) => {
          const adaptedContent = await contentGenerationService.adaptContentForPlatform(
            baseContent,
            platform,
            [],
            []
          );

          const requirements = contentGenerationService.getPlatformRequirements(platform);
          
          if (requirements?.hashtagLimit && adaptedContent.platformSpecific?.hashtags) {
            // Property: Hashtag count should not exceed platform limits
            const hashtagCount = Array.isArray(adaptedContent.platformSpecific.hashtags) 
              ? adaptedContent.platformSpecific.hashtags.length 
              : 0;
            expect(hashtagCount).toBeLessThanOrEqual(requirements.hashtagLimit);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 7.4: Supported platforms return valid requirements', async () => {
    const supportedPlatforms = contentGenerationService.getSupportedPlatforms();
    
    // Property: All supported platforms should have valid requirements
    for (const platform of supportedPlatforms) {
      const requirements = contentGenerationService.getPlatformRequirements(platform);
      expect(requirements).toBeDefined();
      
      // Requirements should have expected structure
      expect(typeof requirements?.maxTextLength === 'number' || requirements?.maxTextLength === undefined).toBe(true);
      expect(typeof requirements?.hashtagLimit === 'number' || requirements?.hashtagLimit === undefined).toBe(true);
      expect(typeof requirements?.videoMaxDuration === 'number' || requirements?.videoMaxDuration === undefined).toBe(true);
    }

    // Property: Unsupported platforms should return undefined
    const unsupportedPlatform = 'unsupported' as Platform;
    const unsupportedRequirements = contentGenerationService.getPlatformRequirements(unsupportedPlatform);
    expect(unsupportedRequirements).toBeUndefined();
  });
});