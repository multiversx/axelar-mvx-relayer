import { Injectable } from '@nestjs/common';
import { PrismaService } from '@mvx-monorepo/common/database/prisma.service';
import { MessageApproved, MessageApprovedStatus, Prisma } from '@prisma/client';

@Injectable()
export class MessageApprovedRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.MessageApprovedCreateInput): Promise<MessageApproved | null> {
    return this.prisma.messageApproved.create({
      data,
    });
  }

  findPending(page: number = 0, take: number = 10): Promise<MessageApproved[] | null> {
    // Last updated more than one minute ago, if retrying
    const lastUpdatedAt = new Date(new Date().getTime() - 60_000);

    return this.prisma.messageApproved.findMany({
      where: {
        status: MessageApprovedStatus.PENDING,
        OR: [
          { retry: 0 },
          {
            updatedAt: {
              lt: lastUpdatedAt,
            },
          },
        ],
      },
      orderBy: [
        { retry: 'asc' }, // new entries have priority over older ones
        { createdAt: 'asc' },
      ],
      skip: page * take,
      take,
    });
  }

  findBySourceChainAndMessageId(sourceChain: string, messageId: string): Promise<MessageApproved | null> {
    return this.prisma.messageApproved.findUnique({
      where: {
        sourceChain_messageId: {
          sourceChain,
          messageId,
        },
      },
    });
  }

  async updateManyPartial(entries: MessageApproved[]) {
    await this.prisma.$transaction(
      entries.map((data) => {
        return this.prisma.messageApproved.update({
          where: {
            sourceChain_messageId: {
              sourceChain: data.sourceChain,
              messageId: data.messageId,
            },
          },
          data: {
            status: data.status,
            retry: data.retry,
            executeTxHash: data.executeTxHash,
            successTimes: data.successTimes,
          },
        });
      }),
    );
  }

  async updateStatusAndSuccessTimes(data: MessageApproved) {
    await this.prisma.messageApproved.update({
      where: {
        sourceChain_messageId: {
          sourceChain: data.sourceChain,
          messageId: data.messageId,
        },
      },
      data: {
        status: data.status,
        successTimes: data.successTimes,
      },
    });
  }
}
