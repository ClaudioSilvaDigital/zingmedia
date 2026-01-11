import {
  AdaptedContent,
  Platform,
  ValidationResult,
  TenantContext
} from '../../types/index.js';

export interface PlatformCredentials {
  accessToken: string;
  refreshToken?: string;
  appId?: string;
  appSecret?: string;
  additionalCredentials?: Record<string, string>;
}

export interface PublishResult {
  success: boolean;
  platformPostId?: string;
  publishedAt?: Date;
  error?: string;
  retryable?: boolean;
  metadata?: Record<string, any>;
}

export interface ContentRequirements {
  maxTextLength?: number;
  hashtagLimit?: number;
  videoMaxDuration?: number; // in seconds
  imageFormats?: string[];
  videoFormats?: string[];
  aspectRatios?: string[];
  maxFileSize?: number; // in bytes
  requiredFields?: string[];
}

export interface PlatformHealthCheck {
  isHealthy: boolean;
  responseTime: number;
  timestamp: Date;
  error?: string;
  rateLimitRemaining?: number;
  rateLimitReset?: Date;
}

export abstract class PlatformAdapter {
  protected platform: Platform;
  protected credentials: PlatformCredentials;

  constructor(platform: Platform, credentials: PlatformCredentials) {
    this.platform = platform;
    this.credentials = credentials;
  }

  abstract authenticate(): Promise<boolean>;
  abstract publish(content: AdaptedContent, tenantContext: TenantContext): Promise<PublishResult>;
  abstract validateContent(content: AdaptedContent): Promise<ValidationResult>;
  abstract getRequirements(): ContentRequirements;
  abstract checkHealth(): Promise<PlatformHealthCheck>;
  abstract refreshCredentials(): Promise<PlatformCredentials>;

  getPlatform(): Platform {
    return this.platform;
  }

  updateCredentials(credentials: PlatformCredentials): void {
    this.credentials = credentials;
  }
}