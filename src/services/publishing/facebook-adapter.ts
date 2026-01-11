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

interface FacebookPageInfo {
  id: string;
  name: string;
  access_token: string;
}

interface FacebookPublishResponse {
  id: string;
  post_id?: string;
}

interface FacebookPhotoUploadResponse {
  id: string;
  post_id: string;
}

export class FacebookAdapter extends PlatformAdapter {
  private readonly baseUrl = 'https://graph.facebook.com/v18.0';
  private pageAccessToken?: string;
  private pageId?: string;

  constructor(credentials: PlatformCredentials) {
    super('facebook', credentials);
  }

  async authenticate(): Promise<boolean> {
    try {
      // First, verify the user access token
      const userResponse = await fetch(`${this.baseUrl}/me?access_token=${this.credentials.accessToken}`);
      
      if (!userResponse || !userResponse.ok) {
        return false;
      }
      
      const userData = await userResponse.json();
      
      if (!userData || !userData.id) {
        return false;
      }

      // Get pages managed by the user
      const pagesResponse = await fetch(
        `${this.baseUrl}/me/accounts?access_token=${this.credentials.accessToken}`
      );
      const pagesData = await pagesResponse.json();
      
      if (!pagesResponse.ok || !pagesData.data || pagesData.data.length === 0) {
        return false;
      }

      // Use the first page (in production, you'd let user select)
      const page = pagesData.data[0] as FacebookPageInfo;
      this.pageId = page.id;
      this.pageAccessToken = page.access_token;
      
      return true;
    } catch (error) {
      console.error('Facebook authentication failed:', error);
      return false;
    }
  }

