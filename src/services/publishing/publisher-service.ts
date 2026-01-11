import { v4 as uuidv4 } from 'uuid';
import {
  Content,
  AdaptedContent,
  Platform,
  ValidationResult,
  ValidationError,
  TenantContext
} from '../../types/index.js';
import { DatabasePool, DatabaseClient } from '../../interfaces/database.js';
import { PlatformAdapterRegistry } from './platform-registry.js';
import { PlatformAdapter, PlatformCredentials, PublishResult, ContentRequirements } from './platform-adapter.js';

export interface PublishRequest {
  contentId: string;
  platforms: Platform[];
  scheduledAt?: Date;
  retryPolicy?: RetryPolicy;
}

export interface RetryPolicy {
  maxRetries: number;
  retryDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

export interface PublishJobResult {
  jobId: string;
  contentId: string;
  platform: Platform;
  status: 'pending' | 'success' | 'failed' | 'retrying';
  result?: PublishResult;
  error?: string;
  retryCount: number;
  scheduledAt?: Date;
  publishedAt?: Date;
  nextRetryAt?: Date;
}

export interface ContentAdaptationRequest {
  baseContent: Content;
  targetPlatforms: Platform[];
  brandVoiceGuidelines?: string[];
  bestPractices?: string[];
}

export class PublisherService {
  private db: DatabasePool;
  private adapterRegistry: PlatformAdapterRegistry;
  private defaultRetryPolicy: RetryPolicy = {
    maxRetries: 3,
    retryDelayMs: 5000,
    backoffMultiplier: 2,
    retryableErrors: ['timeout', 'network', 'rate limit', 'server error']
  };

  constructor(db: DatabasePool) {
    this.db = db;
    this.adapterRegistry = new PlatformAdapterRegistry();
  }

  async initialize(): Promise<void> {
    // Initialize platform adapters and connections
    console.log('Publisher service initialized');
  }

