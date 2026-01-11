import { v4 as uuidv4 } from 'uuid';
import {
  Content,
  ContentData,
  AdaptedContent,
  Platform,
  AIRequest,
  GenerationOptions,
  TenantContext,
  Briefing
} from '../types/index.js';
import { AIIntegrationHub } from './ai-hub.js';
import { BriefingService } from './briefing.js';
import { BestPracticesService } from './best-practices.js';
import { DatabasePool } from '../interfaces/database.js';

export interface ContentGenerationRequest {
  briefingId: string;
  contentType: 'text' | 'image' | 'video' | 'carousel';
  title: string;
  description?: string;
  targetPlatforms: Platform[];
  generationOptions?: GenerationOptions;
  brandVoiceGuidelines?: string[];
  bestPractices?: string[];
}

export interface PlatformRequirements {
  maxTextLength?: number;
  aspectRatio?: string;
  mediaType?: string;
  hashtagLimit?: number;
  videoMaxDuration?: number;
  imageFormats?: string[];
  videoFormats?: string[];
}

export class ContentGenerationService {
  private db: DatabasePool;
  private aiHub: AIIntegrationHub;
  private briefingService: BriefingService;
  private bestPracticesService: BestPracticesService;
  private platformRequirements: Map<Platform, PlatformRequirements>;

  constructor(db: DatabasePool) {
    this.db = db;
    this.aiHub = new AIIntegrationHub(db);
    this.briefingService = new BriefingService(db);
    this.bestPracticesService = new BestPracticesService(db);
    this.initializePlatformRequirements();
  }

  private initializePlatformRequirements(): void {
    this.platformRequirements = new Map([
      ['instagram', {
        maxTextLength: 2200,
        aspectRatio: '1:1,4:5,9:16',
        mediaType: 'photo,video,carousel',
        hashtagLimit: 30,
        videoMaxDuration: 60,
        imageFormats: ['jpg', 'png'],
        videoFormats: ['mp4', 'mov']
      }],
      ['tiktok', {
        maxTextLength: 150,
        aspectRatio: '9:16',
        mediaType: 'video',
        hashtagLimit: 100,
        videoMaxDuration: 180,
        videoFormats: ['mp4', 'mov', 'avi']
      }],
      ['facebook', {
        maxTextLength: 63206,
        aspectRatio: '1:1,16:9,4:5',
        mediaType: 'photo,video,link',
        hashtagLimit: 30,
        videoMaxDuration: 240,
        imageFormats: ['jpg', 'png', 'gif'],
        videoFormats: ['mp4', 'mov']
      }],
      ['linkedin', {
        maxTextLength: 3000,
        aspectRatio: '1:1,16:9',
        mediaType: 'photo,video,article',
        hashtagLimit: 30,
        videoMaxDuration: 600,
        imageFormats: ['jpg', 'png'],
        videoFormats: ['mp4', 'mov']
      }]
    ]);
  }

  async generateContent(
    request: ContentGenerationRequest,
    tenantContext: TenantContext
  ): Promise<Content> {
    // Validate briefing exists and is active (Requirement 14.1)
    const briefing = await this.briefingService.getBriefing(request.briefingId, tenantContext);
    if (!briefing || briefing.status !== 'active') {
      throw new Error('Content generation requires an active briefing');
    }

    // Generate base content using AI (Requirement 14.1)
    const baseContent = await this.generateBaseContent(request, briefing, tenantContext);

    // Adapt content for each target platform (Requirement 14.2)
    const adaptedContent: Record<Platform, AdaptedContent> = {};
    for (const platform of request.targetPlatforms) {
      adaptedContent[platform] = await this.adaptContentForPlatform(
        baseContent, 
        platform, 
        request.brandVoiceGuidelines || [],
        request.bestPractices || []
      );
    }

    // Create content record
    const content: Omit<Content, 'id' | 'workflowId' | 'createdAt' | 'updatedAt'> = {
      briefingId: request.briefingId,
      title: request.title,
      description: request.description || '',
      contentType: request.contentType,
      baseContent,
      adaptedContent,
      tenantId: tenantContext.tenantId,
      clientId: briefing.clientId,
      createdBy: tenantContext.user.id
    };

    return content as Content;
  }

