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

interface LinkedInProfile {
  id: string;
  localizedFirstName: string;
  localizedLastName: string;
}

interface LinkedInShareResponse {
  id: string;
  activity: string;
}

interface LinkedInMediaUploadResponse {
  value: {
    uploadMechanism: {
      'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': {
        uploadUrl: string;
        headers: Record<string, string>;
      };
    };
    asset: string;
  };
}

export class LinkedInAdapter extends PlatformAdapter {
  private readonly baseUrl = 'https://api.linkedin.com/v2';
  private profileId?: string;

  constructor(credentials: PlatformCredentials) {
    super('linkedin', credentials);
  }

  async authenticate(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/people/~`, {
        headers: {
          'Authorization': `Bearer ${this.credentials.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (response.ok && data.id) {
        this.profileId = data.id;
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('LinkedIn authentication failed:', error);
      return false;
    }
  }

  async publish(content: AdaptedContent, tenantContext: TenantContext): Promise<PublishResult> {
    try {
      // Ensure authentication
      if (!this.profileId) {
        const authSuccess = await this.authenticate();
        if (!authSuccess) {
          return {
            success: false,
            error: 'LinkedIn authentication failed',
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
      let publishResult: LinkedInShareResponse;

      switch (postType) {
        case 'article':
          publishResult = await this.publishArticle(content);
          break;
        case 'video':
          publishResult = await this.publishVideo(content);
          break;
        case 'image':
          publishResult = await this.publishImage(content);
          break;
        default:
          publishResult = await this.publishTextPost(content);
      }

      return {
        success: true,
        platformPostId: publishResult.id,
        publishedAt: new Date(),
        metadata: {
          postType,
          activity: publishResult.activity,
          profileId: this.profileId
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
    if (!postType || !['update', 'article', 'image', 'video'].includes(postType)) {
      errors.push({
        field: 'postType',
        message: 'Invalid post type. Must be update, article, image, or video',
        code: 'INVALID_POST_TYPE'
      });
    }

    // Validate media for image/video posts
    if ((postType === 'image' || postType === 'video') && (!content.mediaUrls || content.mediaUrls.length === 0)) {
      errors.push({
        field: 'mediaUrls',
        message: `${postType} posts require media files`,
        code: 'MISSING_MEDIA'
      });
    }

    // Validate target audience
    const targetAudience = content.platformSpecific?.targetAudience as string;
    if (targetAudience && !['connections', 'public'].includes(targetAudience)) {
      errors.push({
        field: 'targetAudience',
        message: 'Invalid target audience. Must be connections or public',
        code: 'INVALID_TARGET_AUDIENCE'
      });
    }

    // Validate article-specific fields
    if (postType === 'article') {
      const title = content.platformSpecific?.title as string;
      if (!title || title.trim().length === 0) {
        errors.push({
          field: 'title',
          message: 'Article posts require a title',
          code: 'MISSING_TITLE'
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
      maxTextLength: 3000,
      videoMaxDuration: 10 * 60, // 10 minutes
      imageFormats: ['jpg', 'jpeg', 'png', 'gif'],
      videoFormats: ['mp4', 'mov', 'wmv', 'flv', 'avi', 'mkv'],
      maxFileSize: 5 * 1024 * 1024 * 1024, // 5GB for videos, 20MB for images
      requiredFields: ['postType', 'content']
    };
  }

  async checkHealth(): Promise<PlatformHealthCheck> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(`${this.baseUrl}/people/~`, {
        headers: {
          'Authorization': `Bearer ${this.credentials.accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        const rateLimitRemaining = response.headers.get('x-ratelimit-remaining') 
          ? parseInt(response.headers.get('x-ratelimit-remaining')!)
          : undefined;

        const rateLimitReset = response.headers.get('x-ratelimit-reset')
          ? new Date(parseInt(response.headers.get('x-ratelimit-reset')!) * 1000)
          : undefined;

        return {
          isHealthy: true,
          responseTime,
          timestamp: new Date(),
          rateLimitRemaining,
          rateLimitReset
        };
      } else {
        const errorData = await response.json();
        return {
          isHealthy: false,
          responseTime,
          timestamp: new Date(),
          error: errorData.message || 'Health check failed'
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
      const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
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
        throw new Error('Failed to refresh LinkedIn credentials');
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
      throw new Error(`Failed to refresh LinkedIn credentials: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async publishTextPost(content: AdaptedContent): Promise<LinkedInShareResponse> {
    const postContent = content.platformSpecific?.content as string || content.text || '';
    const targetAudience = content.platformSpecific?.targetAudience as string || 'connections';
    
    const shareData = {
      author: `urn:li:person:${this.profileId}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: {
            text: postContent
          },
          shareMediaCategory: 'NONE'
        }
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': targetAudience.toUpperCase()
      }
    };

    const response = await fetch(`${this.baseUrl}/ugcPosts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      body: JSON.stringify(shareData)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to publish LinkedIn text post: ${errorData.message || 'Unknown error'}`);
    }

    const result = await response.json();
    return {
      id: result.id,
      activity: result.activity || result.id
    };
  }

  private async publishImage(content: AdaptedContent): Promise<LinkedInShareResponse> {
    if (!content.mediaUrls || content.mediaUrls.length === 0) {
      throw new Error('Image post requires media URL');
    }

    // Step 1: Register upload
    const uploadResponse = await this.registerImageUpload();
    
    // Step 2: Upload image
    await this.uploadImage(uploadResponse.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl, content.mediaUrls[0]);
    
    // Step 3: Create post with image
    const postContent = content.platformSpecific?.content as string || content.text || '';
    const targetAudience = content.platformSpecific?.targetAudience as string || 'connections';
    
    const shareData = {
      author: `urn:li:person:${this.profileId}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: {
            text: postContent
          },
          shareMediaCategory: 'IMAGE',
          media: [
            {
              status: 'READY',
              description: {
                text: 'Image post'
              },
              media: uploadResponse.value.asset,
              title: {
                text: 'Image'
              }
            }
          ]
        }
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': targetAudience.toUpperCase()
      }
    };

    const response = await fetch(`${this.baseUrl}/ugcPosts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      body: JSON.stringify(shareData)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to publish LinkedIn image post: ${errorData.message || 'Unknown error'}`);
    }

    const result = await response.json();
    return {
      id: result.id,
      activity: result.activity || result.id
    };
  }

  private async publishVideo(content: AdaptedContent): Promise<LinkedInShareResponse> {
    if (!content.mediaUrls || content.mediaUrls.length === 0) {
      throw new Error('Video post requires media URL');
    }

    // Step 1: Register video upload
    const uploadResponse = await this.registerVideoUpload();
    
    // Step 2: Upload video
    await this.uploadVideo(uploadResponse.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl, content.mediaUrls[0]);
    
    // Step 3: Create post with video
    const postContent = content.platformSpecific?.content as string || content.text || '';
    const targetAudience = content.platformSpecific?.targetAudience as string || 'connections';
    
    const shareData = {
      author: `urn:li:person:${this.profileId}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: {
            text: postContent
          },
          shareMediaCategory: 'VIDEO',
          media: [
            {
              status: 'READY',
              description: {
                text: 'Video post'
              },
              media: uploadResponse.value.asset,
              title: {
                text: 'Video'
              }
            }
          ]
        }
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': targetAudience.toUpperCase()
      }
    };

    const response = await fetch(`${this.baseUrl}/ugcPosts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      body: JSON.stringify(shareData)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to publish LinkedIn video post: ${errorData.message || 'Unknown error'}`);
    }

    const result = await response.json();
    return {
      id: result.id,
      activity: result.activity || result.id
    };
  }

  private async publishArticle(content: AdaptedContent): Promise<LinkedInShareResponse> {
    const title = content.platformSpecific?.title as string;
    const articleContent = content.platformSpecific?.content as string || content.text || '';
    
    if (!title) {
      throw new Error('Article posts require a title');
    }

    // LinkedIn articles are published differently - this is a simplified version
    // In practice, you'd use the LinkedIn Publishing API
    const shareData = {
      author: `urn:li:person:${this.profileId}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: {
            text: `${title}\n\n${articleContent}`
          },
          shareMediaCategory: 'ARTICLE'
        }
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
      }
    };

    const response = await fetch(`${this.baseUrl}/ugcPosts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      body: JSON.stringify(shareData)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to publish LinkedIn article: ${errorData.message || 'Unknown error'}`);
    }

    const result = await response.json();
    return {
      id: result.id,
      activity: result.activity || result.id
    };
  }

  private async registerImageUpload(): Promise<LinkedInMediaUploadResponse> {
    const response = await fetch(`${this.baseUrl}/assets?action=registerUpload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ['urn:li:digitalmedia:recipe:feedshare-image'],
          owner: `urn:li:person:${this.profileId}`,
          serviceRelationships: [
            {
              relationshipType: 'OWNER',
              identifier: 'urn:li:userGeneratedContent'
            }
          ]
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to register LinkedIn image upload: ${errorData.message || 'Unknown error'}`);
    }

    return await response.json();
  }

  private async registerVideoUpload(): Promise<LinkedInMediaUploadResponse> {
    const response = await fetch(`${this.baseUrl}/assets?action=registerUpload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ['urn:li:digitalmedia:recipe:feedshare-video'],
          owner: `urn:li:person:${this.profileId}`,
          serviceRelationships: [
            {
              relationshipType: 'OWNER',
              identifier: 'urn:li:userGeneratedContent'
            }
          ]
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to register LinkedIn video upload: ${errorData.message || 'Unknown error'}`);
    }

    return await response.json();
  }

  private async uploadImage(uploadUrl: string, imageUrl: string): Promise<void> {
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error('Failed to fetch image file');
    }

    const imageBuffer = await imageResponse.arrayBuffer();

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream'
      },
      body: imageBuffer
    });

    if (!response.ok) {
      throw new Error('Failed to upload image to LinkedIn');
    }
  }

  private async uploadVideo(uploadUrl: string, videoUrl: string): Promise<void> {
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new Error('Failed to fetch video file');
    }

    const videoBuffer = await videoResponse.arrayBuffer();

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream'
      },
      body: videoBuffer
    });

    if (!response.ok) {
      throw new Error('Failed to upload video to LinkedIn');
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