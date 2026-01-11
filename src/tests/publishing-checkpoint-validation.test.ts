import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PublisherService } from '../services/publishing/publisher-service.js';
import { PlatformAdapterRegistry } from '../services/publishing/platform-registry.js';
import { InstagramAdapter } from '../services/publishing/instagram-adapter.js';
import { FacebookAdapter } from '../services/publishing/facebook-adapter.js';
import { TikTokAdapter } from '../services/publishing/tiktok-adapter.js';
import { LinkedInAdapter } from '../services/publishing/linkedin-adapter.js';
import { 
  Platform, 
  TenantContext, 
  User, 
  Tenant 
} from '../types/index.js';
import { PlatformCredentials } from '../services/publishing/platform-adapter.js';
import { DatabasePool } from '../interfaces/database.js';

describe('Publishing System Checkpoint Validation', () => {
  let mockDb: DatabasePool;
  let publisherService: PublisherService;
  let mockTenantContext: TenantContext;
  let mockCredentials: PlatformCredentials;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mock database
    mockDb = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 })
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
  });

  describe('Core Publishing Infrastructure', () => {
    it('should support all required social media platforms', () => {
      const supportedPlatforms = publisherService.getSupportedPlatforms();
      
      // Verify all required platforms are supported
      expect(supportedPlatforms).toContain('instagram');
      expect(supportedPlatforms).toContain('facebook');
      expect(supportedPlatforms).toContain('tiktok');
      expect(supportedPlatforms).toContain('linkedin');
      expect(supportedPlatforms).toHaveLength(4);
    });

    it('should provide platform requirements for all supported platforms', () => {
      const platforms: Platform[] = ['instagram', 'facebook', 'tiktok', 'linkedin'];
      
      platforms.forEach(platform => {
        const requirements = publisherService.getPlatformRequirements(platform);
        
        expect(requirements).toBeDefined();
        expect(requirements!.maxTextLength).toBeGreaterThan(0);
        expect(requirements!.requiredFields).toBeDefined();
        expect(Array.isArray(requirements!.requiredFields)).toBe(true);
        
        // Platform-specific validations
        switch (platform) {
          case 'instagram':
            expect(requirements!.maxTextLength).toBe(2200);
            expect(requirements!.hashtagLimit).toBe(30);
            expect(requirements!.requiredFields).toContain('mediaUrls');
            expect(requirements!.requiredFields).toContain('mediaType');
            break;
          case 'facebook':
            expect(requirements!.maxTextLength).toBe(63206);
            expect(requirements!.requiredFields).toContain('postType');
            expect(requirements!.requiredFields).toContain('content');
            break;
          case 'tiktok':
            expect(requirements!.maxTextLength).toBe(2200);
            expect(requirements!.hashtagLimit).toBe(20);
            expect(requirements!.videoMaxDuration).toBe(180);
            expect(requirements!.requiredFields).toContain('mediaUrls');
            expect(requirements!.requiredFields).toContain('privacy');
            break;
          case 'linkedin':
            expect(requirements!.maxTextLength).toBe(3000);
            expect(requirements!.videoMaxDuration).toBe(600);
            expect(requirements!.requiredFields).toContain('postType');
            expect(requirements!.requiredFields).toContain('content');
            break;
        }
      });
    });

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

    it('should handle unsupported platforms gracefully', () => {
      const unsupportedPlatform = 'unsupported' as Platform;
      const requirements = publisherService.getPlatformRequirements(unsupportedPlatform);
      
      expect(requirements).toBeUndefined();
    });
  });

  describe('Platform Adapter Registry', () => {
    it('should register and manage platform adapters correctly', () => {
      const registry = new PlatformAdapterRegistry();
      
      // Test adapter registration
      const instagramAdapter = registry.registerAdapter('instagram', mockCredentials);
      const facebookAdapter = registry.registerAdapter('facebook', mockCredentials);
      const tiktokAdapter = registry.registerAdapter('tiktok', mockCredentials);
      const linkedinAdapter = registry.registerAdapter('linkedin', mockCredentials);
      
      // Verify correct adapter types
      expect(instagramAdapter).toBeInstanceOf(InstagramAdapter);
      expect(facebookAdapter).toBeInstanceOf(FacebookAdapter);
      expect(tiktokAdapter).toBeInstanceOf(TikTokAdapter);
      expect(linkedinAdapter).toBeInstanceOf(LinkedInAdapter);
      
      // Verify adapter count
      expect(registry.getAdapterCount()).toBe(4);
      
      // Test adapter retrieval
      const retrievedInstagram = registry.getAdapter('instagram', mockCredentials);
      expect(retrievedInstagram).toBe(instagramAdapter);
      
      // Test adapter removal
      const removed = registry.removeAdapter('instagram', mockCredentials);
      expect(removed).toBe(true);
      expect(registry.getAdapterCount()).toBe(3);
      
      // Test clearing all adapters
      registry.clearAll();
      expect(registry.getAdapterCount()).toBe(0);
    });

    it('should return correct supported platforms', () => {
      const registry = new PlatformAdapterRegistry();
      const supportedPlatforms = registry.getSupportedPlatforms();
      
      expect(supportedPlatforms).toEqual(['instagram', 'tiktok', 'facebook', 'linkedin']);
    });

    it('should throw error for unsupported platform registration', () => {
      const registry = new PlatformAdapterRegistry();
      
      expect(() => {
        registry.registerAdapter('unsupported' as Platform, mockCredentials);
      }).toThrow('Unsupported platform: unsupported');
    });
  });

  describe('Platform Adapter Functionality', () => {
    it('should create Instagram adapter with correct configuration', () => {
      const adapter = new InstagramAdapter(mockCredentials);
      
      expect(adapter.getPlatform()).toBe('instagram');
      
      const requirements = adapter.getRequirements();
      expect(requirements.maxTextLength).toBe(2200);
      expect(requirements.hashtagLimit).toBe(30);
      expect(requirements.videoMaxDuration).toBe(60);
      expect(requirements.aspectRatios).toEqual(['1:1', '4:5', '9:16']);
    });

    it('should create Facebook adapter with correct configuration', () => {
      const adapter = new FacebookAdapter(mockCredentials);
      
      expect(adapter.getPlatform()).toBe('facebook');
      
      const requirements = adapter.getRequirements();
      expect(requirements.maxTextLength).toBe(63206);
      expect(requirements.videoMaxDuration).toBe(240 * 60);
      expect(requirements.maxFileSize).toBe(4 * 1024 * 1024 * 1024);
    });

    it('should create TikTok adapter with correct configuration', () => {
      const adapter = new TikTokAdapter(mockCredentials);
      
      expect(adapter.getPlatform()).toBe('tiktok');
      
      const requirements = adapter.getRequirements();
      expect(requirements.maxTextLength).toBe(2200);
      expect(requirements.hashtagLimit).toBe(20);
      expect(requirements.videoMaxDuration).toBe(180);
      expect(requirements.maxFileSize).toBe(500 * 1024 * 1024);
    });

    it('should create LinkedIn adapter with correct configuration', () => {
      const adapter = new LinkedInAdapter(mockCredentials);
      
      expect(adapter.getPlatform()).toBe('linkedin');
      
      const requirements = adapter.getRequirements();
      expect(requirements.maxTextLength).toBe(3000);
      expect(requirements.videoMaxDuration).toBe(10 * 60);
      expect(requirements.maxFileSize).toBe(5 * 1024 * 1024 * 1024);
    });
  });

  describe('Content Validation Framework', () => {
    it('should validate text length limits for each platform', () => {
      const platforms: Platform[] = ['instagram', 'facebook', 'tiktok', 'linkedin'];
      
      platforms.forEach(platform => {
        const requirements = publisherService.getPlatformRequirements(platform);
        expect(requirements!.maxTextLength).toBeGreaterThan(0);
        
        // Verify platform-specific limits
        switch (platform) {
          case 'instagram':
            expect(requirements!.maxTextLength).toBe(2200);
            break;
          case 'facebook':
            expect(requirements!.maxTextLength).toBe(63206);
            break;
          case 'tiktok':
            expect(requirements!.maxTextLength).toBe(2200);
            break;
          case 'linkedin':
            expect(requirements!.maxTextLength).toBe(3000);
            break;
        }
      });
    });

    it('should validate hashtag limits for platforms that support them', () => {
      const instagramReqs = publisherService.getPlatformRequirements('instagram');
      const tiktokReqs = publisherService.getPlatformRequirements('tiktok');
      
      expect(instagramReqs!.hashtagLimit).toBe(30);
      expect(tiktokReqs!.hashtagLimit).toBe(20);
    });

    it('should validate video duration limits for video platforms', () => {
      const instagramReqs = publisherService.getPlatformRequirements('instagram');
      const tiktokReqs = publisherService.getPlatformRequirements('tiktok');
      const facebookReqs = publisherService.getPlatformRequirements('facebook');
      const linkedinReqs = publisherService.getPlatformRequirements('linkedin');
      
      expect(instagramReqs!.videoMaxDuration).toBe(60);
      expect(tiktokReqs!.videoMaxDuration).toBe(180);
      expect(facebookReqs!.videoMaxDuration).toBe(240 * 60);
      expect(linkedinReqs!.videoMaxDuration).toBe(10 * 60);
    });

    it('should validate required fields for each platform', () => {
      const instagramReqs = publisherService.getPlatformRequirements('instagram');
      const facebookReqs = publisherService.getPlatformRequirements('facebook');
      const tiktokReqs = publisherService.getPlatformRequirements('tiktok');
      const linkedinReqs = publisherService.getPlatformRequirements('linkedin');
      
      expect(instagramReqs!.requiredFields).toContain('mediaUrls');
      expect(instagramReqs!.requiredFields).toContain('mediaType');
      
      expect(facebookReqs!.requiredFields).toContain('postType');
      expect(facebookReqs!.requiredFields).toContain('content');
      
      expect(tiktokReqs!.requiredFields).toContain('mediaUrls');
      expect(tiktokReqs!.requiredFields).toContain('privacy');
      
      expect(linkedinReqs!.requiredFields).toContain('postType');
      expect(linkedinReqs!.requiredFields).toContain('content');
    });
  });

  describe('Database Integration', () => {
    it('should store platform credentials in database', async () => {
      await publisherService.registerPlatformCredentials('instagram', mockCredentials, mockTenantContext);
      
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO platform_credentials'),
        expect.any(Array)
      );
    });

    it('should handle database errors gracefully', async () => {
      // Mock database error
      (mockDb.query as vi.Mock).mockRejectedValueOnce(new Error('Database connection failed'));
      
      await expect(
        publisherService.registerPlatformCredentials('instagram', mockCredentials, mockTenantContext)
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('System Integration Readiness', () => {
    it('should have all required components for publishing flow', () => {
      // Verify PublisherService has all required methods
      expect(typeof publisherService.registerPlatformCredentials).toBe('function');
      expect(typeof publisherService.publishContent).toBe('function');
      expect(typeof publisherService.adaptContentForPlatforms).toBe('function');
      expect(typeof publisherService.validatePlatformRequirements).toBe('function');
      expect(typeof publisherService.getSupportedPlatforms).toBe('function');
      expect(typeof publisherService.getPlatformRequirements).toBe('function');
    });

    it('should support multi-platform publishing architecture', () => {
      const supportedPlatforms = publisherService.getSupportedPlatforms();
      
      // Verify we can handle multiple platforms simultaneously
      expect(supportedPlatforms.length).toBeGreaterThan(1);
      
      // Verify each platform has unique requirements
      const requirements = supportedPlatforms.map(platform => 
        publisherService.getPlatformRequirements(platform)
      );
      
      // Each platform should have different text length limits (proving they're unique)
      const textLimits = requirements.map(req => req!.maxTextLength);
      const uniqueLimits = new Set(textLimits);
      expect(uniqueLimits.size).toBeGreaterThan(1);
    });

    it('should be ready for workflow integration', () => {
      // Verify the service can be instantiated with database
      expect(publisherService).toBeDefined();
      expect(publisherService.getSupportedPlatforms()).toBeDefined();
      
      // Verify platform adapters can be created
      const registry = new PlatformAdapterRegistry();
      const platforms: Platform[] = ['instagram', 'facebook', 'tiktok', 'linkedin'];
      
      platforms.forEach(platform => {
        const adapter = registry.registerAdapter(platform, mockCredentials);
        expect(adapter).toBeDefined();
        expect(adapter.getPlatform()).toBe(platform);
      });
    });
  });
});