  async healthCheck(): Promise<{ healthy: boolean; details?: any }> {
    try {
      // Check database connection
      await this.db.query('SELECT 1');
      
      // Check platform adapter registry
      const adapters = this.adapterRegistry.getAvailableAdapters();
      
      return {
        healthy: true,
        details: {
          adapters: adapters.length,
          availablePlatforms: adapters
        }
      };
    } catch (error) {
      return {
        healthy: false,
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async close(): Promise<void> {
    // Close any open connections
    console.log('Publisher service closed');
  }

  async registerPlatformCredentials(
    platform: Platform,
    credentials: PlatformCredentials,
    tenantContext: TenantContext
  ): Promise<void> {
    // Store encrypted credentials in database
    const credentialsId = uuidv4();
    const now = new Date();

    await this.db.query(`
      INSERT INTO platform_credentials (
        id, tenant_id, platform, credentials, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      credentialsId,
      tenantContext.tenantId,
      platform,
      JSON.stringify(credentials), // In production, encrypt this
      true,
      now.toISOString(),
      now.toISOString()
    ]);

    // Register adapter
    this.adapterRegistry.registerAdapter(platform, credentials);
  }

  async adaptContentForPlatforms(request: ContentAdaptationRequest): Promise<Record<Platform, AdaptedContent>> {
    const adaptedContent: Record<Platform, AdaptedContent> = {} as Record<Platform, AdaptedContent>;

    for (const platform of request.targetPlatforms) {
      try {
        const adapted = await this.adaptContentForPlatform(
          request.baseContent,
          platform,
          request.brandVoiceGuidelines || [],
          request.bestPractices || []
        );
        adaptedContent[platform] = adapted;
      } catch (error) {
        console.error(`Failed to adapt content for ${platform}:`, error);
        // Continue with other platforms
      }
    }

    return adaptedContent;
  }

  async adaptContentForPlatform(
    baseContent: Content,
    platform: Platform,
    brandVoiceGuidelines: string[],
    bestPractices: string[]
  ): Promise<AdaptedContent> {
    const requirements = this.getPlatformRequirements(platform);
    
    // Start with base content - handle different possible structures
    let adaptedText = '';
    let adaptedMediaUrls: string[] = [];
    
    if (baseContent.baseContent) {
      adaptedText = baseContent.baseContent.text || '';
      adaptedMediaUrls = baseContent.baseContent.mediaUrls || [];
    } else if ((baseContent as any).text) {
      // Handle case where content is passed directly
      adaptedText = (baseContent as any).text || '';
      adaptedMediaUrls = (baseContent as any).mediaUrls || [];
    }
    
    // Apply platform-specific text adaptations
    if (requirements?.maxTextLength && adaptedText.length > requirements.maxTextLength) {
      adaptedText = this.truncateText(adaptedText, requirements.maxTextLength);
    }

    // Create platform-specific metadata
    const platformSpecific = this.createPlatformSpecificData(
      baseContent,
      platform,
      adaptedText,
      adaptedMediaUrls
    );

    // Apply brand voice and best practices
    if (brandVoiceGuidelines.length > 0 || bestPractices.length > 0) {
      adaptedText = this.applyBrandVoiceAndBestPractices(
        adaptedText,
        platform,
        brandVoiceGuidelines,
        bestPractices
      );
    }

    const adaptedContent: AdaptedContent = {
      text: adaptedText,
      mediaUrls: adaptedMediaUrls,
      metadata: {
        platform,
        adaptedAt: new Date().toISOString(),
        originalContentId: baseContent.id,
        adaptationVersion: '1.0'
      },
      platformSpecific
    };

    return adaptedContent;
  }

  async validatePlatformRequirements(
    content: AdaptedContent,
    platform: Platform
  ): Promise<ValidationResult> {
    const requirements = this.getPlatformRequirements(platform);
    if (!requirements) {
      return {
        isValid: false,
        errors: [{
          field: 'platform',
          message: `Unsupported platform: ${platform}`,
          code: 'UNSUPPORTED_PLATFORM'
        }]
      };
    }

    const errors: ValidationError[] = [];

    // Validate text length
    if (content.text && requirements.maxTextLength && content.text.length > requirements.maxTextLength) {
      errors.push({
        field: 'text',
        message: `Text exceeds maximum length of ${requirements.maxTextLength} characters`,
        code: 'TEXT_TOO_LONG'
      });
    }

    // Validate hashtag limits
    const hashtags = this.extractHashtags(content.text || '');
    if (hashtags.length > 0 && requirements.hashtagLimit && hashtags.length > requirements.hashtagLimit) {
      errors.push({
        field: 'hashtags',
        message: `Too many hashtags. Maximum allowed: ${requirements.hashtagLimit}`,
        code: 'TOO_MANY_HASHTAGS'
      });
    }

    // Validate media requirements
    if (content.mediaUrls && content.mediaUrls.length > 0) {
      for (const mediaUrl of content.mediaUrls) {
        const mediaValidation = this.validateMediaUrl(mediaUrl, requirements);
        if (!mediaValidation.isValid) {
          errors.push(...mediaValidation.errors);
        }
      }
    }

    // Platform-specific validations
    const platformValidation = await this.validatePlatformSpecificRequirements(content, platform);
    if (!platformValidation.isValid) {
      errors.push(...platformValidation.errors);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  async scheduleContent(
    content: Content,
    platform: Platform,
    scheduledAt: Date,
    tenantContext: TenantContext
  ): Promise<any> {
    try {
      // Validate platform
      const validPlatforms = ['instagram', 'linkedin', 'facebook', 'tiktok'];
      if (!validPlatforms.includes(platform)) {
        throw new Error(`Invalid platform: ${platform}. Must be one of: ${validPlatforms.join(', ')}`);
      }

      // Create scheduled content record
      const scheduledId = uuidv4();
      const now = new Date();

      await this.db.query(`
        INSERT INTO calendar_events (
          id, content_id, scheduled_at, platform, status, tenant_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        scheduledId,
        content.id,
        scheduledAt.toISOString(),
        platform,
        'scheduled',
        tenantContext.tenantId,
        now.toISOString(),
        now.toISOString()
      ]);

      return {
        id: scheduledId,
        contentId: content.id,
        platform,
        scheduledAt,
        status: 'scheduled'
      };
    } catch (error) {
      console.error('Error scheduling content:', error);
      throw error;
    }
  }

  async publishContent(
    request: PublishRequest,
    tenantContext: TenantContext
  ): Promise<PublishJobResult[]> {
    const results: PublishJobResult[] = [];

    // Get content
    const content = await this.getContent(request.contentId, tenantContext);
    if (!content) {
      throw new Error('Content not found');
    }

    for (const platform of request.platforms) {
      const jobId = uuidv4();
      
      try {
        // Get platform credentials
        const credentials = await this.getPlatformCredentials(platform, tenantContext);
        if (!credentials) {
          results.push({
            jobId,
            contentId: request.contentId,
            platform,
            status: 'failed',
            error: 'Platform credentials not found',
            retryCount: 0,
            scheduledAt: request.scheduledAt
          });
          continue;
        }

        // Get or create adapter
        let adapter = this.adapterRegistry.getAdapter(platform, credentials);
        if (!adapter) {
          adapter = this.adapterRegistry.registerAdapter(platform, credentials);
        }

        // Get adapted content for platform
        const adaptedContent = content.adaptedContent[platform];
        if (!adaptedContent) {
          results.push({
            jobId,
            contentId: request.contentId,
            platform,
            status: 'failed',
            error: 'No adapted content found for platform',
            retryCount: 0,
            scheduledAt: request.scheduledAt
          });
          continue;
        }

        // Validate content
        const validation = await adapter.validateContent(adaptedContent);
        if (!validation.isValid) {
          results.push({
            jobId,
            contentId: request.contentId,
            platform,
            status: 'failed',
            error: `Validation failed: ${validation.errors.map(e => e.message).join(', ')}`,
            retryCount: 0,
            scheduledAt: request.scheduledAt
          });
          continue;
        }

        // Publish content
        const publishResult = await this.publishWithRetry(
          adapter,
          adaptedContent,
          tenantContext,
          request.retryPolicy || this.defaultRetryPolicy
        );

        const jobResult: PublishJobResult = {
          jobId,
          contentId: request.contentId,
          platform,
          status: publishResult.success ? 'success' : 'failed',
          result: publishResult,
          error: publishResult.error,
          retryCount: 0,
          scheduledAt: request.scheduledAt,
          publishedAt: publishResult.success ? new Date() : undefined
        };

        results.push(jobResult);

        // Store publish result
        await this.storePublishResult(jobResult, tenantContext);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          jobId,
          contentId: request.contentId,
          platform,
          status: 'failed',
          error: errorMessage,
          retryCount: 0,
          scheduledAt: request.scheduledAt
        });
      }
    }

    return results;
  }

