import { Module } from '@nestjs/common';
import { PrismaService } from '@mvx-monorepo/common/database/prisma.service';
import { MessageApprovedRepository } from '@mvx-monorepo/common/database/repository/message-approved.repository';
import { LastProcessedDataRepository } from '@mvx-monorepo/common/database/repository/last-processed-data.repository';

@Module({
  providers: [PrismaService, MessageApprovedRepository, LastProcessedDataRepository],
  exports: [MessageApprovedRepository, LastProcessedDataRepository],
})
export class DatabaseModule {}
