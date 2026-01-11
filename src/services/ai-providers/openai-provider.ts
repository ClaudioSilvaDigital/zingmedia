import { 
  AIProviderInterface, 
  AICapability, 
  ProviderCredentials, 
  GeneratedContent, 
  GenerationOptions, 
  HealthCheck, 
  UsageMetrics 
} from '../../types';

/**
 * OpenAI Provider Implementation
 * Integrates with OpenAI's API for text and image generation
 */
export class OpenAIProvider implements AIProviderInterface {
  public readonly id: string = 'openai';
  public readonly name: string = 'OpenAI';
  public readonly capabilities: AICapability[] = [
    {
      type: 'text_generation',
      models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
      maxTokens: 4096,
      rateLimits: {
        requestsPerMinute: 500,
        requestsPerHour: 10000,
        requestsPerDay: 100000
      }
    },
    {
      type: 'image_generation',
      models: ['dall-e-3', 'dall-e-2'],
      supportedFormats: ['png'],
      rateLimits: {
        requestsPerMinute: 50,
        requestsPerHour: 500,
        requestsPerDay: 2000
      }
    }
  ];

  private apiKey: string = '';
  private baseUrl: string = 'https://api.openai.com/v1';
  private isAuthenticated: boolean = false;

  async authenticate(credentials: ProviderCredentials): Promise<boolean> {
    try {
      this.apiKey = credentials.apiKey;
      
      // Test authentication by making a simple API call
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        this.isAuthenticated = true;
        return true;
      } else {
        this.isAuthenticated = false;
        return false;
      }
    } catch (error) {
      console.error('OpenAI authentication error:', error);
      this.isAuthenticated = false;
      return false;
    }
  }

  async generateContent(prompt: string, options: GenerationOptions): Promise<GeneratedContent> {
    if (!this.isAuthenticated) {
      throw new Error('OpenAI provider not authenticated');
    }

    const contentType = this.inferContentType(options);
    
    switch (contentType) {
      case 'text':
        return this.generateTextContent(prompt, options);
      case 'image':
        return this.generateImageContent(prompt, options);
      default:
        throw new Error(`Unsupported content type: ${contentType}`);
    }
  }

  async checkHealth(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      const responseTime = Date.now() - startTime;
      const isHealthy = response.ok;

      return {
        providerId: this.id,
        isHealthy,
        responseTime,
        timestamp: new Date(),
        error: isHealthy ? undefined : `HTTP ${response.status}: ${response.statusText}`
      };
    } catch (error) {
      return {
        providerId: this.id,
        isHealthy: false,
        responseTime: Date.now() - startTime,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getUsage(tenantId: string, timeRange?: { start: Date; end: Date }): Promise<UsageMetrics> {
    // Note: OpenAI doesn't provide usage metrics via API in real-time
    // This would typically be tracked internally by the platform
    return {
      tokensUsed: 0,
      creditsConsumed: 0,
      requestCount: 0,
      processingTime: 0,
      dataTransferred: 0
    };
  }

  private async generateTextContent(prompt: string, options: GenerationOptions): Promise<GeneratedContent> {
    try {
      const model = options.model || 'gpt-3.5-turbo';
      const maxTokens = options.maxTokens || 1000;
      const temperature = options.temperature || 0.7;

      const requestBody = {
        model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: maxTokens,
        temperature,
        top_p: options.topP || 1.0
      };

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content || '';
      const usage = data.usage || {};

      return {
        type: 'text',
        data: content,
        metadata: {
          model,
          tokensUsed: usage.total_tokens || 0,
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          temperature,
          topP: options.topP || 1.0,
          finishReason: data.choices[0]?.finish_reason
        }
      };
    } catch (error) {
      console.error('OpenAI text generation error:', error);
      throw new Error(`Failed to generate text content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async generateImageContent(prompt: string, options: GenerationOptions): Promise<GeneratedContent> {
    try {
      const model = options.model || 'dall-e-3';
      const size = this.mapDimensionsToSize(options.dimensions);
      const quality = options.quality || 'standard';

      const requestBody = {
        model,
        prompt,
        n: 1,
        size,
        quality,
        response_format: 'url'
      };

      const response = await fetch(`${this.baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const imageUrl = data.data[0]?.url;

      if (!imageUrl) {
        throw new Error('No image URL returned from OpenAI');
      }

      return {
        type: 'image',
        data: imageUrl,
        urls: [imageUrl],
        format: 'png',
        metadata: {
          model,
          size,
          quality,
          revisedPrompt: data.data[0]?.revised_prompt,
          promptLength: prompt.length
        }
      };
    } catch (error) {
      console.error('OpenAI image generation error:', error);
      throw new Error(`Failed to generate image content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private inferContentType(options: GenerationOptions): 'text' | 'image' {
    // Check if image-specific options are provided
    if (options.dimensions || options.quality || options.style) {
      return 'image';
    }

    // Check if model is image-specific
    if (options.model && (options.model.includes('dall-e') || options.model.includes('image'))) {
      return 'image';
    }

    // Default to text
    return 'text';
  }

  private mapDimensionsToSize(dimensions?: { width: number; height: number }): string {
    if (!dimensions) {
      return '1024x1024';
    }

    const { width, height } = dimensions;

    // Map to OpenAI's supported sizes
    if (width === 1024 && height === 1024) return '1024x1024';
    if (width === 1792 && height === 1024) return '1792x1024';
    if (width === 1024 && height === 1792) return '1024x1792';

    // Default to square if dimensions don't match supported sizes
    return '1024x1024';
  }
}