  getPlatformRequirements(platform: Platform): ContentRequirements | undefined {
    const supportedPlatforms = this.getSupportedPlatforms();
    if (!supportedPlatforms.includes(platform)) {
      return undefined;
    }

    // Return platform-specific requirements
    switch (platform) {
      case 'instagram':
        return {
          maxTextLength: 2200,
          hashtagLimit: 30,
          videoMaxDuration: 60,
          imageFormats: ['jpg', 'jpeg', 'png'],
          videoFormats: ['mp4', 'mov'],
          aspectRatios: ['1:1', '4:5', '9:16'],
          maxFileSize: 100 * 1024 * 1024,
          requiredFields: ['mediaUrls', 'mediaType']
        };
      case 'tiktok':
        return {
          maxTextLength: 2200,
          hashtagLimit: 20,
          videoMaxDuration: 180,
          videoFormats: ['mp4', 'mov', 'avi'],
          maxFileSize: 500 * 1024 * 1024,
          requiredFields: ['mediaUrls', 'privacy']
        };
      case 'facebook':
        return {
          maxTextLength: 63206,
          videoMaxDuration: 240 * 60,
          imageFormats: ['jpg', 'jpeg', 'png', 'gif', 'bmp'],
          videoFormats: ['mp4', 'mov', 'avi', 'mkv', '3gp'],
          maxFileSize: 4 * 1024 * 1024 * 1024,
          requiredFields: ['postType', 'content']
        };
      case 'linkedin':
        return {
          maxTextLength: 3000,
          videoMaxDuration: 10 * 60,
          imageFormats: ['jpg', 'jpeg', 'png', 'gif'],
          videoFormats: ['mp4', 'mov', 'wmv', 'flv', 'avi', 'mkv'],
          maxFileSize: 5 * 1024 * 1024 * 1024,
          requiredFields: ['postType', 'content']
        };
      default:
        return undefined;
    }
  }

  getSupportedPlatforms(): Platform[] {
    return this.adapterRegistry.getSupportedPlatforms();
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    // Try to truncate at word boundary
    const truncated = text.substring(0, maxLength - 3);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > maxLength * 0.8) {
      return truncated.substring(0, lastSpace) + '...';
    }
    
    return truncated + '...';
  }

