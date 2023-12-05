import { CacheModule, RedisCacheModuleOptions } from '@multiversx/sdk-nestjs-cache';
import { DynamicModule, Provider } from '@nestjs/common';
import { ClientOptions, ClientProxyFactory, Transport } from '@nestjs/microservices';
import { ApiConfigModule, ApiConfigService } from '../config';

export class DynamicModuleUtils {
  static getCachingModule(configuration: () => Record<string, any>): DynamicModule {
    return CacheModule.forRootAsync({
      imports: [ApiConfigModule.forRoot(configuration)],
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

  static getPubSubService(): Provider {
    return {
      provide: 'PUBSUB_SERVICE',
      useFactory: (apiConfigService: ApiConfigService) => {
        const clientOptions: ClientOptions = {
          transport: Transport.REDIS,
          options: {
            host: apiConfigService.getRedisUrl(),
            port: 6379,
            retryDelay: 1000,
            retryAttempts: 10,
            retryStrategy: () => 1000,
          },
        };

        return ClientProxyFactory.create(clientOptions);
      },
      inject: [ApiConfigService],
    };
  }
}
