import { Module } from '@nestjs/common';
import { EventProcessorModule } from './event-processor';
import { CallContractApprovedProcessorModule } from './call-contract-approved-processor';
import { GasCheckerModule } from './gas-checker/gas-checker.module';

@Module({
  imports: [EventProcessorModule, CallContractApprovedProcessorModule, GasCheckerModule],
})
export class MvxEventProcessorModule {}
