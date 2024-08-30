import { Module } from '@nestjs/common';
import { AxelarGmpApi } from '@mvx-monorepo/common';

@Module({
  imports: [],
  providers: [AxelarGmpApi],
  exports: [AxelarGmpApi],
})
export class TestGrpcModule {}
