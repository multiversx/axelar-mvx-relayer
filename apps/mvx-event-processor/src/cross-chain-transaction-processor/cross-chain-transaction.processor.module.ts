import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ApiConfigModule, ContractsModule, DatabaseModule, ApiModule } from '@mvx-monorepo/common';
import { CrossChainTransactionProcessorService } from './cross-chain-transaction.processor.service';
import { HelpersModule } from '@mvx-monorepo/common/helpers/helpers.module';

@Module({
  imports: [ScheduleModule.forRoot(), DatabaseModule, ApiModule, HelpersModule, ContractsModule, ApiConfigModule],
  providers: [CrossChainTransactionProcessorService],
})
export class CrossChainTransactionProcessorModule {}
