import { Module } from '@nestjs/common';
import { EventProcessorModule } from './event-processor';
import { CallContractApprovedProcessorModule } from './call-contract-approved-processor';
import { GasCheckerModule } from './gas-checker/gas-checker.module';
import { ContractCallEventProcessorModule } from './contract-call-event-processor';

@Module({
  imports: [
    EventProcessorModule,
    CallContractApprovedProcessorModule,
    GasCheckerModule,
    ContractCallEventProcessorModule,
  ],
})
export class MvxEventProcessorModule {}
