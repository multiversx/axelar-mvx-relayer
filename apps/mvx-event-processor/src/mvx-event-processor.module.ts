import { Module } from '@nestjs/common';
import { EventProcessorModule } from './event-processor';
import { MessageApprovedProcessorModule } from './message-approved-processor';
import { GasCheckerModule } from './gas-checker/gas-checker.module';
import { ContractCallEventProcessorModule } from './contract-call-event-processor';
import { CrossChainTransactionProcessorModule } from './cross-chain-transaction-processor';

@Module({
  imports: [
    EventProcessorModule,
    MessageApprovedProcessorModule,
    GasCheckerModule,
    ContractCallEventProcessorModule,
    CrossChainTransactionProcessorModule,
  ],
})
export class MvxEventProcessorModule {}
