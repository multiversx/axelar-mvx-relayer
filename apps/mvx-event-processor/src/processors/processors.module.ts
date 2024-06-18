import { Module } from '@nestjs/common';
import { GatewayProcessor } from './gateway.processor';
import { ContractsModule } from '@mvx-monorepo/common/contracts/contracts.module';
import { DatabaseModule } from '@mvx-monorepo/common';
import { GrpcModule } from '@mvx-monorepo/common/grpc/grpc.module';
import { GasServiceProcessor } from './gas-service.processor';

@Module({
  imports: [ContractsModule, DatabaseModule, GrpcModule],
  providers: [GatewayProcessor, GasServiceProcessor],
  exports: [GatewayProcessor, GasServiceProcessor],
})
export class ProcessorsModule {}
