import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule, ApiModule } from '@mvx-monorepo/common';
import { ContractCallEventProcessorService } from './contract-call-event.processor.service';

@Module({
  imports: [ScheduleModule.forRoot(), DatabaseModule, ApiModule],
  providers: [ContractCallEventProcessorService],
})
export class ContractCallEventProcessorModule {}