  private async generateBaseContent(
    request: ContentGenerationRequest,
    briefing: Briefing,
    tenantContext: TenantContext
  ): Promise<ContentData> {
    // Get brand voice guidelines and best practices (Requirement 14.3)
    const brandVoiceGuidelines = await this.bestPracticesService.formatBrandVoiceForPrompt(tenantContext);
    const bestPractices = await this.bestPracticesService.formatBestPracticesForPrompt(
      request.contentType,
      'engagement', // Default objective
      tenantContext
    );

    // Build comprehensive prompt with briefing context and brand voice (Requirement 14.3)
    const prompt = this.buildGenerationPrompt(
      request, 
      briefing, 
      brandVoiceGuidelines, 
      bestPractices
    );

    // Create AI request
    const aiRequest: AIRequest = {
      id: uuidv4(),
      type: request.contentType === 'carousel' ? 'text' : request.contentType,
      prompt,
      options: {
        ...request.generationOptions,
        format: this.getContentFormat(request.contentType),
        metadata: {
          briefingId: briefing.id,
          contentType: request.contentType,
          targetPlatforms: request.targetPlatforms
        }
      },
      tenantId: tenantContext.tenantId,
      userId: tenantContext.user.id,
      briefingId: briefing.id,
      createdAt: new Date()
    };

    // Route request through AI hub
    const aiResponse = await this.aiHub.routeRequest(aiRequest);

    if (aiResponse.status === 'error') {
      throw new Error(`Content generation failed: ${aiResponse.error}`);
    }

    // Convert AI response to ContentData
    return this.convertAIResponseToContentData(aiResponse.content, request.contentType);
  }

  private buildGenerationPrompt(
    request: ContentGenerationRequest,
    briefing: Briefing,
    brandVoiceGuidelines: string[],
    bestPractices: string[]
  ): string {
    const briefingContext = this.extractBriefingContext(briefing);

    let prompt = `Generate ${request.contentType} content with the following requirements:\n\n`;
    
    prompt += `BRIEFING CONTEXT:\n${briefingContext}\n\n`;
    
    if (brandVoiceGuidelines.length > 0) {
      prompt += `BRAND VOICE GUIDELINES:\n${brandVoiceGuidelines.join('\n')}\n\n`;
    }
    
    if (bestPractices.length > 0) {
      prompt += `BEST PRACTICES:\n${bestPractices.join('\n')}\n\n`;
    }
    
    prompt += `TARGET PLATFORMS: ${request.targetPlatforms.join(', ')}\n\n`;
    prompt += `CONTENT TITLE: ${request.title}\n`;
    
    if (request.description) {
      prompt += `CONTENT DESCRIPTION: ${request.description}\n`;
    }

    // Add content type specific instructions
    switch (request.contentType) {
      case 'text':
        prompt += '\nGenerate engaging text content that follows the brand voice and best practices.';
        break;
      case 'image':
        prompt += '\nGenerate a detailed image description that can be used for image generation.';
        break;
      case 'video':
        prompt += '\nGenerate a video script with scene descriptions, dialogue, and visual elements.';
        break;
      case 'carousel':
        prompt += '\nGenerate content for a multi-slide carousel with titles and descriptions for each slide.';
        break;
    }

    return prompt;
  }

  private extractBriefingContext(briefing: Briefing): string {
    const fields = briefing.fields;
    let context = `Title: ${briefing.title}\n`;
    context += `Type: ${briefing.type}\n`;
    
    // Extract key fields from briefing
    Object.entries(fields).forEach(([key, value]) => {
      if (value && typeof value === 'string' && value.trim()) {
        context += `${key}: ${value}\n`;
      }
    });

    return context;
  }

  private getContentFormat(contentType: string): string {
    switch (contentType) {
      case 'text':
        return 'text/plain';
      case 'image':
        return 'image/description';
      case 'video':
        return 'video/script';
      case 'carousel':
        return 'application/json';
      default:
        return 'text/plain';
    }
  }

  private convertAIResponseToContentData(
    generatedContent: any,
    contentType: string
  ): ContentData {
    const baseData: ContentData = {
      metadata: {
        generatedAt: new Date().toISOString(),
        contentType
      }
    };

    switch (contentType) {
      case 'text':
        return {
          ...baseData,
          text: typeof generatedContent.data === 'string' ? generatedContent.data : JSON.stringify(generatedContent.data)
        };
      
      case 'image':
        return {
          ...baseData,
          text: generatedContent.data, // Image description
          metadata: {
            ...baseData.metadata,
            imageDescription: generatedContent.data,
            format: generatedContent.format
          }
        };
      
      case 'video':
        return {
          ...baseData,
          text: generatedContent.data, // Video script
          metadata: {
            ...baseData.metadata,
            videoScript: generatedContent.data,
            format: generatedContent.format
          }
        };
      
      case 'carousel':
        const carouselData = typeof generatedContent.data === 'string' ? 
          JSON.parse(generatedContent.data) : generatedContent.data;
        return {
          ...baseData,
          text: JSON.stringify(carouselData),
          metadata: {
            ...baseData.metadata,
            slides: carouselData,
            slideCount: Array.isArray(carouselData) ? carouselData.length : 0
          }
        };
      
      default:
        return {
          ...baseData,
          text: String(generatedContent.data)
        };
    }
  }

