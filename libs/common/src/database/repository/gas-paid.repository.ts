import { Injectable } from '@nestjs/common';
import { PrismaService } from '@mvx-monorepo/common/database/prisma.service';
import { ContractCallEventStatus, GasPaid, Prisma } from '@prisma/client';

@Injectable()
export class GasPaidRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.GasPaidCreateInput): Promise<GasPaid | null> {
    return this.prisma.gasPaid.create({
      data,
    });
  }

  updateRefundedValue(
    txHash: string,
    eventIndex: number,
    gasToken: string | null,
    refundAddress: string,
    refundedValue: string,
  ) {
    this.prisma.gasPaid.updateMany({
      where: {
        status: {
          in: [ContractCallEventStatus.SUCCESS, ContractCallEventStatus.FAILED],
        },
        gasToken,
        refundAddress,
        ContractCallEvent: {
          txHash,
          eventIndex,
        },
        refundedValue: null,
      },
      data: {
        refundedValue,
      },
    });
  }
}
