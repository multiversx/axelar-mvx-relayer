import { Injectable } from '@nestjs/common';
import { PrismaService } from '@mvx-monorepo/common/database/prisma.service';
import { ContractCallEvent, ContractCallEventStatus, Prisma } from '@prisma/client';
import { ContractCallEventWithGasPaid } from '@mvx-monorepo/common/database/entities/contract-call-event';

@Injectable()
export class ContractCallEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.ContractCallEventCreateInput): Promise<ContractCallEvent | null> {
    try {
      return await this.prisma.contractCallEvent.create({
        data,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        // Unique constraint fails
        if (e.code === 'P2002') {
          return null;
        }
      }

      throw e;
    }
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
