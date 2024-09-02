import { Module } from '@nestjs/common';
import { PrismaService } from '@mvx-monorepo/common/database/prisma.service';
import { MessageApprovedRepository } from '@mvx-monorepo/common/database/repository/message-approved.repository';

@Module({
  providers: [PrismaService, MessageApprovedRepository],
  exports: [MessageApprovedRepository],
})
export class DatabaseModule {}
