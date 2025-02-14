import { RabbitModule, RabbitModuleOptions } from '@multiversx/sdk-nestjs-rabbitmq';
import { forwardRef, Module } from '@nestjs/common';
import { EventProcessorService } from './event.processor.service';
import { ApiConfigModule, ApiConfigService, ApiModule } from '@mvx-monorepo/common';
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
    forwardRef(() => ApiModule),
  ],
  providers: [EventProcessorService],
})
export class EventProcessorModule {}