  async publish(content: AdaptedContent, tenantContext: TenantContext): Promise<PublishResult> {
    try {
      // Ensure authentication
      if (!this.pageAccessToken || !this.pageId) {
        const authSuccess = await this.authenticate();
        if (!authSuccess) {
          return {
            success: false,
            error: 'Facebook authentication failed',
            retryable: true
          };
        }
      }

      // Validate content before publishing
      const validation = await this.validateContent(content);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Content validation failed: ${validation.errors.map(e => e.message).join(', ')}`,
          retryable: false
        };
      }

      const postType = content.platformSpecific?.postType as string;
      let publishResult: FacebookPublishResponse;

      switch (postType) {
        case 'photo':
          publishResult = await this.publishPhoto(content);
          break;
        case 'video':
          publishResult = await this.publishVideo(content);
          break;
        case 'link':
          publishResult = await this.publishLink(content);
          break;
        default:
          publishResult = await this.publishTextPost(content);
      }

      return {
        success: true,
        platformPostId: publishResult.post_id || publishResult.id,
        publishedAt: new Date(),
        metadata: {
          postType,
          pageId: this.pageId
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

    // Validate text content length
    const postContent = content.platformSpecific?.content as string;
    if (postContent && requirements.maxTextLength && postContent.length > requirements.maxTextLength) {
      errors.push({
        field: 'content',
        message: `Post content exceeds maximum length of ${requirements.maxTextLength} characters`,
        code: 'CONTENT_TOO_LONG'
      });
    }

    // Validate post type
    const postType = content.platformSpecific?.postType as string;
    if (!postType || !['text', 'photo', 'video', 'link'].includes(postType)) {
      errors.push({
        field: 'postType',
        message: 'Invalid post type. Must be text, photo, video, or link',
        code: 'INVALID_POST_TYPE'
      });
    }

    // Validate media for photo/video posts
    if ((postType === 'photo' || postType === 'video') && (!content.mediaUrls || content.mediaUrls.length === 0)) {
      errors.push({
        field: 'mediaUrls',
        message: `${postType} posts require media files`,
        code: 'MISSING_MEDIA'
      });
    }

    // Validate target audience
    const targetAudience = content.platformSpecific?.targetAudience as string;
    if (targetAudience && !['everyone', 'friends', 'custom'].includes(targetAudience)) {
      errors.push({
        field: 'targetAudience',
        message: 'Invalid target audience. Must be everyone, friends, or custom',
        code: 'INVALID_TARGET_AUDIENCE'
      });
    }

    // Validate link for link posts
    if (postType === 'link') {
      const link = content.platformSpecific?.link as string;
      if (!link || !this.isValidUrl(link)) {
        errors.push({
          field: 'link',
          message: 'Link posts require a valid URL',
          code: 'INVALID_LINK'
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  getRequirements(): ContentRequirements {
    return {
      maxTextLength: 63206,
      videoMaxDuration: 240 * 60, // 240 minutes
      imageFormats: ['jpg', 'jpeg', 'png', 'gif', 'bmp'],
      videoFormats: ['mp4', 'mov', 'avi', 'mkv', '3gp'],
      maxFileSize: 4 * 1024 * 1024 * 1024, // 4GB
      requiredFields: ['postType', 'content']
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
    // Facebook user access tokens can be extended but not refreshed in the traditional sense
    // This would typically involve re-authentication flow
    throw new Error('Facebook credentials refresh requires re-authentication flow');
  }

  private async publishTextPost(content: AdaptedContent): Promise<FacebookPublishResponse> {
    const postContent = content.platformSpecific?.content as string || content.text || '';
    
    const response = await fetch(`${this.baseUrl}/${this.pageId}/feed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: postContent,
        access_token: this.pageAccessToken
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to publish Facebook text post: ${errorData.error?.message || 'Unknown error'}`);
    }

    return await response.json();
  }

  private async publishPhoto(content: AdaptedContent): Promise<FacebookPublishResponse> {
    if (!content.mediaUrls || content.mediaUrls.length === 0) {
      throw new Error('Photo post requires media URL');
    }

    const photoUrl = content.mediaUrls[0];
    const caption = content.platformSpecific?.content as string || content.text || '';

    const response = await fetch(`${this.baseUrl}/${this.pageId}/photos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: photoUrl,
        caption: caption,
        access_token: this.pageAccessToken
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to publish Facebook photo: ${errorData.error?.message || 'Unknown error'}`);
    }

    return await response.json();
  }

  private async publishVideo(content: AdaptedContent): Promise<FacebookPublishResponse> {
    if (!content.mediaUrls || content.mediaUrls.length === 0) {
      throw new Error('Video post requires media URL');
    }

    const videoUrl = content.mediaUrls[0];
    const description = content.platformSpecific?.content as string || content.text || '';

    // For video uploads, Facebook requires the actual file data
    // In a real implementation, you would upload the video file
    const response = await fetch(`${this.baseUrl}/${this.pageId}/videos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file_url: videoUrl,
        description: description,
        access_token: this.pageAccessToken
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to publish Facebook video: ${errorData.error?.message || 'Unknown error'}`);
    }

    return await response.json();
  }

  private async publishLink(content: AdaptedContent): Promise<FacebookPublishResponse> {
    const link = content.platformSpecific?.link as string;
    const message = content.platformSpecific?.content as string || content.text || '';

    if (!link) {
      throw new Error('Link post requires a URL');
    }

    const response = await fetch(`${this.baseUrl}/${this.pageId}/feed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        link: link,
        message: message,
        access_token: this.pageAccessToken
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to publish Facebook link post: ${errorData.error?.message || 'Unknown error'}`);
    }

    return await response.json();
  }

  private parseRateLimit(rateLimitHeader: string): number | undefined {
    try {
      const usage = JSON.parse(rateLimitHeader);
      return usage.call_count ? 100 - usage.call_count : undefined;
    } catch {
      return undefined;
    }
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private isRetryableError(error: any): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('timeout') || 
             message.includes('network') || 
             message.includes('rate limit') ||
             message.includes('server error') ||
             message.includes('upload');
    }
    return false;
  }
}