  async adaptContentForPlatform(
    baseContent: ContentData,
    platform: Platform,
    brandVoiceGuidelines: string[],
    bestPractices: string[]
  ): Promise<AdaptedContent> {
    const requirements = this.platformRequirements.get(platform);
    if (!requirements) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    // Create platform-specific adaptation
    const adaptedContent: AdaptedContent = {
      text: baseContent.text,
      mediaUrls: baseContent.mediaUrls || [],
      metadata: {
        ...baseContent.metadata,
        platform,
        adaptedAt: new Date().toISOString()
      },
      platformSpecific: {}
    };

    // Apply platform-specific adaptations (Requirement 7.2, 14.2)
    switch (platform) {
      case 'instagram':
        adaptedContent.platformSpecific = await this.adaptForInstagram(baseContent, requirements);
        break;
      case 'tiktok':
        adaptedContent.platformSpecific = await this.adaptForTikTok(baseContent, requirements);
        break;
      case 'facebook':
        adaptedContent.platformSpecific = await this.adaptForFacebook(baseContent, requirements);
        break;
      case 'linkedin':
        adaptedContent.platformSpecific = await this.adaptForLinkedIn(baseContent, requirements);
        break;
    }

    // Apply text length restrictions
    if (adaptedContent.text && requirements.maxTextLength) {
      adaptedContent.text = this.truncateText(adaptedContent.text, requirements.maxTextLength);
    }

    return adaptedContent;
  }

  private async adaptForInstagram(
    baseContent: ContentData,
    requirements: PlatformRequirements
  ): Promise<Record<string, any>> {
    return {
      aspectRatio: '1:1', // Default to square
      mediaType: 'photo',
      caption: baseContent.text || '',
      hashtags: this.extractHashtags(baseContent.text || '', requirements.hashtagLimit || 30),
      location: null
    };
  }

  private async adaptForTikTok(
    baseContent: ContentData,
    requirements: PlatformRequirements
  ): Promise<Record<string, any>> {
    return {
      videoFile: '', // Will be populated during media generation
      duration: Math.min(60, requirements.videoMaxDuration || 60),
      effects: [],
      sounds: [],
      hashtags: this.extractHashtags(baseContent.text || '', requirements.hashtagLimit || 100),
      privacy: 'public'
    };
  }

  private async adaptForFacebook(
    baseContent: ContentData,
    requirements: PlatformRequirements
  ): Promise<Record<string, any>> {
    return {
      postType: 'update',
      content: baseContent.text || '',
      mediaUrls: baseContent.mediaUrls || [],
      targetAudience: 'public'
    };
  }

  private async adaptForLinkedIn(
    baseContent: ContentData,
    requirements: PlatformRequirements
  ): Promise<Record<string, any>> {
    return {
      postType: 'update',
      title: this.extractTitle(baseContent.text || ''),
      content: baseContent.text || '',
      mediaUrls: baseContent.mediaUrls || [],
      targetAudience: 'public'
    };
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

  private extractHashtags(text: string, limit: number): string[] {
    const hashtagRegex = /#[\w]+/g;
    const matches = text.match(hashtagRegex) || [];
    return matches.slice(0, limit);
  }

  private extractTitle(text: string): string {
    // Extract first sentence or first 100 characters as title
    const firstSentence = text.split('.')[0];
    return firstSentence.length > 100 ? 
      firstSentence.substring(0, 97) + '...' : 
      firstSentence;
  }

  async validatePlatformRequirements(
    content: AdaptedContent,
    platform: Platform
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const requirements = this.platformRequirements.get(platform);
    if (!requirements) {
      return { isValid: false, errors: [`Unsupported platform: ${platform}`] };
    }

    const errors: string[] = [];

    // Validate text length
    if (content.text && requirements.maxTextLength && content.text.length > requirements.maxTextLength) {
      errors.push(`Text exceeds maximum length of ${requirements.maxTextLength} characters`);
    }

    // Validate hashtag count
    const hashtags = this.extractHashtags(content.text || '', 1000);
    if (requirements.hashtagLimit && hashtags.length > requirements.hashtagLimit) {
      errors.push(`Too many hashtags: ${hashtags.length} (max: ${requirements.hashtagLimit})`);
    }

    // Platform-specific validations
    if (content.platformSpecific) {
      switch (platform) {
        case 'tiktok':
          if (content.platformSpecific.duration && requirements.videoMaxDuration && 
              content.platformSpecific.duration > requirements.videoMaxDuration) {
            errors.push(`Video duration exceeds maximum of ${requirements.videoMaxDuration} seconds`);
          }
          break;
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  getPlatformRequirements(platform: Platform): PlatformRequirements | undefined {
    return this.platformRequirements.get(platform);
  }

  getSupportedPlatforms(): Platform[] {
    return Array.from(this.platformRequirements.keys());
  }
}