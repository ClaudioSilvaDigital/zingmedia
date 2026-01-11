import { Platform } from '../../types/index.js';
import { PlatformAdapter, PlatformCredentials } from './platform-adapter.js';
import { InstagramAdapter } from './instagram-adapter.js';
import { TikTokAdapter } from './tiktok-adapter.js';
import { FacebookAdapter } from './facebook-adapter.js';
import { LinkedInAdapter } from './linkedin-adapter.js';

export class PlatformAdapterRegistry {
  private adapters: Map<string, PlatformAdapter> = new Map();

  registerAdapter(platform: Platform, credentials: PlatformCredentials): PlatformAdapter {
    let adapter: PlatformAdapter;

    switch (platform) {
      case 'instagram':
        adapter = new InstagramAdapter(credentials);
        break;
      case 'tiktok':
        adapter = new TikTokAdapter(credentials);
        break;
      case 'facebook':
        adapter = new FacebookAdapter(credentials);
        break;
      case 'linkedin':
        adapter = new LinkedInAdapter(credentials);
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    const key = this.getAdapterKey(platform, credentials);
    this.adapters.set(key, adapter);
    return adapter;
  }

  getAdapter(platform: Platform, credentials: PlatformCredentials): PlatformAdapter | undefined {
    const key = this.getAdapterKey(platform, credentials);
    return this.adapters.get(key);
  }

  removeAdapter(platform: Platform, credentials: PlatformCredentials): boolean {
    const key = this.getAdapterKey(platform, credentials);
    return this.adapters.delete(key);
  }

  getSupportedPlatforms(): Platform[] {
    return ['instagram', 'tiktok', 'facebook', 'linkedin'];
  }

  async testAllAdapters(): Promise<Record<Platform, boolean>> {
    const results: Record<Platform, boolean> = {} as Record<Platform, boolean>;
    
    for (const [key, adapter] of this.adapters) {
      const platform = adapter.getPlatform();
      try {
        results[platform] = await adapter.authenticate();
      } catch (error) {
        console.error(`Authentication failed for ${platform}:`, error);
        results[platform] = false;
      }
    }

    return results;
  }

  async healthCheckAll(): Promise<Record<string, any>> {
    const results: Record<string, any> = {};
    
    for (const [key, adapter] of this.adapters) {
      const platform = adapter.getPlatform();
      try {
        results[key] = await adapter.checkHealth();
      } catch (error) {
        results[key] = {
          isHealthy: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date()
        };
      }
    }

    return results;
  }

  clearAll(): void {
    this.adapters.clear();
  }

  getAdapterCount(): number {
    return this.adapters.size;
  }

  getAvailableAdapters(): Platform[] {
    const platforms: Platform[] = [];
    for (const [key, adapter] of this.adapters) {
      platforms.push(adapter.getPlatform());
    }
    return [...new Set(platforms)]; // Remove duplicates
  }

  private getAdapterKey(platform: Platform, credentials: PlatformCredentials): string {
    // Create a unique key based on platform and some credential identifier
    // In production, you might want to hash the credentials for security
    const credentialHash = this.hashCredentials(credentials);
    return `${platform}:${credentialHash}`;
  }

  private hashCredentials(credentials: PlatformCredentials): string {
    // Simple hash for demo purposes - in production use proper hashing
    const key = credentials.accessToken.substring(0, 8) + 
                (credentials.appId || '').substring(0, 4);
    return Buffer.from(key).toString('base64').substring(0, 12);
  }
}