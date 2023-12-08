import { Injectable } from '@nestjs/common';
import { PrismaService } from '@mvx-monorepo/common/database/prisma.service';
import { ContractCallEvent, ContractCallEventStatus, Prisma } from '@prisma/client';
import { ContractCallEventWithGasPaid } from '@mvx-monorepo/common/database/entities/contract-call-event';

@Injectable()
export class ContractCallEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.ContractCallEventCreateInput): Promise<ContractCallEvent | null> {
    return this.prisma.contractCallEvent.create({
      data,
    });
  }

  findWithoutGasPaid(gasPaid: Prisma.GasPaidCreateInput): Promise<ContractCallEvent | null> {
    return this.prisma.contractCallEvent.findFirst({
      where: {
        status: ContractCallEventStatus.PENDING,
        sourceAddress: gasPaid.sourceAddress,
        destinationAddress: gasPaid.destinationAddress,
        destinationChain: gasPaid.destinationChain,
        payloadHash: gasPaid.payloadHash,
        gasPaidEntries: {
          none: {},
        },
      },
    });
  }

  findPending(txHash: string, eventIndex: number): Promise<ContractCallEventWithGasPaid | null> {
    return this.prisma.contractCallEvent.findUnique({
      where: {
        status: ContractCallEventStatus.PENDING,
        txHash,
        eventIndex,
      },
      include: {
        gasPaidEntries: true,
      },
    });
  }
}
