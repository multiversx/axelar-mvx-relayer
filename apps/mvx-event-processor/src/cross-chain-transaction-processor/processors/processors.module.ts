import { Module } from '@nestjs/common';
import { GatewayProcessor } from './gateway.processor';
import { ContractsModule } from '@mvx-monorepo/common/contracts/contracts.module';
import { DatabaseModule } from '@mvx-monorepo/common';
import { ApiModule } from '@mvx-monorepo/common/api/api.module';
import { GasServiceProcessor } from './gas-service.processor';

@Module({
  imports: [ContractsModule, DatabaseModule, ApiModule],
  providers: [GatewayProcessor, GasServiceProcessor],
  exports: [GatewayProcessor, GasServiceProcessor],
})
export class ProcessorsModule {}
