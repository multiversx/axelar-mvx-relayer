import { RabbitModule, RabbitModuleOptions } from '@multiversx/sdk-nestjs-rabbitmq';
import { Module } from '@nestjs/common';
import { EventProcessorService } from './event.processor.service';
import { ApiConfigModule, ApiConfigService } from '@mvx-monorepo/common';
import { HelpersModule } from '@mvx-monorepo/common/helpers/helpers.module';

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
    HelpersModule,
  ],
  providers: [EventProcessorService],
})
export class EventProcessorModule {}