  private createPlatformSpecificData(
    baseContent: Content,
    platform: Platform,
    adaptedText: string,
    mediaUrls: string[]
  ): Record<string, any> {
    const hashtags = this.extractHashtags(adaptedText);
    
    switch (platform) {
      case 'instagram':
        return {
          aspectRatio: this.determineAspectRatio(mediaUrls),
          mediaType: this.determineMediaType(mediaUrls),
          caption: adaptedText,
          hashtags: hashtags
        };
      case 'tiktok':
        return {
          duration: this.estimateVideoDuration(mediaUrls),
          hashtags: hashtags,
          privacy: 'public',
          effects: [],
          sounds: []
        };
      case 'facebook':
        return {
          postType: this.determinePostType(adaptedText, mediaUrls),
          content: adaptedText,
          targetAudience: 'everyone'
        };
      case 'linkedin':
        return {
          postType: this.determineLinkedInPostType(adaptedText, mediaUrls),
          content: adaptedText,
          targetAudience: 'connections'
        };
      default:
        return {};
    }
  }

  private applyBrandVoiceAndBestPractices(
    text: string,
    platform: Platform,
    brandVoiceGuidelines: string[],
    bestPractices: string[]
  ): string {
    // This is a simplified implementation
    // In a real system, you might use AI to apply brand voice and best practices
    let adaptedText = text;

    // Apply platform-specific best practices
    if (platform === 'linkedin' && !text.includes('professional')) {
      // Add professional tone for LinkedIn
      adaptedText = this.addProfessionalTone(adaptedText);
    }

    if (platform === 'instagram' && !this.hasCallToAction(text)) {
      // Add call to action for Instagram
      adaptedText = this.addCallToAction(adaptedText);
    }

    return adaptedText;
  }

  private extractHashtags(text: string): string[] {
    if (!text || typeof text !== 'string') {
      return [];
    }
    const hashtagRegex = /#[\w]+/g;
    const matches = text.match(hashtagRegex);
    return matches || [];
  }

