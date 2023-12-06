import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ApiConfigModule, DynamicModuleUtils } from '@mvx-monorepo/common';
import { TransactionProcessorService } from './transaction.processor.service';

@Module({
  imports: [ApiConfigModule, ScheduleModule.forRoot(), DynamicModuleUtils.getCachingModule()],
  providers: [TransactionProcessorService],
})
export class TransactionProcessorModule {}
