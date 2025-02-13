import { forwardRef, Module } from '@nestjs/common';
import { ApiConfigModule, DatabaseModule, DynamicModuleUtils } from '@mvx-monorepo/common';
import { ApprovalsProcessorService } from './approvals.processor.service';
import { ApiModule } from '@mvx-monorepo/common/api/api.module';
import { ContractsModule } from '@mvx-monorepo/common/contracts/contracts.module';
import { ScheduleModule } from '@nestjs/schedule';
import { HelpersModule } from '@mvx-monorepo/common/helpers/helpers.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ApiConfigModule,
    DynamicModuleUtils.getRedisCacheModule(),
    forwardRef(() => ApiModule),
    ContractsModule,
    DatabaseModule,
    HelpersModule,
  ],
  providers: [ApprovalsProcessorService],
})
export class ApprovalsProcessorModule {}
