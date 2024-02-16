import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule, GrpcModule } from '@mvx-monorepo/common';
import { ContractCallEventProcessorService } from './contract-call-event.processor.service';

@Module({
  imports: [ScheduleModule.forRoot(), DatabaseModule, GrpcModule],
  providers: [ContractCallEventProcessorService],
})
export class ContractCallEventProcessorModule {}
