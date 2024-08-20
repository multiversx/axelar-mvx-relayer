import { Module } from '@nestjs/common';
import { DynamicModuleUtils } from '@mvx-monorepo/common';
import { RedisHelper } from '@mvx-monorepo/common/helpers/redis.helper';
import { MetricsModule } from '@multiversx/sdk-nestjs-monitoring';

@Module({
  imports: [DynamicModuleUtils.getRedisCacheModule(), DynamicModuleUtils.getRedisModule(), MetricsModule],
  providers: [RedisHelper],
  exports: [RedisHelper],
})
export class HelpersModule {}
