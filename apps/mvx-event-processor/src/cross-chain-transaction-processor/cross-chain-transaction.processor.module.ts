import { forwardRef, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ApiConfigModule, ApiModule, ContractsModule, DatabaseModule } from '@mvx-monorepo/common';
import { CrossChainTransactionProcessorService } from './cross-chain-transaction.processor.service';
import { HelpersModule } from '@mvx-monorepo/common/helpers/helpers.module';
import { ProcessorsModule } from './processors';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DatabaseModule,
    forwardRef(() => ApiModule),
    HelpersModule,
    ContractsModule,
    ApiConfigModule,
    ProcessorsModule,
  ],
  providers: [CrossChainTransactionProcessorService],
})
export class CrossChainTransactionProcessorModule {}
