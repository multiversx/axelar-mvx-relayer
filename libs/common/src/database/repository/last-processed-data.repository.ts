import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export const LAST_PROCESSED_DATA_TYPE = {
  LAST_TASK_ID: 'lastTaskUUID',
};

@Injectable()
export class LastProcessedDataRepository {
  constructor(private readonly prisma: PrismaService) {}

  async update(type: string, value: string) {
    await this.prisma.lastProcessedData.upsert({
      create: { type, value },
      where: { type },
      update: { value },
      select: null,
    });
  }

  async get(type: string): Promise<string | undefined> {
    const entry = await this.prisma.lastProcessedData.findUnique({
      where: { type },
    });

    return entry?.value ?? undefined;
  }
}
