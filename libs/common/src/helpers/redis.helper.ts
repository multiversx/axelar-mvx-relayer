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

  sadd(key: string, ...values: string[]) {
    return this.redisCache.sadd(key, ...values);
  }

  smembers(key: string) {
    return this.redisCache.smembers(key);
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
}
