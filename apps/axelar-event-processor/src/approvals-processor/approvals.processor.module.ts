import { Module } from '@nestjs/common';
import { ApiConfigModule, DynamicModuleUtils } from '@mvx-monorepo/common';
import { ApprovalsProcessorService } from './approvals.processor.service';
import { GrpcModule } from '@mvx-monorepo/common/grpc/grpc.module';
import { ContractsModule } from '@mvx-monorepo/common/contracts/contracts.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ApiConfigModule,
    DynamicModuleUtils.getRedisCacheModule(),
    GrpcModule,
    ContractsModule,
  ],
  providers: [ApprovalsProcessorService],
})
export class ApprovalsProcessorModule {}
