import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { DatabasePool } from '../interfaces/database.js';
import { ContentService } from '../services/content.js';
import { WorkflowEngine } from '../services/workflow.js';
import { PublisherService } from '../services/publishing/publisher-service.js';
import { ContentGenerationService } from '../services/content-generation.js';
import { BriefingService } from '../services/briefing.js';
import { 
  Content, 
  ContentData, 
  AdaptedContent, 
  Platform, 
  TenantContext, 
  User, 
  Tenant, 
  WorkflowState,
  Briefing,
  BriefingTemplate
} from '../types/index.js';
import { PlatformCredentials } from '../services/publishing/platform-adapter.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('End-to-End Publishing Flow Integration Test', () => {
  let mockDb: DatabasePool;
  let contentService: ContentService;
  let workflowEngine: WorkflowEngine;
  let publisherService: PublisherService;
  let contentGenerationService: ContentGenerationService;
  let briefingService: BriefingService;
  let mockTenantContext: TenantContext;
  let mockBriefing: Briefing;
  let mockCredentials: PlatformCredentials;

  // Mock database responses
  const mockDbResponses = new Map<string, any>();

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mock database
    mockDb = {
      query: vi.fn().mockImplementation((query: string, params?: any[]) => {
        // Return appropriate mock responses based on query patterns
        if (query.includes('INSERT INTO content')) {
          return { rows: [], rowCount: 1 };
        }
        if (query.includes('INSERT INTO workflows')) {
          return { rows: [], rowCount: 1 };
        }
        if (query.includes('INSERT INTO workflow_events')) {
          return { rows: [], rowCount: 1 };
        }
        if (query.includes('INSERT INTO briefings')) {
          return { rows: [], rowCount: 1 };
        }
        if (query.includes('SELECT') && query.includes('briefings')) {
          return {
            rows: [{
              id: 'briefing-123',
              title: 'Test Briefing',
              type: 'internal',
              template_id: 'template-123',
              fields: JSON.stringify({
                objective: 'Increase brand awareness',
                target_audience: 'Young professionals',
                key_message: 'Innovation and quality'
              }),
              version: 1,
              status: 'active',
              tenant_id: 'tenant-123',
              client_id: 'client-123',
              created_by: 'user-123',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }]
          };
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
        if (query.includes('SELECT') && query.includes('workflows')) {
          return {
            rows: [{
              id: 'workflow-123',
              content_id: 'content-123',
              current_state: 'publish',
              tenant_id: 'tenant-123',
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
        if (query.includes('SELECT') && query.includes('approvals')) {
          return {
            rows: [{
              id: 'approval-123',
              workflow_id: 'workflow-123',
              requested_by: 'user-123',
              approvers: JSON.stringify(['approver-123']),
              required_approvals: 1,
              status: 'approved',
              requested_at: new Date().toISOString(),
              completed_at: new Date().toISOString(),
              response_id: 'response-123',
              response_user_id: 'approver-123',
              decision: 'approved',
              response_comment: 'Looks good!',
              response_created_at: new Date().toISOString()
            }]
          };
        }
        if (query.includes('UPDATE workflows')) {
          return { rows: [], rowCount: 1 };
        }
        if (query.includes('INSERT INTO publish_jobs')) {
          return { rows: [], rowCount: 1 };
        }
        
        return { rows: [], rowCount: 0 };
      })
    } as DatabasePool;

    // Setup services
    contentService = new ContentService(mockDb);
    workflowEngine = new WorkflowEngine(mockDb);
    publisherService = new PublisherService(mockDb);
    contentGenerationService = new ContentGenerationService(mockDb);
    briefingService = new BriefingService(mockDb);

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
      permissions: [
        { name: 'workflow:transition', resource: 'workflow' },
        { name: 'workflow:publish', resource: 'workflow' },
        { name: 'content:create', resource: 'content' },
        { name: 'content:publish', resource: 'content' }
      ]
    };

    // Setup mock briefing
    mockBriefing = {
      id: 'briefing-123',
      title: 'Test Briefing',
      type: 'internal',
      templateId: 'template-123',
      fields: {
        objective: 'Increase brand awareness',
        target_audience: 'Young professionals',
        key_message: 'Innovation and quality'
      },
      version: 1,
      status: 'active',
      tenantId: 'tenant-123',
      clientId: 'client-123',
      createdBy: 'user-123',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Setup mock platform credentials
    mockCredentials = {
      accessToken: 'mock_access_token',
      refreshToken: 'mock_refresh_token',
      appId: 'mock_app_id',
      appSecret: 'mock_app_secret'
    };

    // Mock successful API responses for all platforms
    (fetch as Mock).mockImplementation((url: string, options?: any) => {
      if (url.includes('graph.facebook.com')) {
        // Instagram/Facebook API responses
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
      
      if (url.includes('open-api.tiktok.com')) {
        // TikTok API responses
        if (url.includes('/user/info')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              data: { user: { open_id: 'user123', display_name: 'Test User' } }
            })
          });
        }
        if (url.includes('/video/init')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              data: { video: { video_id: 'video123', upload_url: 'https://upload.tiktok.com' } }
            })
          });
        }
        if (url.includes('/video/')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              data: { video_id: 'video123', share_id: 'share123' }
            })
          });
        }
      }
      
      if (url.includes('api.linkedin.com')) {
        // LinkedIn API responses
        if (url.includes('/people/~')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ id: 'user123', localizedFirstName: 'Test', localizedLastName: 'User' })
          });
        }
        if (url.includes('/ugcPosts')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ id: 'post123', activity: 'activity123' })
          });
        }
        if (url.includes('/assets')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              value: {
                uploadMechanism: {
                  'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': {
                    uploadUrl: 'https://upload.linkedin.com',
                    headers: {}
                  }
                },
                asset: 'asset123'
              }
            })
          });
        }
      }

      // Default mock for file uploads and other requests
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024))
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Complete Publishing Flow', () => {
    it('should successfully execute end-to-end content creation and publishing flow', async () => {
      // Step 1: Create content with briefing association
      const contentData: Omit<Content, 'id' | 'workflowId' | 'createdAt' | 'updatedAt'> = {
        briefingId: mockBriefing.id,
        title: 'Test Social Media Post',
        description: 'A test post for validating the publishing system',
        contentType: 'text',
        baseContent: {
          text: 'This is a test social media post to validate our publishing system works correctly.',
          metadata: {
            generatedAt: new Date().toISOString(),
            contentType: 'text'
          }
        },
        adaptedContent: {
          instagram: {
            text: 'This is a test social media post to validate our publishing system works correctly.',
            mediaUrls: ['https://example.com/test-image.jpg'],
            metadata: {
              platform: 'instagram',
              adaptedAt: new Date().toISOString()
            },
            platformSpecific: {
              aspectRatio: '1:1',
              mediaType: 'photo',
              caption: 'This is a test social media post to validate our publishing system works correctly.',
              hashtags: ['#test', '#publishing', '#socialmedia']
            }
          },
          facebook: {
            text: 'This is a test social media post to validate our publishing system works correctly.',
            mediaUrls: ['https://example.com/test-image.jpg'],
            metadata: {
              platform: 'facebook',
              adaptedAt: new Date().toISOString()
            },
            platformSpecific: {
              postType: 'photo',
              content: 'This is a test social media post to validate our publishing system works correctly.',
              targetAudience: 'everyone'
            }
          }
        },
        tenantId: mockTenantContext.tenantId,
        clientId: 'client-123',
        createdBy: mockTenantContext.user.id
      };

      const createdContent = await contentService.createContent(contentData, mockTenantContext);
      
      expect(createdContent).toBeDefined();
      expect(createdContent.id).toBeDefined();
      expect(createdContent.workflowId).toBeDefined();
      expect(createdContent.briefingId).toBe(mockBriefing.id);

      // Step 2: Progress workflow through required states
      const workflow = await workflowEngine.getWorkflow(createdContent.workflowId, mockTenantContext);
      expect(workflow).toBeDefined();
      expect(workflow!.currentState).toBe(WorkflowState.RESEARCH);

      // Transition through workflow states
      await workflowEngine.transitionState(workflow!.id, WorkflowState.PLANNING, mockTenantContext, 'Moving to planning');
      await workflowEngine.transitionState(workflow!.id, WorkflowState.CONTENT, mockTenantContext, 'Content creation');
      await workflowEngine.transitionState(workflow!.id, WorkflowState.CREATIVE, mockTenantContext, 'Creative review');
      await workflowEngine.transitionState(workflow!.id, WorkflowState.BRAND_APPLY, mockTenantContext, 'Brand application');
      await workflowEngine.transitionState(workflow!.id, WorkflowState.COMPLIANCE_CHECK, mockTenantContext, 'Compliance check');
      await workflowEngine.transitionState(workflow!.id, WorkflowState.APPROVAL, mockTenantContext, 'Ready for approval');

      // Step 3: Request and provide approval
      const approval = await workflowEngine.requestApproval(
        workflow!.id,
        ['approver-123'],
        mockTenantContext,
        1
      );
      expect(approval).toBeDefined();

      const approvalResponse = await workflowEngine.respondToApproval(
        approval.id,
        'approved',
        mockTenantContext,
        'Content looks great!'
      );
      expect(approvalResponse.decision).toBe('approved');

      // Step 4: Transition to publish state (should succeed with approval)
      await workflowEngine.transitionState(workflow!.id, WorkflowState.PUBLISH, mockTenantContext, 'Publishing approved content');

      // Step 5: Register platform credentials
      await publisherService.registerPlatformCredentials('instagram', mockCredentials, mockTenantContext);
      await publisherService.registerPlatformCredentials('facebook', mockCredentials, mockTenantContext);

      // Step 6: Publish content to multiple platforms
      const publishRequest = {
        contentId: createdContent.id,
        platforms: ['instagram', 'facebook'] as Platform[],
        scheduledAt: new Date()
      };

      const publishResults = await publisherService.publishContent(publishRequest, mockTenantContext);
      
      expect(publishResults).toHaveLength(2);
      
      // Verify Instagram publish result
      const instagramResult = publishResults.find(r => r.platform === 'instagram');
      expect(instagramResult).toBeDefined();
      expect(instagramResult!.status).toBe('success');
      expect(instagramResult!.result?.success).toBe(true);
      expect(instagramResult!.result?.platformPostId).toBeDefined();

      // Verify Facebook publish result
      const facebookResult = publishResults.find(r => r.platform === 'facebook');
      expect(facebookResult).toBeDefined();
      expect(facebookResult!.status).toBe('success');
      expect(facebookResult!.result?.success).toBe(true);
      expect(facebookResult!.result?.platformPostId).toBeDefined();

      // Step 7: Verify workflow transition to monitor state
      await workflowEngine.transitionState(workflow!.id, WorkflowState.MONITOR, mockTenantContext, 'Content published successfully');

      const finalWorkflow = await workflowEngine.getWorkflow(workflow!.id, mockTenantContext);
      expect(finalWorkflow!.currentState).toBe(WorkflowState.MONITOR);

      // Verify all database interactions occurred
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO content'),
        expect.any(Array)
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO workflows'),
        expect.any(Array)
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO publish_jobs'),
        expect.any(Array)
      );
    });

    it('should handle publishing failures gracefully', async () => {
      // Mock API failure for Instagram
      (fetch as Mock).mockImplementation((url: string) => {
        if (url.includes('graph.facebook.com') && url.includes('/media')) {
          return Promise.resolve({
            ok: false,
            status: 400,
            json: () => Promise.resolve({
              error: { message: 'Invalid media format' }
            })
          });
        }
        // Facebook should succeed
        if (url.includes('graph.facebook.com')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ id: 'post123', post_id: 'post123' })
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      // Register credentials
      await publisherService.registerPlatformCredentials('instagram', mockCredentials, mockTenantContext);
      await publisherService.registerPlatformCredentials('facebook', mockCredentials, mockTenantContext);

      // Attempt to publish
      const publishRequest = {
        contentId: 'content-123',
        platforms: ['instagram', 'facebook'] as Platform[]
      };

      const publishResults = await publisherService.publishContent(publishRequest, mockTenantContext);
      
      expect(publishResults).toHaveLength(2);
      
      // Instagram should fail
      const instagramResult = publishResults.find(r => r.platform === 'instagram');
      expect(instagramResult!.status).toBe('failed');
      expect(instagramResult!.error).toContain('Invalid media format');

      // Facebook should succeed
      const facebookResult = publishResults.find(r => r.platform === 'facebook');
      expect(facebookResult!.status).toBe('success');
    });

    it('should validate content requirements before publishing', async () => {
      // Create content with invalid Instagram requirements
      const invalidContent: Content = {
        id: 'content-invalid',
        briefingId: 'briefing-123',
        title: 'Invalid Content',
        description: 'Content that violates platform requirements',
        contentType: 'text',
        baseContent: {
          text: 'Test content',
          metadata: { generatedAt: new Date().toISOString() }
        },
        adaptedContent: {
          instagram: {
            text: 'Test content',
            mediaUrls: [], // Missing required media for Instagram
            metadata: { platform: 'instagram', adaptedAt: new Date().toISOString() },
            platformSpecific: {
              aspectRatio: '1:1',
              mediaType: 'photo',
              caption: 'Test content',
              hashtags: Array.from({ length: 35 }, (_, i) => `#hashtag${i}`) // Too many hashtags
            }
          }
        },
        workflowId: 'workflow-123',
        tenantId: 'tenant-123',
        clientId: 'client-123',
        createdBy: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock database to return invalid content
      (mockDb.query as Mock).mockImplementation((query: string) => {
        if (query.includes('SELECT') && query.includes('content')) {
          return {
            rows: [{
              id: invalidContent.id,
              briefing_id: invalidContent.briefingId,
              title: invalidContent.title,
              description: invalidContent.description,
              content_type: invalidContent.contentType,
              base_content: JSON.stringify(invalidContent.baseContent),
              adapted_content: JSON.stringify(invalidContent.adaptedContent),
              workflow_id: invalidContent.workflowId,
              tenant_id: invalidContent.tenantId,
              client_id: invalidContent.clientId,
              created_by: invalidContent.createdBy,
              created_at: invalidContent.createdAt.toISOString(),
              updated_at: invalidContent.updatedAt.toISOString()
            }]
          };
        }
        return { rows: [], rowCount: 0 };
      });

      await publisherService.registerPlatformCredentials('instagram', mockCredentials, mockTenantContext);

      const publishRequest = {
        contentId: invalidContent.id,
        platforms: ['instagram'] as Platform[]
      };

      const publishResults = await publisherService.publishContent(publishRequest, mockTenantContext);
      
      expect(publishResults).toHaveLength(1);
      expect(publishResults[0].status).toBe('failed');
      expect(publishResults[0].error).toContain('validation failed');
    });

    it('should prevent publishing without required approvals', async () => {
      // Mock workflow without approvals
      (mockDb.query as Mock).mockImplementation((query: string) => {
        if (query.includes('SELECT') && query.includes('workflows')) {
          return {
            rows: [{
              current_state: 'approval',
              tenant_id: 'tenant-123'
            }]
          };
        }
        if (query.includes('SELECT') && query.includes('approvals')) {
          return { rows: [] }; // No approvals
        }
        return { rows: [], rowCount: 0 };
      });

      try {
        await workflowEngine.transitionState('workflow-123', WorkflowState.PUBLISH, mockTenantContext);
        expect.fail('Should have thrown error for missing approvals');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('required approvals');
      }
    });

    it('should handle platform adapter health checks', async () => {
      await publisherService.registerPlatformCredentials('instagram', mockCredentials, mockTenantContext);
      
      const supportedPlatforms = publisherService.getSupportedPlatforms();
      expect(supportedPlatforms).toContain('instagram');
      expect(supportedPlatforms).toContain('facebook');
      expect(supportedPlatforms).toContain('tiktok');
      expect(supportedPlatforms).toContain('linkedin');

      // Test platform requirements
      const instagramRequirements = publisherService.getPlatformRequirements('instagram');
      expect(instagramRequirements).toBeDefined();
      expect(instagramRequirements!.maxTextLength).toBe(2200);
      expect(instagramRequirements!.hashtagLimit).toBe(30);
      expect(instagramRequirements!.requiredFields).toContain('mediaUrls');
    });
  });

  describe('Content Adaptation Validation', () => {
    it('should properly adapt content for each platform', async () => {
      const baseContent: ContentData = {
        text: 'This is a test post with #hashtags and great content for social media marketing!',
        mediaUrls: ['https://example.com/image.jpg'],
        metadata: {
          generatedAt: new Date().toISOString(),
          contentType: 'text'
        }
      };

      // Test Instagram adaptation
      const instagramAdapted = await publisherService.adaptContentForPlatform(
        baseContent,
        'instagram',
        ['Professional tone', 'Engaging content'],
        ['Use relevant hashtags', 'Include call to action']
      );

      expect(instagramAdapted.platformSpecific?.aspectRatio).toBe('1:1');
      expect(instagramAdapted.platformSpecific?.mediaType).toBe('photo');
      expect(instagramAdapted.platformSpecific?.hashtags).toContain('#hashtags');

      // Test Facebook adaptation
      const facebookAdapted = await publisherService.adaptContentForPlatform(
        baseContent,
        'facebook',
        ['Professional tone'],
        ['Engaging content']
      );

      expect(facebookAdapted.platformSpecific?.postType).toBe('photo');
      expect(facebookAdapted.platformSpecific?.targetAudience).toBe('everyone');

      // Test LinkedIn adaptation
      const linkedinAdapted = await publisherService.adaptContentForPlatform(
        baseContent,
        'linkedin',
        ['Professional tone'],
        ['Business focused']
      );

      expect(linkedinAdapted.platformSpecific?.postType).toBe('update');
      expect(linkedinAdapted.platformSpecific?.targetAudience).toBe('connections');

      // Test TikTok adaptation
      const tiktokAdapted = await publisherService.adaptContentForPlatform(
        baseContent,
        'tiktok',
        ['Casual tone'],
        ['Trending hashtags']
      );

      expect(tiktokAdapted.platformSpecific?.privacy).toBe('public');
      expect(Array.isArray(tiktokAdapted.platformSpecific?.effects)).toBe(true);
    });

    it('should validate platform-specific requirements', async () => {
      const testContent: AdaptedContent = {
        text: 'Test content',
        mediaUrls: ['https://example.com/image.jpg'],
        metadata: { platform: 'instagram', adaptedAt: new Date().toISOString() },
        platformSpecific: {
          aspectRatio: '1:1',
          mediaType: 'photo',
          caption: 'Test content',
          hashtags: ['#test']
        }
      };

      // Valid content should pass validation
      const validationResult = await publisherService.validatePlatformRequirements(testContent, 'instagram');
      expect(validationResult.isValid).toBe(true);
      expect(validationResult.errors).toHaveLength(0);

      // Invalid content should fail validation
      const invalidContent: AdaptedContent = {
        ...testContent,
        mediaUrls: [], // Missing required media
        platformSpecific: {
          ...testContent.platformSpecific,
          hashtags: Array.from({ length: 35 }, (_, i) => `#tag${i}`) // Too many hashtags
        }
      };

      const invalidValidation = await publisherService.validatePlatformRequirements(invalidContent, 'instagram');
      expect(invalidValidation.isValid).toBe(false);
      expect(invalidValidation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle network timeouts with retry logic', async () => {
      let attemptCount = 0;
      (fetch as Mock).mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return Promise.reject(new Error('Network timeout'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'post123' })
        });
      });

      await publisherService.registerPlatformCredentials('instagram', mockCredentials, mockTenantContext);

      const publishRequest = {
        contentId: 'content-123',
        platforms: ['instagram'] as Platform[],
        retryPolicy: {
          maxRetries: 3,
          retryDelayMs: 100,
          backoffMultiplier: 1,
          retryableErrors: ['timeout', 'network']
        }
      };

      const publishResults = await publisherService.publishContent(publishRequest, mockTenantContext);
      
      expect(publishResults[0].status).toBe('success');
      expect(attemptCount).toBe(3); // Should have retried twice before succeeding
    });

    it('should handle rate limiting gracefully', async () => {
      (fetch as Mock).mockImplementation(() => {
        return Promise.resolve({
          ok: false,
          status: 429,
          json: () => Promise.resolve({
            error: { message: 'Rate limit exceeded' }
          })
        });
      });

      await publisherService.registerPlatformCredentials('instagram', mockCredentials, mockTenantContext);

      const publishRequest = {
        contentId: 'content-123',
        platforms: ['instagram'] as Platform[]
      };

      const publishResults = await publisherService.publishContent(publishRequest, mockTenantContext);
      
      expect(publishResults[0].status).toBe('failed');
      expect(publishResults[0].error).toContain('Rate limit exceeded');
    });
  });
});