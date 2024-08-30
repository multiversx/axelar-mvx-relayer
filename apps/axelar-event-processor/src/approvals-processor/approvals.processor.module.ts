import { Module } from '@nestjs/common';
import { ApiConfigModule, DatabaseModule, DynamicModuleUtils } from '@mvx-monorepo/common';
import { ApprovalsProcessorService } from './approvals.processor.service';
import { ApiModule } from '@mvx-monorepo/common/api/api.module';
import { ContractsModule } from '@mvx-monorepo/common/contracts/contracts.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ApiConfigModule,
    DynamicModuleUtils.getRedisCacheModule(),
    ApiModule,
    ContractsModule,
    DatabaseModule,
  ],
  providers: [ApprovalsProcessorService],
})
export class ApprovalsProcessorModule {}
