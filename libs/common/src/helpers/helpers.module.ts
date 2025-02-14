import { forwardRef, Module } from '@nestjs/common';
import { ApiModule, DynamicModuleUtils } from '@mvx-monorepo/common';
import { RedisHelper } from '@mvx-monorepo/common/helpers/redis.helper';
import { MetricsModule } from '@multiversx/sdk-nestjs-monitoring';

@Module({
  imports: [
    DynamicModuleUtils.getRedisCacheModule(),
    DynamicModuleUtils.getRedisModule(),
    MetricsModule,
    forwardRef(() => ApiModule),
  ],
  providers: [RedisHelper],
  exports: [RedisHelper],
})
export class HelpersModule {}
