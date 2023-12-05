import { RabbitModule, RabbitModuleOptions } from '@multiversx/sdk-nestjs-rabbitmq';
import { Module } from '@nestjs/common';
import { EventProcessorService } from './event.processor.service';
import { ApiConfigModule, ApiConfigService } from '@mvx-monorepo/common';
import configuration from '../../config/configuration';

@Module({
  imports: [
    ApiConfigModule.forRoot(configuration),
    RabbitModule.forRootAsync({
      useFactory: (apiConfigService: ApiConfigService) =>
        new RabbitModuleOptions(apiConfigService.getEventsNotifierUrl(), [], {
          timeout: 30000,
        }),
      inject: [ApiConfigService],
    }),
  ],
  providers: [EventProcessorService],
  exports: [EventProcessorService],
})
export class EventProcessorModule {}
