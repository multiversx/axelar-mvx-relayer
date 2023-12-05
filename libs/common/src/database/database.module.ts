import { Module } from '@nestjs/common';
import { PrismaService } from '@mvx-monorepo/common/database/prisma.service';

@Module({
  providers: [PrismaService],
})
export class DatabaseModule {}
