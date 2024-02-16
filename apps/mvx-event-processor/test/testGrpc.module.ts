import { Module } from '@nestjs/common';
import { GrpcService } from '@mvx-monorepo/common';

@Module({
  imports: [],
  providers: [GrpcService],
  exports: [GrpcService],
})
export class TestGrpcModule {}
