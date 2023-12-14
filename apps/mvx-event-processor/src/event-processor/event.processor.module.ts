import { RabbitModule, RabbitModuleOptions } from '@multiversx/sdk-nestjs-rabbitmq';
import { Module } from '@nestjs/common';
import { EventProcessorService } from './event.processor.service';
import { ApiConfigModule, ApiConfigService } from '@mvx-monorepo/common';
import { ProcessorsModule } from '../processors';

@Module({
  imports: [
    ApiConfigModule,
    RabbitModule.forRootAsync({
      useFactory: (apiConfigService: ApiConfigService) =>
        new RabbitModuleOptions(apiConfigService.getEventsNotifierUrl(), [], {
          timeout: 30000,
        }),
      inject: [ApiConfigService],
    }),
    ProcessorsModule,
  ],
  providers: [EventProcessorService],
  exports: [EventProcessorService],
})
export class EventProcessorModule {}
