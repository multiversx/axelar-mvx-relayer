import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule, DynamicModuleUtils } from '@mvx-monorepo/common';
import { ContractsModule } from '@mvx-monorepo/common/contracts/contracts.module';
import { CallContractApprovedProcessorService } from './call-contract-approved.processor.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DynamicModuleUtils.getCachingModule(),
    DatabaseModule,
    ContractsModule,
  ],
  providers: [CallContractApprovedProcessorService],
})
export class CallContractApprovedProcessorModule {}
