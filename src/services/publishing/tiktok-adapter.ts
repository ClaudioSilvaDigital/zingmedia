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

interface TikTokVideoUploadResponse {
  data: {
    video: {
      video_id: string;
      upload_url: string;
    };
  };
}

interface TikTokPublishResponse {
  data: {
    video_id: string;
    share_id: string;
  };
}

export class TikTokAdapter extends PlatformAdapter {
  private readonly baseUrl = 'https://open-api.tiktok.com';

  constructor(credentials: PlatformCredentials) {
    super('tiktok', credentials);
  }

  async authenticate(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/v2/user/info/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.credentials.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: ['open_id', 'union_id', 'avatar_url', 'display_name']
        })
      });

      const data = await response.json();
      
      if (response.ok && data.data && data.data.user) {
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('TikTok authentication failed:', error);
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

      // TikTok requires video content
      if (!content.mediaUrls || content.mediaUrls.length === 0) {
        return {
          success: false,
          error: 'TikTok requires video content',
          retryable: false
        };
      }

      const videoUrl = content.mediaUrls[0];
      
      // Step 1: Initialize video upload
      const uploadResponse = await this.initializeVideoUpload();
      
      // Step 2: Upload video file
      await this.uploadVideoFile(uploadResponse.data.video.upload_url, videoUrl);
      
      // Step 3: Publish video
      const publishResult = await this.publishVideo(
        uploadResponse.data.video.video_id,
        content
      );

      return {
        success: true,
        platformPostId: publishResult.data.share_id,
        publishedAt: new Date(),
        metadata: {
          videoId: publishResult.data.video_id,
          shareId: publishResult.data.share_id
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

    // Validate video presence
    if (!content.mediaUrls || content.mediaUrls.length === 0) {
      errors.push({
        field: 'mediaUrls',
        message: 'TikTok posts require a video file',
        code: 'MISSING_VIDEO'
      });
    } else {
      // Validate video format
      const videoUrl = content.mediaUrls[0];
      const isValidFormat = requirements.videoFormats?.some(format => 
        videoUrl.toLowerCase().includes(`.${format}`)
      );
      
      if (!isValidFormat) {
        errors.push({
          field: 'mediaUrls',
          message: `Invalid video format. Supported: ${requirements.videoFormats?.join(', ')}`,
          code: 'INVALID_VIDEO_FORMAT'
        });
      }
    }

    // Validate duration
    const duration = content.platformSpecific?.duration as number;
    if (duration && requirements.videoMaxDuration && duration > requirements.videoMaxDuration) {
      errors.push({
        field: 'duration',
        message: `Video duration exceeds maximum of ${requirements.videoMaxDuration} seconds`,
        code: 'VIDEO_TOO_LONG'
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

    // Validate privacy setting
    const privacy = content.platformSpecific?.privacy as string;
    if (privacy && !['public', 'friends', 'private'].includes(privacy)) {
      errors.push({
        field: 'privacy',
        message: 'Invalid privacy setting. Must be public, friends, or private',
        code: 'INVALID_PRIVACY'
      });
    }

    // Validate text content length (TikTok description)
    if (content.text && requirements.maxTextLength && content.text.length > requirements.maxTextLength) {
      errors.push({
        field: 'text',
        message: `Description exceeds maximum length of ${requirements.maxTextLength} characters`,
        code: 'DESCRIPTION_TOO_LONG'
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
      hashtagLimit: 20,
      videoMaxDuration: 180, // 3 minutes
      videoFormats: ['mp4', 'mov', 'avi'],
      maxFileSize: 500 * 1024 * 1024, // 500MB
      requiredFields: ['mediaUrls', 'privacy']
    };
  }

  async checkHealth(): Promise<PlatformHealthCheck> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(`${this.baseUrl}/v2/user/info/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.credentials.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: ['open_id']
        })
      });
      
      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        const rateLimitRemaining = response.headers.get('x-rate-limit-remaining') 
          ? parseInt(response.headers.get('x-rate-limit-remaining')!)
          : undefined;

        const rateLimitReset = response.headers.get('x-rate-limit-reset')
          ? new Date(parseInt(response.headers.get('x-rate-limit-reset')!) * 1000)
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
      const response = await fetch(`${this.baseUrl}/v2/oauth/token/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.credentials.refreshToken,
          client_key: this.credentials.appId!,
          client_secret: this.credentials.appSecret!
        })
      });

      if (!response.ok) {
        throw new Error('Failed to refresh TikTok credentials');
      }

      const data = await response.json();
      
      const newCredentials: PlatformCredentials = {
        ...this.credentials,
        accessToken: data.data.access_token,
        refreshToken: data.data.refresh_token || this.credentials.refreshToken
      };

      this.updateCredentials(newCredentials);
      return newCredentials;
    } catch (error) {
      throw new Error(`Failed to refresh TikTok credentials: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async initializeVideoUpload(): Promise<TikTokVideoUploadResponse> {
    const response = await fetch(`${this.baseUrl}/v2/post/video/init/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: 0 // Will be updated during actual upload
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to initialize TikTok video upload: ${errorData.error?.message || 'Unknown error'}`);
    }

    return await response.json();
  }

  private async uploadVideoFile(uploadUrl: string, videoUrl: string): Promise<void> {
    // In a real implementation, you would fetch the video file and upload it
    // For now, we'll simulate the upload process
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4'
      },
      body: await this.fetchVideoFile(videoUrl)
    });

    if (!response.ok) {
      throw new Error('Failed to upload video file to TikTok');
    }
  }

  private async fetchVideoFile(videoUrl: string): Promise<ArrayBuffer> {
    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error('Failed to fetch video file');
    }
    return await response.arrayBuffer();
  }

  private async publishVideo(videoId: string, content: AdaptedContent): Promise<TikTokPublishResponse> {
    const hashtags = content.platformSpecific?.hashtags as string[] || [];
    const privacy = content.platformSpecific?.privacy as string || 'public';
    const effects = content.platformSpecific?.effects as string[] || [];
    const sounds = content.platformSpecific?.sounds as string[] || [];

    let description = content.text || '';
    if (hashtags.length > 0) {
      description += ' ' + hashtags.map(tag => tag.startsWith('#') ? tag : `#${tag}`).join(' ');
    }

    const publishData = {
      video_id: videoId,
      post_info: {
        title: description,
        privacy_level: privacy.toUpperCase(),
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000
      },
      source_info: {
        source: 'FILE_UPLOAD'
      }
    };

    // Add effects and sounds if provided
    if (effects.length > 0) {
      publishData.post_info = {
        ...publishData.post_info,
        ...{ brand_content_toggle: false }
      };
    }

    const response = await fetch(`${this.baseUrl}/v2/post/video/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(publishData)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to publish TikTok video: ${errorData.error?.message || 'Unknown error'}`);
    }

    return await response.json();
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