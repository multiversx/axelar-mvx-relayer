import { CacheModule, RedisCacheModule, RedisCacheModuleOptions } from '@multiversx/sdk-nestjs-cache';
import { DynamicModule } from '@nestjs/common';
import { ApiConfigModule, ApiConfigService } from '../config';

export class DynamicModuleUtils {
  static getCacheModule(): DynamicModule {
    return CacheModule.forRootAsync({
      imports: [ApiConfigModule],
      useFactory: (apiConfigService: ApiConfigService) =>
        new RedisCacheModuleOptions(
          {
            host: apiConfigService.getRedisUrl(),
            port: apiConfigService.getRedisPort(),
          },
          {
            poolLimit: apiConfigService.getPoolLimit(),
            processTtl: apiConfigService.getProcessTtl(),
          },
        ),
      inject: [ApiConfigService],
    });
  }

  static getRedisCacheModule(): DynamicModule {
    return RedisCacheModule.forRootAsync({
      imports: [ApiConfigModule],
      useFactory: (apiConfigService: ApiConfigService) =>
        new RedisCacheModuleOptions(
          {
            host: apiConfigService.getRedisUrl(),
            port: apiConfigService.getRedisPort(),
          },
          {
            poolLimit: apiConfigService.getPoolLimit(),
            processTtl: apiConfigService.getProcessTtl(),
          },
        ),
      inject: [ApiConfigService],
    });
  }
}
