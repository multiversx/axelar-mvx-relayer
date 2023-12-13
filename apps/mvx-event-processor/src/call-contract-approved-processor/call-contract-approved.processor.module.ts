import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '@mvx-monorepo/common';
import { ContractsModule } from '@mvx-monorepo/common/contracts/contracts.module';
import { CallContractApprovedProcessorService } from './call-contract-approved.processor.service';

@Module({
  imports: [ScheduleModule.forRoot(), DatabaseModule, ContractsModule],
  providers: [CallContractApprovedProcessorService],
})
export class CallContractApprovedProcessorModule {}
