import { AIProviderInterface } from '../../types';
import { MockAIProvider } from './mock-provider';
import { OpenAIProvider } from './openai-provider';

/**
 * Registry for AI provider implementations
 * Manages available provider types and their instantiation
 */
export class ProviderRegistry {
  private static providers: Map<string, () => AIProviderInterface> = new Map();

  static {
    // Register built-in providers
    this.registerProvider('mock', () => new MockAIProvider());
    this.registerProvider('openai', () => new OpenAIProvider());
  }

  /**
   * Register a new provider type
   */
  static registerProvider(type: string, factory: () => AIProviderInterface): void {
    this.providers.set(type.toLowerCase(), factory);
  }

  /**
   * Create a provider instance by type
   */
  static createProvider(type: string): AIProviderInterface | null {
    const factory = this.providers.get(type.toLowerCase());
    if (!factory) {
      return null;
    }

    try {
      return factory();
    } catch (error) {
      console.error(`Error creating provider ${type}:`, error);
      return null;
    }
  }

  /**
   * Get all available provider types
   */
  static getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if a provider type is supported
   */
  static isProviderSupported(type: string): boolean {
    return this.providers.has(type.toLowerCase());
  }

  /**
   * Get provider capabilities by type
   */
  static getProviderCapabilities(type: string): string[] {
    const provider = this.createProvider(type);
    if (!provider) {
      return [];
    }

    return provider.capabilities.map(cap => cap.type);
  }
}

export { MockAIProvider, OpenAIProvider };