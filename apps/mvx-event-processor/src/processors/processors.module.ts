import { Module } from '@nestjs/common';
import { ContractCallProcessor } from './contract-call.processor';
import { ContractsModule } from '@mvx-monorepo/common/contracts/contracts.module';
import { DatabaseModule } from '@mvx-monorepo/common';
import { GrpcModule } from '@mvx-monorepo/common/grpc/grpc.module';

@Module({
  imports: [ContractsModule, DatabaseModule, GrpcModule],
  providers: [ContractCallProcessor],
  exports: [ContractCallProcessor],
})
export class ProcessorsModule {}
