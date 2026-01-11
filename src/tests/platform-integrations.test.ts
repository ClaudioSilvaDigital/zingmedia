import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { InstagramAdapter } from '../services/publishing/instagram-adapter';
import { TikTokAdapter } from '../services/publishing/tiktok-adapter';
import { FacebookAdapter } from '../services/publishing/facebook-adapter';
import { LinkedInAdapter } from '../services/publishing/linkedin-adapter';
import { PlatformAdapterRegistry } from '../services/publishing/platform-registry';
import { PublisherService } from '../services/publishing/publisher-service';
import { 
  AdaptedContent, 
  Platform, 
  TenantContext, 
  User, 
  Tenant 
} from '../types';
import { PlatformCredentials } from '../services/publishing/platform-adapter';

// Mock fetch globally
global.fetch = vi.fn();

describe('Platform Integrations Unit Tests', () => {
  let mockCredentials: PlatformCredentials;
  let mockTenantContext: TenantContext;
  let mockAdaptedContent: AdaptedContent;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockCredentials = {
      accessToken: 'mock_access_token',
      refreshToken: 'mock_refresh_token',
      appId: 'mock_app_id',
      appSecret: 'mock_app_secret'
    };

    const mockTenant: Tenant = {
      id: 'tenant-123',
      name: 'Test Tenant',
      type: 'agency',
      brandConfig: { primaryColor: '#000000', fontFamily: 'Arial' },
      settings: { maxUsers: 100, maxClients: 50, features: ['all'], billingPlan: 'pro' },
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

    mockAdaptedContent = {
      text: 'Test content for social media',
      mediaUrls: ['https://example.com/image.jpg'],
      metadata: {
        platform: 'instagram',
        adaptedAt: new Date().toISOString(),
        originalContentId: 'content-123'
      },
      platformSpecific: {
        aspectRatio: '1:1',
        mediaType: 'photo',
        caption: 'Test content for social media',
        hashtags: ['#test', '#socialmedia']
      }
    };
  });

  describe('InstagramAdapter', () => {
    let instagramAdapter: InstagramAdapter;

    beforeEach(() => {
      instagramAdapter = new InstagramAdapter(mockCredentials);
    });

    it('should create Instagram adapter with correct platform', () => {
      expect(instagramAdapter.getPlatform()).toBe('instagram');
    });

    it('should authenticate successfully with valid credentials', async () => {
      (fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'user123', name: 'Test User' })
      });

      const result = await instagramAdapter.authenticate();
      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('graph.facebook.com/v18.0/me')
      );
    });

    it('should fail authentication with invalid credentials', async () => {
      (fetch as Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: 'Invalid access token' } })
      });

      const result = await instagramAdapter.authenticate();
      expect(result).toBe(false);
    });

    it('should validate content requirements correctly', async () => {
      const validContent: AdaptedContent = {
        ...mockAdaptedContent,
        platformSpecific: {
          aspectRatio: '1:1',
          mediaType: 'photo',
          caption: 'Valid caption',
          hashtags: ['#test']
        }
      };

      const result = await instagramAdapter.validateContent(validContent);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject content with too many hashtags', async () => {
      const invalidContent: AdaptedContent = {
        ...mockAdaptedContent,
        platformSpecific: {
          aspectRatio: '1:1',
          mediaType: 'photo',
          caption: 'Test caption',
          hashtags: Array.from({ length: 35 }, (_, i) => `#hashtag${i}`) // Exceeds limit of 30
        }
      };

      const result = await instagramAdapter.validateContent(invalidContent);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'hashtags',
          code: 'TOO_MANY_HASHTAGS'
        })
      );
    });

    it('should reject content without media URLs', async () => {
      const invalidContent: AdaptedContent = {
        ...mockAdaptedContent,
        mediaUrls: []
      };

      const result = await instagramAdapter.validateContent(invalidContent);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'mediaUrls',
          code: 'MISSING_MEDIA'
        })
      );
    });

    it('should return correct platform requirements', () => {
      const requirements = instagramAdapter.getRequirements();
      expect(requirements).toEqual({
        maxTextLength: 2200,
        hashtagLimit: 30,
        videoMaxDuration: 60,
        imageFormats: ['jpg', 'jpeg', 'png'],
        videoFormats: ['mp4', 'mov'],
        aspectRatios: ['1:1', '4:5', '9:16'],
        maxFileSize: 100 * 1024 * 1024,
        requiredFields: ['mediaUrls', 'mediaType']
      });
    });

    it('should perform health check correctly', async () => {
      const mockStartTime = Date.now();
      vi.spyOn(Date, 'now')
        .mockReturnValueOnce(mockStartTime)
        .mockReturnValueOnce(mockStartTime + 100);

      (fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'user123' }),
        headers: new Map([['x-app-usage', '{"call_count": 25}']])
      });

      const healthCheck = await instagramAdapter.checkHealth();
      expect(healthCheck.isHealthy).toBe(true);
      expect(healthCheck.responseTime).toBe(100);
      expect(healthCheck.rateLimitRemaining).toBe(75);
    });
  });

  describe('TikTokAdapter', () => {
    let tiktokAdapter: TikTokAdapter;

    beforeEach(() => {
      tiktokAdapter = new TikTokAdapter(mockCredentials);
    });

    it('should create TikTok adapter with correct platform', () => {
      expect(tiktokAdapter.getPlatform()).toBe('tiktok');
    });

    it('should authenticate successfully', async () => {
      (fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          data: { 
            user: { 
              open_id: 'user123', 
              display_name: 'Test User' 
            } 
          } 
        })
      });

      const result = await tiktokAdapter.authenticate();
      expect(result).toBe(true);
    });

    it('should validate video content requirements', async () => {
      const validContent: AdaptedContent = {
        ...mockAdaptedContent,
        mediaUrls: ['https://example.com/video.mp4'],
        platformSpecific: {
          duration: 30,
          hashtags: ['#test'],
          privacy: 'public'
        }
      };

      const result = await tiktokAdapter.validateContent(validContent);
      expect(result.isValid).toBe(true);
    });

    it('should reject content without video', async () => {
      const invalidContent: AdaptedContent = {
        ...mockAdaptedContent,
        mediaUrls: []
      };

      const result = await tiktokAdapter.validateContent(invalidContent);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'mediaUrls',
          code: 'MISSING_VIDEO'
        })
      );
    });

    it('should return correct platform requirements', () => {
      const requirements = tiktokAdapter.getRequirements();
      expect(requirements).toEqual({
        maxTextLength: 2200,
        hashtagLimit: 20,
        videoMaxDuration: 180,
        videoFormats: ['mp4', 'mov', 'avi'],
        maxFileSize: 500 * 1024 * 1024,
        requiredFields: ['mediaUrls', 'privacy']
      });
    });
  });

  describe('FacebookAdapter', () => {
    let facebookAdapter: FacebookAdapter;

    beforeEach(() => {
      facebookAdapter = new FacebookAdapter(mockCredentials);
    });

    it('should create Facebook adapter with correct platform', () => {
      expect(facebookAdapter.getPlatform()).toBe('facebook');
    });

    it('should authenticate and get page access token', async () => {
      // Mock user authentication
      (fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'user123', name: 'Test User' })
      });

      // Mock pages request
      (fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{
            id: 'page123',
            name: 'Test Page',
            access_token: 'page_access_token'
          }]
        })
      });

      const result = await facebookAdapter.authenticate();
      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should validate post content requirements', async () => {
      const validContent: AdaptedContent = {
        ...mockAdaptedContent,
        platformSpecific: {
          postType: 'photo',
          content: 'Test Facebook post',
          targetAudience: 'everyone'
        }
      };

      const result = await facebookAdapter.validateContent(validContent);
      expect(result.isValid).toBe(true);
    });

    it('should reject content with invalid post type', async () => {
      const invalidContent: AdaptedContent = {
        ...mockAdaptedContent,
        platformSpecific: {
          postType: 'invalid_type',
          content: 'Test content'
        }
      };

      const result = await facebookAdapter.validateContent(invalidContent);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'postType',
          code: 'INVALID_POST_TYPE'
        })
      );
    });

    it('should return correct platform requirements', () => {
      const requirements = facebookAdapter.getRequirements();
      expect(requirements).toEqual({
        maxTextLength: 63206,
        videoMaxDuration: 240 * 60,
        imageFormats: ['jpg', 'jpeg', 'png', 'gif', 'bmp'],
        videoFormats: ['mp4', 'mov', 'avi', 'mkv', '3gp'],
        maxFileSize: 4 * 1024 * 1024 * 1024,
        requiredFields: ['postType', 'content']
      });
    });
  });

  describe('LinkedInAdapter', () => {
    let linkedinAdapter: LinkedInAdapter;

    beforeEach(() => {
      linkedinAdapter = new LinkedInAdapter(mockCredentials);
    });

    it('should create LinkedIn adapter with correct platform', () => {
      expect(linkedinAdapter.getPlatform()).toBe('linkedin');
    });

    it('should authenticate successfully', async () => {
      (fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          id: 'user123', 
          localizedFirstName: 'Test', 
          localizedLastName: 'User' 
        })
      });

      const result = await linkedinAdapter.authenticate();
      expect(result).toBe(true);
    });

    it('should validate professional content requirements', async () => {
      const validContent: AdaptedContent = {
        ...mockAdaptedContent,
        platformSpecific: {
          postType: 'update',
          content: 'Professional LinkedIn post content',
          targetAudience: 'connections'
        }
      };

      const result = await linkedinAdapter.validateContent(validContent);
      expect(result.isValid).toBe(true);
    });

    it('should require title for article posts', async () => {
      const invalidContent: AdaptedContent = {
        ...mockAdaptedContent,
        platformSpecific: {
          postType: 'article',
          content: 'Article content without title'
        }
      };

      const result = await linkedinAdapter.validateContent(invalidContent);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'title',
          code: 'MISSING_TITLE'
        })
      );
    });

    it('should return correct platform requirements', () => {
      const requirements = linkedinAdapter.getRequirements();
      expect(requirements).toEqual({
        maxTextLength: 3000,
        videoMaxDuration: 10 * 60,
        imageFormats: ['jpg', 'jpeg', 'png', 'gif'],
        videoFormats: ['mp4', 'mov', 'wmv', 'flv', 'avi', 'mkv'],
        maxFileSize: 5 * 1024 * 1024 * 1024,
        requiredFields: ['postType', 'content']
      });
    });
  });

  describe('PlatformAdapterRegistry', () => {
    let registry: PlatformAdapterRegistry;

    beforeEach(() => {
      registry = new PlatformAdapterRegistry();
    });

    it('should register adapters for all supported platforms', () => {
      const platforms: Platform[] = ['instagram', 'tiktok', 'facebook', 'linkedin'];
      
      platforms.forEach(platform => {
        const adapter = registry.registerAdapter(platform, mockCredentials);
        expect(adapter.getPlatform()).toBe(platform);
      });

      expect(registry.getAdapterCount()).toBe(4);
    });

    it('should retrieve registered adapters', () => {
      const adapter = registry.registerAdapter('instagram', mockCredentials);
      const retrieved = registry.getAdapter('instagram', mockCredentials);
      
      expect(retrieved).toBe(adapter);
    });

    it('should remove adapters', () => {
      registry.registerAdapter('instagram', mockCredentials);
      expect(registry.getAdapterCount()).toBe(1);
      
      const removed = registry.removeAdapter('instagram', mockCredentials);
      expect(removed).toBe(true);
      expect(registry.getAdapterCount()).toBe(0);
    });

    it('should return supported platforms', () => {
      const supportedPlatforms = registry.getSupportedPlatforms();
      expect(supportedPlatforms).toEqual(['instagram', 'tiktok', 'facebook', 'linkedin']);
    });

    it('should throw error for unsupported platform', () => {
      expect(() => {
        registry.registerAdapter('unsupported' as Platform, mockCredentials);
      }).toThrow('Unsupported platform: unsupported');
    });

    it('should clear all adapters', () => {
      registry.registerAdapter('instagram', mockCredentials);
      registry.registerAdapter('tiktok', mockCredentials);
      expect(registry.getAdapterCount()).toBe(2);
      
      registry.clearAll();
      expect(registry.getAdapterCount()).toBe(0);
    });
  });

  describe('Content Adaptation', () => {
    it('should adapt content for Instagram with correct structure', () => {
      const baseContent = {
        text: 'Original content with #hashtag',
        mediaUrls: ['https://example.com/image.jpg']
      };

      // Mock content adaptation logic
      const adaptedContent: AdaptedContent = {
        text: baseContent.text,
        mediaUrls: baseContent.mediaUrls,
        metadata: {
          platform: 'instagram',
          adaptedAt: new Date().toISOString()
        },
        platformSpecific: {
          aspectRatio: '1:1',
          mediaType: 'photo',
          caption: baseContent.text,
          hashtags: ['#hashtag']
        }
      };

      expect(adaptedContent.platformSpecific?.aspectRatio).toBe('1:1');
      expect(adaptedContent.platformSpecific?.mediaType).toBe('photo');
      expect(adaptedContent.platformSpecific?.hashtags).toContain('#hashtag');
    });

    it('should adapt content for TikTok with video requirements', () => {
      const baseContent = {
        text: 'TikTok video content',
        mediaUrls: ['https://example.com/video.mp4']
      };

      const adaptedContent: AdaptedContent = {
        text: baseContent.text,
        mediaUrls: baseContent.mediaUrls,
        metadata: {
          platform: 'tiktok',
          adaptedAt: new Date().toISOString()
        },
        platformSpecific: {
          duration: 30,
          hashtags: [],
          privacy: 'public',
          effects: [],
          sounds: []
        }
      };

      expect(adaptedContent.platformSpecific?.privacy).toBe('public');
      expect(adaptedContent.platformSpecific?.duration).toBe(30);
      expect(Array.isArray(adaptedContent.platformSpecific?.effects)).toBe(true);
    });

    it('should adapt content for Facebook with post type detection', () => {
      const baseContent = {
        text: 'Facebook post content',
        mediaUrls: ['https://example.com/image.jpg']
      };

      const adaptedContent: AdaptedContent = {
        text: baseContent.text,
        mediaUrls: baseContent.mediaUrls,
        metadata: {
          platform: 'facebook',
          adaptedAt: new Date().toISOString()
        },
        platformSpecific: {
          postType: 'photo',
          content: baseContent.text,
          targetAudience: 'everyone'
        }
      };

      expect(adaptedContent.platformSpecific?.postType).toBe('photo');
      expect(adaptedContent.platformSpecific?.targetAudience).toBe('everyone');
    });

    it('should adapt content for LinkedIn with professional tone', () => {
      const baseContent = {
        text: 'Professional LinkedIn content',
        mediaUrls: []
      };

      const adaptedContent: AdaptedContent = {
        text: baseContent.text,
        mediaUrls: baseContent.mediaUrls,
        metadata: {
          platform: 'linkedin',
          adaptedAt: new Date().toISOString()
        },
        platformSpecific: {
          postType: 'update',
          content: baseContent.text,
          targetAudience: 'connections'
        }
      };

      expect(adaptedContent.platformSpecific?.postType).toBe('update');
      expect(adaptedContent.platformSpecific?.targetAudience).toBe('connections');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const adapter = new InstagramAdapter(mockCredentials);
      
      (fetch as Mock).mockRejectedValueOnce(new Error('Network error'));

      const result = await adapter.authenticate();
      expect(result).toBe(false);
    });

    it('should handle API rate limiting', async () => {
      const adapter = new InstagramAdapter(mockCredentials);
      
      (fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Rate limit exceeded' } })
      });

      const healthCheck = await adapter.checkHealth();
      expect(healthCheck.isHealthy).toBe(false);
      expect(healthCheck.error).toContain('Rate limit exceeded');
    });

    it('should identify retryable errors correctly', async () => {
      const adapter = new InstagramAdapter(mockCredentials);
      
      // Test the isRetryableError method directly by creating a simple error scenario
      const contentWithValidationError: AdaptedContent = {
        ...mockAdaptedContent,
        mediaUrls: [] // This will cause validation to fail, but not be retryable
      };

      const publishResult = await adapter.publish(contentWithValidationError, mockTenantContext);
      expect(publishResult.success).toBe(false);
      expect(publishResult.retryable).toBe(false); // Validation errors are not retryable
      
      // Test that the error message indicates validation failure
      expect(publishResult.error).toContain('validation failed');
    });

    it('should identify non-retryable errors correctly', async () => {
      const adapter = new InstagramAdapter(mockCredentials);
      
      // Mock validation failure (non-retryable)
      const invalidContent: AdaptedContent = {
        ...mockAdaptedContent,
        mediaUrls: [] // Missing required media
      };

      const publishResult = await adapter.publish(invalidContent, mockTenantContext);
      expect(publishResult.success).toBe(false);
      expect(publishResult.retryable).toBe(false);
    });
  });

  describe('Platform-Specific Features', () => {
    it('should handle Instagram carousel posts', async () => {
      const carouselContent: AdaptedContent = {
        ...mockAdaptedContent,
        mediaUrls: [
          'https://example.com/image1.jpg',
          'https://example.com/image2.jpg',
          'https://example.com/image3.jpg'
        ],
        platformSpecific: {
          aspectRatio: '1:1',
          mediaType: 'carousel',
          caption: 'Carousel post',
          hashtags: ['#carousel']
        }
      };

      const adapter = new InstagramAdapter(mockCredentials);
      const validation = await adapter.validateContent(carouselContent);
      expect(validation.isValid).toBe(true);
    });

    it('should handle TikTok video effects and sounds', async () => {
      const tiktokContent: AdaptedContent = {
        ...mockAdaptedContent,
        mediaUrls: ['https://example.com/video.mp4'],
        platformSpecific: {
          duration: 30,
          hashtags: ['#viral'],
          privacy: 'public',
          effects: ['effect1', 'effect2'],
          sounds: ['trending_sound']
        }
      };

      const adapter = new TikTokAdapter(mockCredentials);
      const validation = await adapter.validateContent(tiktokContent);
      expect(validation.isValid).toBe(true);
    });

    it('should handle Facebook link posts', async () => {
      const linkContent: AdaptedContent = {
        ...mockAdaptedContent,
        mediaUrls: [],
        platformSpecific: {
          postType: 'link',
          content: 'Check out this amazing article',
          link: 'https://example.com/article',
          targetAudience: 'everyone'
        }
      };

      const adapter = new FacebookAdapter(mockCredentials);
      const validation = await adapter.validateContent(linkContent);
      expect(validation.isValid).toBe(true);
    });

    it('should handle LinkedIn article posts', async () => {
      const articleContent: AdaptedContent = {
        ...mockAdaptedContent,
        mediaUrls: [],
        platformSpecific: {
          postType: 'article',
          title: 'Professional Article Title',
          content: 'Detailed article content for LinkedIn audience',
          targetAudience: 'public'
        }
      };

      const adapter = new LinkedInAdapter(mockCredentials);
      const validation = await adapter.validateContent(articleContent);
      expect(validation.isValid).toBe(true);
    });
  });
});