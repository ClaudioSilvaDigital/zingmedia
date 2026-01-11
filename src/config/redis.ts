import { createClient, RedisClientType } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
}

export const getRedisConfig = (): RedisConfig => {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: 0,
  };
};

export class RedisManager {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor(config?: RedisConfig) {
    const redisConfig = config || getRedisConfig();
    
    this.client = createClient({
      socket: {
        host: redisConfig.host,
        port: redisConfig.port,
      },
      password: redisConfig.password,
      database: redisConfig.db,
    });

    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      console.log('Redis Client Connected');
      this.isConnected = true;
    });
  }

  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
    }
  }

  async set(key: string, value: string, expireInSeconds?: number): Promise<void> {
    await this.connect();
    if (expireInSeconds) {
      await this.client.setEx(key, expireInSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    await this.connect();
    return await this.client.get(key);
  }

  async del(key: string): Promise<void> {
    await this.connect();
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    await this.connect();
    const result = await this.client.exists(key);
    return result === 1;
  }

  // Job queue methods
  async enqueue(queueName: string, job: object): Promise<void> {
    await this.connect();
    await this.client.lPush(queueName, JSON.stringify(job));
  }

  async dequeue(queueName: string): Promise<object | null> {
    await this.connect();
    const result = await this.client.rPop(queueName);
    return result ? JSON.parse(result) : null;
  }

  async getQueueLength(queueName: string): Promise<number> {
    await this.connect();
    return await this.client.lLen(queueName);
  }
}

export const redis = new RedisManager();