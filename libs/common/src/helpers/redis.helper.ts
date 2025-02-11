import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT_TOKEN } from '@multiversx/sdk-nestjs-redis/lib/entities/common.constants';
import { RedisCacheService } from '@multiversx/sdk-nestjs-cache';
import { MetricsService, PerformanceProfiler } from '@multiversx/sdk-nestjs-monitoring';

@Injectable()
export class RedisHelper {
  private readonly logger: Logger;

  constructor(
    @Inject(REDIS_CLIENT_TOKEN) private readonly redis: Redis,
    private readonly redisCache: RedisCacheService,
    private readonly metricsService: MetricsService,
  ) {
    this.logger = new Logger(RedisHelper.name);
  }

  get<T>(key: string): Promise<T | undefined> {
    return this.redisCache.get<T>(key);
  }

  set<T>(key: string, value: T, ttl?: number | null) {
    return this.redisCache.set<T>(key, value, ttl);
  }

  sadd(key: string, ...values: string[]) {
    return this.redisCache.sadd(key, ...values);
  }

  smembers(key: string) {
    return this.redisCache.smembers(key);
  }

  scan(key: string) {
    return this.redisCache.scan(key);
  }

  async srem(key: string, ...values: string[]) {
    const performanceProfiler = new PerformanceProfiler();
    try {
      return await this.redis.srem(key, ...values);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(
          'An error occurred while trying to srem redis.',
          Object.assign(
            {
              exception: error === null || error === void 0 ? void 0 : error.toString(),
              key,
            },
          ),
        );
      }
      throw error;
    } finally {
      performanceProfiler.stop();
      this.metricsService.setRedisDuration('SREM', performanceProfiler.duration);
    }
  }

  async getDel<T>(key: string): Promise<T | undefined> {
    try {
      const data = await this.redis.getdel(key);
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error('RedisCache - An error occurred while trying to getdel from redis cache.', {
          cacheKey: key,
          error: error?.toString(),
        });
      }
    }
    return undefined;
  }
}
