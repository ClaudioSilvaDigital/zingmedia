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
 * Mock AI Provider for testing and demonstration
 * This provider simulates AI responses without making external API calls
 */
export class MockAIProvider implements AIProviderInterface {
  public readonly id: string;
  public readonly name: string;
  public readonly capabilities: AICapability[] = [
    {
      type: 'text_generation',
      models: ['mock-text-v1', 'mock-text-v2'],
      maxTokens: 4000,
      rateLimits: {
        requestsPerMinute: 60,
        requestsPerHour: 1000,
        requestsPerDay: 10000
      }
    },
    {
      type: 'image_generation',
      models: ['mock-image-v1'],
      supportedFormats: ['png', 'jpg', 'webp'],
      rateLimits: {
        requestsPerMinute: 10,
        requestsPerHour: 100,
        requestsPerDay: 500
      }
    }
  ];

  private isAuthenticated: boolean = false;
  private requestCount: number = 0;
  private totalTokensUsed: number = 0;
  private totalCreditsConsumed: number = 0;

  constructor(id: string = 'mock-provider', name: string = 'Mock AI Provider') {
    this.id = id;
    this.name = name;
  }

  async authenticate(credentials: ProviderCredentials): Promise<boolean> {
    // Mock authentication - accept any API key that starts with 'mock-'
    if (credentials.apiKey && credentials.apiKey.startsWith('mock-')) {
      this.isAuthenticated = true;
      return true;
    }
    
    this.isAuthenticated = false;
    return false;
  }

  async generateContent(prompt: string, options: GenerationOptions): Promise<GeneratedContent> {
    if (!this.isAuthenticated) {
      throw new Error('Provider not authenticated');
    }

    // Simulate processing delay
    await this.delay(100 + Math.random() * 500);

    this.requestCount++;

    // Determine content type from options or default to text
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
      // Simulate health check delay
      await this.delay(50 + Math.random() * 100);
      
      const responseTime = Date.now() - startTime;
      
      // Simulate occasional health check failures (5% chance)
      const isHealthy = Math.random() > 0.05;
      
      return {
        providerId: this.id,
        isHealthy,
        responseTime,
        timestamp: new Date(),
        error: isHealthy ? undefined : 'Simulated health check failure'
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
    // Return mock usage metrics
    return {
      tokensUsed: this.totalTokensUsed,
      creditsConsumed: this.totalCreditsConsumed,
      requestCount: this.requestCount,
      processingTime: 250, // Average processing time in ms
      dataTransferred: this.requestCount * 1024 // Mock data transfer
    };
  }

  private async generateTextContent(prompt: string, options: GenerationOptions): Promise<GeneratedContent> {
    // Simulate token usage
    const tokensUsed = Math.floor(prompt.length / 4) + Math.floor(Math.random() * 500);
    this.totalTokensUsed += tokensUsed;
    this.totalCreditsConsumed += Math.ceil(tokensUsed / 1000);

    // Generate mock text response based on prompt
    const mockResponses = [
      `Based on your prompt "${prompt.substring(0, 50)}...", here's a creative response that demonstrates the AI provider's text generation capabilities. This content would be tailored to your specific requirements and brand voice.`,
      `Here's an engaging piece of content inspired by: "${prompt.substring(0, 50)}...". The AI has analyzed your prompt and generated relevant, high-quality text that aligns with your content strategy.`,
      `Generated content for: "${prompt.substring(0, 50)}...". This response showcases the provider's ability to understand context and create compelling, brand-appropriate content.`
    ];

    const selectedResponse = mockResponses[Math.floor(Math.random() * mockResponses.length)];
    
    // Apply options like max tokens
    let finalResponse = selectedResponse;
    if (options.maxTokens && finalResponse.length > options.maxTokens * 4) {
      finalResponse = finalResponse.substring(0, options.maxTokens * 4) + '...';
    }

    return {
      type: 'text',
      data: finalResponse,
      metadata: {
        model: options.model || 'mock-text-v1',
        tokensUsed,
        temperature: options.temperature || 0.7,
        promptLength: prompt.length
      }
    };
  }

  private async generateImageContent(prompt: string, options: GenerationOptions): Promise<GeneratedContent> {
    // Simulate credit usage for image generation
    const creditsUsed = 5; // Images cost more credits
    this.totalCreditsConsumed += creditsUsed;

    // Generate mock image URL (in real implementation, this would be actual image data)
    const mockImageUrl = `https://mock-ai-provider.com/generated-image/${Date.now()}.png`;
    
    return {
      type: 'image',
      data: mockImageUrl,
      urls: [mockImageUrl],
      format: options.format || 'png',
      metadata: {
        model: options.model || 'mock-image-v1',
        dimensions: options.dimensions || { width: 1024, height: 1024 },
        style: options.style || 'default',
        quality: options.quality || 'standard',
        promptLength: prompt.length,
        creditsUsed
      }
    };
  }

  private inferContentType(options: GenerationOptions): 'text' | 'image' | 'video' | 'avatar' | 'research' {
    // Infer content type from options
    if (options.dimensions || options.format === 'png' || options.format === 'jpg') {
      return 'image';
    }
    
    // Default to text
    return 'text';
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reset usage metrics (useful for testing)
   */
  resetUsage(): void {
    this.requestCount = 0;
    this.totalTokensUsed = 0;
    this.totalCreditsConsumed = 0;
  }

  /**
   * Simulate provider failure for testing
   */
  simulateFailure(): void {
    this.isAuthenticated = false;
  }

  /**
   * Get provider statistics
   */
  getStats(): { requestCount: number; tokensUsed: number; creditsConsumed: number } {
    return {
      requestCount: this.requestCount,
      tokensUsed: this.totalTokensUsed,
      creditsConsumed: this.totalCreditsConsumed
    };
  }
}