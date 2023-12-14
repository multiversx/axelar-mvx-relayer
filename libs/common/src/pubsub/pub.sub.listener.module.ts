import { DynamicModule, Module } from '@nestjs/common';
import { DynamicModuleUtils } from '@mvx-monorepo/common/utils/dynamic.module.utils';
import { PubSubListenerController } from './pub.sub.listener.controller';
import { LoggingModule } from '@multiversx/sdk-nestjs-common';

@Module({})
export class PubSubListenerModule {
  static forRoot(): DynamicModule {
    return {
      module: PubSubListenerModule,
      imports: [LoggingModule, DynamicModuleUtils.getCachingModule()],
      controllers: [PubSubListenerController],
      providers: [DynamicModuleUtils.getPubSubService()],
      exports: ['PUBSUB_SERVICE'],
    };
  }
}