  private validateMediaUrl(url: string, requirements: ContentRequirements): ValidationResult {
    const errors: ValidationError[] = [];

    try {
      const urlObj = new URL(url);
      const extension = urlObj.pathname.split('.').pop()?.toLowerCase();

      if (!extension) {
        errors.push({
          field: 'mediaUrl',
          message: 'Media URL must have a file extension',
          code: 'MISSING_EXTENSION'
        });
        return { isValid: false, errors };
      }

      // Check if extension is supported
      const allFormats = [...(requirements.imageFormats || []), ...(requirements.videoFormats || [])];
      if (!allFormats.includes(extension)) {
        errors.push({
          field: 'mediaUrl',
          message: `Unsupported file format: ${extension}. Supported: ${allFormats.join(', ')}`,
          code: 'UNSUPPORTED_FORMAT'
        });
      }

    } catch (error) {
      errors.push({
        field: 'mediaUrl',
        message: 'Invalid media URL format',
        code: 'INVALID_URL'
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private async validatePlatformSpecificRequirements(
    content: AdaptedContent,
    platform: Platform
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    switch (platform) {
      case 'instagram':
        if (!content.platformSpecific?.mediaType) {
          errors.push({
            field: 'mediaType',
            message: 'Instagram posts require a media type',
            code: 'MISSING_MEDIA_TYPE'
          });
        }
        break;
      case 'tiktok':
        if (!content.platformSpecific?.privacy) {
          errors.push({
            field: 'privacy',
            message: 'TikTok posts require a privacy setting',
            code: 'MISSING_PRIVACY'
          });
        }
        break;
      case 'facebook':
        if (!content.platformSpecific?.postType) {
          errors.push({
            field: 'postType',
            message: 'Facebook posts require a post type',
            code: 'MISSING_POST_TYPE'
          });
        }
        break;
      case 'linkedin':
        if (!content.platformSpecific?.postType) {
          errors.push({
            field: 'postType',
            message: 'LinkedIn posts require a post type',
            code: 'MISSING_POST_TYPE'
          });
        }
        break;
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private async publishWithRetry(
    adapter: PlatformAdapter,
    content: AdaptedContent,
    tenantContext: TenantContext,
    retryPolicy: RetryPolicy
  ): Promise<PublishResult> {
    let lastError: string = '';
    
    for (let attempt = 0; attempt <= retryPolicy.maxRetries; attempt++) {
      try {
        const result = await adapter.publish(content, tenantContext);
        if (result.success) {
          return result;
        }
        
        lastError = result.error || 'Unknown error';
        
        // Check if error is retryable
        if (!result.retryable || attempt === retryPolicy.maxRetries) {
          break;
        }
        
        // Wait before retry
        const delay = retryPolicy.retryDelayMs * Math.pow(retryPolicy.backoffMultiplier, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        
        // Check if error is retryable
        const isRetryable = retryPolicy.retryableErrors.some(retryableError =>
          lastError.toLowerCase().includes(retryableError.toLowerCase())
        );
        
        if (!isRetryable || attempt === retryPolicy.maxRetries) {
          break;
        }
        
        // Wait before retry
        const delay = retryPolicy.retryDelayMs * Math.pow(retryPolicy.backoffMultiplier, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return {
      success: false,
      error: lastError,
      retryable: false
    };
  }

  private async getContent(contentId: string, tenantContext: TenantContext): Promise<Content | null> {
    const result = await this.db.query(`
      SELECT 
        id, briefing_id, title, description, content_type,
        base_content, adapted_content, workflow_id, tenant_id,
        client_id, created_by, created_at, updated_at
      FROM content
      WHERE id = ? AND tenant_id = ?
    `, [contentId, tenantContext.tenantId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      briefingId: row.briefing_id,
      title: row.title,
      description: row.description,
      contentType: row.content_type,
      baseContent: JSON.parse(row.base_content),
      adaptedContent: JSON.parse(row.adapted_content),
      workflowId: row.workflow_id,
      tenantId: row.tenant_id,
      clientId: row.client_id,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  private async getPlatformCredentials(
    platform: Platform,
    tenantContext: TenantContext
  ): Promise<PlatformCredentials | null> {
    const result = await this.db.query(`
      SELECT credentials
      FROM platform_credentials
      WHERE platform = ? AND tenant_id = ? AND is_active = true
      ORDER BY created_at DESC
      LIMIT 1
    `, [platform, tenantContext.tenantId]);

    if (result.rows.length === 0) {
      return null;
    }

    return JSON.parse(result.rows[0].credentials);
  }

  private async storePublishResult(result: PublishJobResult, tenantContext: TenantContext): Promise<void> {
    const now = new Date();
    
    await this.db.query(`
      INSERT INTO publish_jobs (
        id, content_id, platform, status, result, error, retry_count,
        scheduled_at, published_at, tenant_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      result.jobId,
      result.contentId,
      result.platform,
      result.status,
      JSON.stringify(result.result),
      result.error,
      result.retryCount,
      result.scheduledAt?.toISOString(),
      result.publishedAt?.toISOString(),
      tenantContext.tenantId,
      now.toISOString(),
      now.toISOString()
    ]);
  }

  // Helper methods for content adaptation
  private determineAspectRatio(mediaUrls: string[]): string {
    // Default to square for Instagram
    return '1:1';
  }

  private determineMediaType(mediaUrls: string[]): string {
    if (!mediaUrls || mediaUrls.length === 0) return 'photo';
    if (mediaUrls.length > 1) return 'carousel';
    
    const url = mediaUrls[0].toLowerCase();
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv'];
    
    return videoExtensions.some(ext => url.includes(ext)) ? 'video' : 'photo';
  }

  private estimateVideoDuration(mediaUrls: string[]): number {
    // Default duration estimate - in real implementation, you'd analyze the video
    return 30;
  }

  private determinePostType(text: string, mediaUrls: string[]): string {
    if (mediaUrls && mediaUrls.length > 0) {
      const url = mediaUrls[0].toLowerCase();
      const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv'];
      return videoExtensions.some(ext => url.includes(ext)) ? 'video' : 'photo';
    }
    return 'text';
  }

  private determineLinkedInPostType(text: string, mediaUrls: string[]): string {
    if (text.length > 1000) return 'article';
    if (mediaUrls && mediaUrls.length > 0) {
      const url = mediaUrls[0].toLowerCase();
      const videoExtensions = ['.mp4', '.mov', '.wmv', '.flv', '.avi', '.mkv'];
      return videoExtensions.some(ext => url.includes(ext)) ? 'video' : 'image';
    }
    return 'update';
  }

  private addProfessionalTone(text: string): string {
    // Simple implementation - in practice, use AI for better results
    if (!text.includes('professional') && !text.includes('business')) {
      return text + ' #professional #business';
    }
    return text;
  }

  private addCallToAction(text: string): string {
    const ctas = ['What do you think?', 'Share your thoughts!', 'Let me know in the comments!'];
    const randomCta = ctas[Math.floor(Math.random() * ctas.length)];
    return text + '\n\n' + randomCta;
  }

  private hasCallToAction(text: string): boolean {
    const ctaKeywords = ['comment', 'share', 'like', 'follow', 'think', 'opinion'];
    return ctaKeywords.some(keyword => text.toLowerCase().includes(keyword));
  }
}