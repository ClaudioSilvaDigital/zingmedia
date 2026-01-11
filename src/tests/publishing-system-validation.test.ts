import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { PublisherService } from '../services/publishing/publisher-service.js';
import { PlatformAdapterRegistry } from '../services/publishing/platform-registry.js';
import { InstagramAdapter } from '../services/publishing/instagram-adapter.js';
import { FacebookAdapter } from '../services/publishing/facebook-adapter.js';
import { TikTokAdapter } from '../services/publishing/tiktok-adapter.js';
import { LinkedInAdapter } from '../services/publishing/linkedin-adapter.js';
import { 
  AdaptedContent, 
  Platform, 
  TenantContext, 
  User, 
  Tenant 
} from '../types/index.js';
import { PlatformCredentials } from '../services/publishing/platform-adapter.js';
import { DatabasePool } from '../interfaces/database.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('Publishing System Validation', () => {
  let mockDb: DatabasePool;
  let publisherService: PublisherService;
  let mockTenantContext: TenantContext;
  let mockCredentials: PlatformCredentials;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mock database
    mockDb = {
      query: vi.fn().mockImplementation((query: string, params?: any[]) => {
        if (query.includes('INSERT INTO platform_credentials')) {
          return { rows: [], rowCount: 1 };
        }
        if (query.includes('SELECT') && query.includes('content')) {
          return {
            rows: [{
              id: 'content-123',
              briefing_id: 'briefing-123',
              title: 'Test Content',
              description: 'Test content description',
              content_type: 'text',
              base_content: JSON.stringify({
                text: 'This is test content for social media posting',
                metadata: { generatedAt: new Date().toISOString() }
              }),
              adapted_content: JSON.stringify({
                instagram: {
                  text: 'This is test content for social media posting',
                  mediaUrls: ['https://example.com/image.jpg'],
                  metadata: { platform: 'instagram', adaptedAt: new Date().toISOString() },
                  platformSpecific: {
                    aspectRatio: '1:1',
                    mediaType: 'photo',
                    caption: 'This is test content for social media posting',
                    hashtags: ['#test', '#socialmedia']
                  }
                },
                facebook: {
                  text: 'This is test content for social media posting',
                  mediaUrls: ['https://example.com/image.jpg'],
                  metadata: { platform: 'facebook', adaptedAt: new Date().toISOString() },
                  platformSpecific: {
                    postType: 'photo',
                    content: 'This is test content for social media posting',
                    targetAudience: 'everyone'
                  }
                }
              }),
              workflow_id: 'workflow-123',
              tenant_id: 'tenant-123',
              client_id: 'client-123',
              created_by: 'user-123',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }]
          };
        }
        if (query.includes('SELECT') && query.includes('platform_credentials')) {
          return {
            rows: [{
              credentials: JSON.stringify({
                accessToken: 'mock_access_token',
                refreshToken: 'mock_refresh_token',
                appId: 'mock_app_id',
                appSecret: 'mock_app_secret'
              })
            }]
          };
        }
        if (query.includes('INSERT INTO publish_jobs')) {
          return { rows: [], rowCount: 1 };
        }
        
        return { rows: [], rowCount: 0 };
      })
    } as DatabasePool;

    publisherService = new PublisherService(mockDb);

    // Setup mock tenant context
    const mockTenant: Tenant = {
      id: 'tenant-123',
      name: 'Test Agency',
      type: 'agency',
      brandConfig: { 
        primaryColor: '#000000', 
        secondaryColor: '#ffffff',
        fontFamily: 'Arial',
        logo: 'https://example.com/logo.png'
      },
      settings: { 
        maxUsers: 100, 
        maxClients: 50, 
        features: ['all'], 
        billingPlan: 'pro' 
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const mockUser: User = {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      passwordHash: 'hashed',
      tenantId: 'tenant-123',
      roles: [],
      permissions: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    mockTenantContext = {
      tenantId: 'tenant-123',
      tenant: mockTenant,
      user: mockUser,
      permissions: []
    };

    mockCredentials = {
      accessToken: 'mock_access_token',
      refreshToken: 'mock_refresh_token',
      appId: 'mock_app_id',
      appSecret: 'mock_app_secret'
    };

    // Mock successful API responses
    (fetch as Mock).mockImplementation((url: string, options?: any) => {
      if (url.includes('graph.facebook.com')) {
        if (url.includes('/me')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ id: 'user123', name: 'Test User' })
          });
        }
        if (url.includes('/accounts')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              data: [{
                id: 'page123',
                name: 'Test Page',
                access_token: 'page_access_token',
                instagram_business_account: { id: 'ig123' }
              }]
            })
          });
        }
        if (url.includes('/media')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ id: 'media123' })
          });
        }
        if (url.includes('/media_publish')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ id: 'post123' })
          });
        }
        if (url.includes('/feed') || url.includes('/photos')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ id: 'post123', post_id: 'post123' })
          });
        }
      }
      
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024))
      });
    });
  });

  describe('Platform Integration Validation', () => {
    it('should successfully register platform credentials', async () => {
      await publisherService.registerPlatformCredentials('instagram', mockCredentials, mockTenantContext);
      
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO platform_credentials'),
        expect.arrayContaining([
          expect.any(String), // credentialsId
          mockTenantContext.tenantId,
          'instagram',
          JSON.stringify(mockCredentials),
          true,
          expect.any(String), // created_at
          expect.any(String)  // updated_at
        ])
      );
    });

    it('should return supported platforms', () => {
      const supportedPlatforms = publisherService.getSupportedPlatforms();
      
      expect(supportedPlatforms).toContain('instagram');
      expect(supportedPlatforms).toContain('facebook');
      expect(supportedPlatforms).toContain('tiktok');
      expect(supportedPlatforms).toContain('linkedin');
      expect(supportedPlatforms).toHaveLength(4);
    });

    it('should return platform requirements for all supported platforms', () => {
      const platforms: Platform[] = ['instagram', 'facebook', 'tiktok', 'linkedin'];
      
      platforms.forEach(platform => {
        const requirements = publisherService.getPlatformRequirements(platform);
        expect(requirements).toBeDefined();
        expect(requirements!.maxTextLength).toBeGreaterThan(0);
        expect(requirements!.requiredFields).toBeDefined();
        expect(Array.isArray(requirements!.requiredFields)).toBe(true);
      });
    });

    it('should validate content against platform requirements', async () => {
      const validContent: AdaptedContent = {
        text: 'Valid test content',
        mediaUrls: ['https://example.com/image.jpg'],
        metadata: { platform: 'instagram', adaptedAt: new Date().toISOString() },
        platformSpecific: {
          aspectRatio: '1:1',
          mediaType: 'photo',
          caption: 'Valid test content',
          hashtags: ['#test']
        }
      };

      const validation = await publisherService.validatePlatformRequirements(validContent, 'instagram');
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject invalid content', async () => {
      const invalidContent: AdaptedContent = {
        text: 'Invalid content',
        mediaUrls: [], // Missing required media for Instagram
        metadata: { platform: 'instagram', adaptedAt: new Date().toISOString() },
        platformSpecific: {
          aspectRatio: '1:1',
          mediaType: 'photo',
          caption: 'Invalid content',
          hashtags: Array.from({ length: 35 }, (_, i) => `#hashtag${i}`) // Too many hashtags
        }
      };

      const validation = await publisherService.validatePlatformRequirements(invalidContent, 'instagram');
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Content Publishing Flow', () => {
    it('should successfully publish content to Instagram', async () => {
      await publisherService.registerPlatformCredentials('instagram', mockCredentials, mockTenantContext);

      const publishRequest = {
        contentId: 'content-123',
        platforms: ['instagram'] as Platform[]
      };

      const publishResults = await publisherService.publishContent(publishRequest, mockTenantContext);
      
      expect(publishResults).toHaveLength(1);
      expect(publishResults[0].platform).toBe('instagram');
      expect(publishResults[0].status).toBe('success');
      expect(publishResults[0].result?.success).toBe(true);
      expect(publishResults[0].result?.platformPostId).toBeDefined();
    });

    it('should successfully publish content to Facebook', async () => {
      await publisherService.registerPlatformCredentials('facebook', mockCredentials, mockTenantContext);

      const publishRequest = {
        contentId: 'content-123',
        platforms: ['facebook'] as Platform[]
      };

      const publishResults = await publisherService.publishContent(publishRequest, mockTenantContext);
      
      expect(publishResults).toHaveLength(1);
      expect(publishResults[0].platform).toBe('facebook');
      expect(publishResults[0].status).toBe('success');
      expect(publishResults[0].result?.success).toBe(true);
      expect(publishResults[0].result?.platformPostId).toBeDefined();
    });

    it('should publish to multiple platforms simultaneously', async () => {
      await publisherService.registerPlatformCredentials('instagram', mockCredentials, mockTenantContext);
      await publisherService.registerPlatformCredentials('facebook', mockCredentials, mockTenantContext);

      const publishRequest = {
        contentId: 'content-123',
        platforms: ['instagram', 'facebook'] as Platform[]
      };

      const publishResults = await publisherService.publishContent(publishRequest, mockTenantContext);
      
      expect(publishResults).toHaveLength(2);
      
      const instagramResult = publishResults.find(r => r.platform === 'instagram');
      const facebookResult = publishResults.find(r => r.platform === 'facebook');
      
      expect(instagramResult?.status).toBe('success');
      expect(facebookResult?.status).toBe('success');
    });

    it('should handle missing credentials gracefully', async () => {
      const publishRequest = {
        contentId: 'content-123',
        platforms: ['instagram'] as Platform[]
      };

      const publishResults = await publisherService.publishContent(publishRequest, mockTenantContext);
      
      expect(publishResults).toHaveLength(1);
      expect(publishResults[0].status).toBe('failed');
      expect(publishResults[0].error).toContain('credentials not found');
    });

    it('should handle API failures gracefully', async () => {
      // Mock API failure
      (fetch as Mock).mockImplementation(() => {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({
            error: { message: 'API Error' }
          })
        });
      });

      await publisherService.registerPlatformCredentials('instagram', mockCredentials, mockTenantContext);

      const publishRequest = {
        contentId: 'content-123',
        platforms: ['instagram'] as Platform[]
      };

      const publishResults = await publisherService.publishContent(publishRequest, mockTenantContext);
      
      expect(publishResults).toHaveLength(1);
      expect(publishResults[0].status).toBe('failed');
      expect(publishResults[0].error).toBeDefined();
    });
  });

  describe('Content Adaptation', () => {
    it('should adapt content for Instagram with proper structure', async () => {
      const baseContent = {
        text: 'Test content with #hashtags',
        mediaUrls: ['https://example.com/image.jpg'],
        metadata: { generatedAt: new Date().toISOString() }
      };

      const adapted = await publisherService.adaptContentForPlatform(
        baseContent,
        'instagram',
        [],
        []
      );

      expect(adapted.platformSpecific?.aspectRatio).toBe('1:1');
      expect(adapted.platformSpecific?.mediaType).toBe('photo');
      expect(adapted.platformSpecific?.hashtags).toContain('#hashtags');
    });

    it('should adapt content for Facebook with proper structure', async () => {
      const baseContent = {
        text: 'Test Facebook content',
        mediaUrls: ['https://example.com/image.jpg'],
        metadata: { generatedAt: new Date().toISOString() }
      };

      const adapted = await publisherService.adaptContentForPlatform(
        baseContent,
        'facebook',
        [],
        []
      );

      expect(adapted.platformSpecific?.postType).toBe('photo');
      expect(adapted.platformSpecific?.targetAudience).toBe('everyone');
    });

    it('should truncate text that exceeds platform limits', async () => {
      const longText = 'A'.repeat(3000); // Exceeds Instagram limit of 2200
      const baseContent = {
        text: longText,
        mediaUrls: ['https://example.com/image.jpg'],
        metadata: { generatedAt: new Date().toISOString() }
      };

      const adapted = await publisherService.adaptContentForPlatform(
        baseContent,
        'instagram',
        [],
        []
      );

      expect(adapted.text!.length).toBeLessThanOrEqual(2200);
      expect(adapted.text).toEndWith('...');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle network timeouts', async () => {
      (fetch as Mock).mockImplementation(() => {
        return Promise.reject(new Error('Network timeout'));
      });

      await publisherService.registerPlatformCredentials('instagram', mockCredentials, mockTenantContext);

      const publishRequest = {
        contentId: 'content-123',
        platforms: ['instagram'] as Platform[]
      };

      const publishResults = await publisherService.publishContent(publishRequest, mockTenantContext);
      
      expect(publishResults[0].status).toBe('failed');
      expect(publishResults[0].error).toContain('Network timeout');
    });

    it('should store publish results in database', async () => {
      await publisherService.registerPlatformCredentials('instagram', mockCredentials, mockTenantContext);

      const publishRequest = {
        contentId: 'content-123',
        platforms: ['instagram'] as Platform[]
      };

      await publisherService.publishContent(publishRequest, mockTenantContext);
      
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO publish_jobs'),
        expect.arrayContaining([
          expect.any(String), // jobId
          'content-123',
          'instagram',
          'success',
          expect.any(String), // result JSON
          null, // error
          0, // retry count
          expect.any(String), // scheduled_at
          expect.any(String), // published_at
          mockTenantContext.tenantId,
          expect.any(String), // created_at
          expect.any(String)  // updated_at
        ])
      );
    });
  });

  describe('Platform Adapter Registry', () => {
    it('should register and manage platform adapters', () => {
      const registry = new PlatformAdapterRegistry();
      
      // Register adapters
      const instagramAdapter = registry.registerAdapter('instagram', mockCredentials);
      const facebookAdapter = registry.registerAdapter('facebook', mockCredentials);
      
      expect(instagramAdapter).toBeInstanceOf(InstagramAdapter);
      expect(facebookAdapter).toBeInstanceOf(FacebookAdapter);
      expect(registry.getAdapterCount()).toBe(2);
      
      // Retrieve adapters
      const retrievedInstagram = registry.getAdapter('instagram', mockCredentials);
      expect(retrievedInstagram).toBe(instagramAdapter);
      
      // Remove adapters
      const removed = registry.removeAdapter('instagram', mockCredentials);
      expect(removed).toBe(true);
      expect(registry.getAdapterCount()).toBe(1);
    });

    it('should support all required platforms', () => {
      const registry = new PlatformAdapterRegistry();
      const supportedPlatforms = registry.getSupportedPlatforms();
      
      expect(supportedPlatforms).toContain('instagram');
      expect(supportedPlatforms).toContain('facebook');
      expect(supportedPlatforms).toContain('tiktok');
      expect(supportedPlatforms).toContain('linkedin');
    });
  });
});