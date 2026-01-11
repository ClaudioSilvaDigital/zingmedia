import {
  AdaptedContent,
  ValidationResult,
  ValidationError,
  TenantContext
} from '../../types/index.js';
import {
  PlatformAdapter,
  PlatformCredentials,
  PublishResult,
  ContentRequirements,
  PlatformHealthCheck
} from './platform-adapter.js';

interface InstagramMediaObject {
  image_url?: string;
  video_url?: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  caption?: string;
  children?: InstagramMediaObject[];
}

interface InstagramPublishResponse {
  id: string;
  creation_id?: string;
}

export class InstagramAdapter extends PlatformAdapter {
  private readonly baseUrl = 'https://graph.facebook.com/v18.0';

  constructor(credentials: PlatformCredentials) {
    super('instagram', credentials);
  }

  async authenticate(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/me?access_token=${this.credentials.accessToken}`);
      const data = await response.json();
      
      if (response.ok && data.id) {
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Instagram authentication failed:', error);
      return false;
    }
  }

  async publish(content: AdaptedContent, tenantContext: TenantContext): Promise<PublishResult> {
    try {
      // Validate content before publishing
      const validation = await this.validateContent(content);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Content validation failed: ${validation.errors.map(e => e.message).join(', ')}`,
          retryable: false
        };
      }

      const instagramBusinessAccountId = await this.getInstagramBusinessAccountId();
      if (!instagramBusinessAccountId) {
        return {
          success: false,
          error: 'Instagram Business Account ID not found',
          retryable: false
        };
      }

      const mediaObject = this.buildMediaObject(content);
      const publishResult = await this.publishMedia(instagramBusinessAccountId, mediaObject);

      return {
        success: true,
        platformPostId: publishResult.id,
        publishedAt: new Date(),
        metadata: {
          creationId: publishResult.creation_id,
          mediaType: mediaObject.media_type
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isRetryable = this.isRetryableError(error);
      
      return {
        success: false,
        error: errorMessage,
        retryable: isRetryable
      };
    }
  }

  async validateContent(content: AdaptedContent): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const requirements = this.getRequirements();

    // Validate caption length
    const caption = content.platformSpecific?.caption as string;
    if (caption && requirements.maxTextLength && caption.length > requirements.maxTextLength) {
      errors.push({
        field: 'caption',
        message: `Caption exceeds maximum length of ${requirements.maxTextLength} characters`,
        code: 'CAPTION_TOO_LONG'
      });
    }

    // Validate hashtags
    const hashtags = content.platformSpecific?.hashtags as string[];
    if (hashtags && requirements.hashtagLimit && hashtags.length > requirements.hashtagLimit) {
      errors.push({
        field: 'hashtags',
        message: `Too many hashtags. Maximum allowed: ${requirements.hashtagLimit}`,
        code: 'TOO_MANY_HASHTAGS'
      });
    }

    // Validate media presence
    if (!content.mediaUrls || content.mediaUrls.length === 0) {
      errors.push({
        field: 'mediaUrls',
        message: 'Instagram posts require at least one media file',
        code: 'MISSING_MEDIA'
      });
    }

    // Validate aspect ratio
    const aspectRatio = content.platformSpecific?.aspectRatio as string;
    if (aspectRatio && !requirements.aspectRatios?.includes(aspectRatio)) {
      errors.push({
        field: 'aspectRatio',
        message: `Invalid aspect ratio. Supported: ${requirements.aspectRatios?.join(', ')}`,
        code: 'INVALID_ASPECT_RATIO'
      });
    }

    // Validate media type
    const mediaType = content.platformSpecific?.mediaType as string;
    if (!mediaType || !['photo', 'video', 'carousel'].includes(mediaType)) {
      errors.push({
        field: 'mediaType',
        message: 'Invalid media type. Must be photo, video, or carousel',
        code: 'INVALID_MEDIA_TYPE'
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  getRequirements(): ContentRequirements {
    return {
      maxTextLength: 2200,
      hashtagLimit: 30,
      videoMaxDuration: 60,
      imageFormats: ['jpg', 'jpeg', 'png'],
      videoFormats: ['mp4', 'mov'],
      aspectRatios: ['1:1', '4:5', '9:16'],
      maxFileSize: 100 * 1024 * 1024, // 100MB
      requiredFields: ['mediaUrls', 'mediaType']
    };
  }

  async checkHealth(): Promise<PlatformHealthCheck> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(`${this.baseUrl}/me?access_token=${this.credentials.accessToken}`);
      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        const rateLimitRemaining = response.headers.get('x-app-usage') 
          ? this.parseRateLimit(response.headers.get('x-app-usage')!)
          : undefined;

        return {
          isHealthy: true,
          responseTime,
          timestamp: new Date(),
          rateLimitRemaining
        };
      } else {
        const errorData = await response.json();
        return {
          isHealthy: false,
          responseTime,
          timestamp: new Date(),
          error: errorData.error?.message || 'Health check failed'
        };
      }
    } catch (error) {
      return {
        isHealthy: false,
        responseTime: Date.now() - startTime,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Health check failed'
      };
    }
  }

  async refreshCredentials(): Promise<PlatformCredentials> {
    if (!this.credentials.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await fetch(`${this.baseUrl}/oauth/access_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.credentials.refreshToken,
          client_id: this.credentials.appId!,
          client_secret: this.credentials.appSecret!
        })
      });

      if (!response.ok) {
        throw new Error('Failed to refresh Instagram credentials');
      }

      const data = await response.json();
      
      const newCredentials: PlatformCredentials = {
        ...this.credentials,
        accessToken: data.access_token,
        refreshToken: data.refresh_token || this.credentials.refreshToken
      };

      this.updateCredentials(newCredentials);
      return newCredentials;
    } catch (error) {
      throw new Error(`Failed to refresh Instagram credentials: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async getInstagramBusinessAccountId(): Promise<string | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/me/accounts?access_token=${this.credentials.accessToken}`
      );
      
      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      
      // Check if data.data exists and is an array
      if (!data.data || !Array.isArray(data.data)) {
        console.error('Invalid response structure from Facebook API:', data);
        return null;
      }
      
      // Find the first page with an Instagram business account
      for (const page of data.data) {
        const igResponse = await fetch(
          `${this.baseUrl}/${page.id}?fields=instagram_business_account&access_token=${this.credentials.accessToken}`
        );
        
        if (igResponse.ok) {
          const igData = await igResponse.json();
          if (igData.instagram_business_account) {
            return igData.instagram_business_account.id;
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error getting Instagram Business Account ID:', error);
      return null;
    }
  }

  private buildMediaObject(content: AdaptedContent): InstagramMediaObject {
    const mediaType = content.platformSpecific?.mediaType as string;
    const caption = content.platformSpecific?.caption as string;
    const hashtags = content.platformSpecific?.hashtags as string[];
    
    let fullCaption = caption || '';
    if (hashtags && hashtags.length > 0) {
      fullCaption += '\n\n' + hashtags.map(tag => tag.startsWith('#') ? tag : `#${tag}`).join(' ');
    }

    const mediaObject: InstagramMediaObject = {
      media_type: this.mapMediaType(mediaType),
      caption: fullCaption
    };

    if (content.mediaUrls && content.mediaUrls.length > 0) {
      if (mediaType === 'carousel' && content.mediaUrls.length > 1) {
        mediaObject.children = content.mediaUrls.map(url => ({
          media_type: this.detectMediaType(url),
          image_url: this.detectMediaType(url) === 'IMAGE' ? url : undefined,
          video_url: this.detectMediaType(url) === 'VIDEO' ? url : undefined
        }));
      } else {
        const url = content.mediaUrls[0];
        const detectedType = this.detectMediaType(url);
        if (detectedType === 'IMAGE') {
          mediaObject.image_url = url;
        } else {
          mediaObject.video_url = url;
        }
      }
    }

    return mediaObject;
  }

  private mapMediaType(mediaType: string): 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' {
    switch (mediaType) {
      case 'photo':
        return 'IMAGE';
      case 'video':
        return 'VIDEO';
      case 'carousel':
        return 'CAROUSEL_ALBUM';
      default:
        return 'IMAGE';
    }
  }

  private detectMediaType(url: string): 'IMAGE' | 'VIDEO' {
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv'];
    const urlLower = url.toLowerCase();
    
    return videoExtensions.some(ext => urlLower.includes(ext)) ? 'VIDEO' : 'IMAGE';
  }

  private async publishMedia(accountId: string, mediaObject: InstagramMediaObject): Promise<InstagramPublishResponse> {
    // Step 1: Create media object
    const createResponse = await fetch(`${this.baseUrl}/${accountId}/media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...mediaObject,
        access_token: this.credentials.accessToken
      })
    });

    if (!createResponse.ok) {
      const errorData = await createResponse.json();
      throw new Error(`Failed to create Instagram media: ${errorData.error?.message || 'Unknown error'}`);
    }

    const createData = await createResponse.json();
    const creationId = createData.id;

    // Step 2: Publish media
    const publishResponse = await fetch(`${this.baseUrl}/${accountId}/media_publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        creation_id: creationId,
        access_token: this.credentials.accessToken
      })
    });

    if (!publishResponse.ok) {
      const errorData = await publishResponse.json();
      throw new Error(`Failed to publish Instagram media: ${errorData.error?.message || 'Unknown error'}`);
    }

    const publishData = await publishResponse.json();
    
    return {
      id: publishData.id,
      creation_id: creationId
    };
  }

  private parseRateLimit(rateLimitHeader: string): number | undefined {
    try {
      const usage = JSON.parse(rateLimitHeader);
      return usage.call_count ? 100 - usage.call_count : undefined;
    } catch {
      return undefined;
    }
  }

  private isRetryableError(error: any): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('timeout') || 
             message.includes('network') || 
             message.includes('rate limit') ||
             message.includes('server error');
    }
    return false;
  }
}