import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Locker } from '@multiversx/sdk-nestjs-common';
import { ApiConfigService, CacheInfo, GatewayContract, GrpcService } from '@mvx-monorepo/common';
import { ContractCallEventRepository } from '@mvx-monorepo/common/database/repository/contract-call-event.repository';
import { RedisHelper } from '@mvx-monorepo/common/helpers/redis.helper';
import { ITransactionEvent, ITransactionOnNetwork } from '@multiversx/sdk-core/out';
import { ProxyNetworkProvider } from '@multiversx/sdk-network-providers/out';
import { EventIdentifiers, Events } from '@mvx-monorepo/common/utils/event.enum';
import { ContractCallEventStatus } from '@prisma/client';
import { CONSTANTS } from '@mvx-monorepo/common/utils/constants.enum';

@Injectable()
export class CrossChainTransactionProcessorService {
  private readonly logger: Logger;
  private readonly contractGateway: string;

  constructor(
    private readonly contractCallEventRepository: ContractCallEventRepository,
    private readonly grpcService: GrpcService,
    private readonly redisHelper: RedisHelper,
    private readonly proxy: ProxyNetworkProvider,
    private readonly gatewayContract: GatewayContract,
    apiConfigService: ApiConfigService,
  ) {
    this.contractGateway = apiConfigService.getContractGateway();
    this.logger = new Logger(CrossChainTransactionProcessorService.name);
  }

  // Runs every 15 seconds
  @Cron('*/15 * * * * *')
  async processCrossChainTransactions() {
    await Locker.lock('processCrossChainTransactions', this.processCrossChainTransactionsRaw.bind(this));
  }

  async processCrossChainTransactionsRaw() {
    this.logger.debug('Running processCrossChainTransactions cron');

    const txHashes = await this.redisHelper.smembers(CacheInfo.CrossChainTransactions().key);

    for (const txHash of txHashes) {
      try {
        const transaction = await this.proxy.getTransaction(txHash);

        // Wait for transaction to be finished
        if (transaction.status.isPending()) {
          continue;
        }

        // Only handle events if successful
        if (transaction.status.isSuccessful()) {
          await this.handleEvents(transaction);
        }

        await this.redisHelper.srem(CacheInfo.CrossChainTransactions().key, txHash);
      } catch (e) {
        this.logger.warn(`An error occurred while processing cross chain transaction ${txHash}. Will be retried`, e);
      }
    }
  }

  private async handleEvents(transaction: ITransactionOnNetwork) {
    for (const [index, rawEvent] of transaction.logs.events.entries()) {
      if (rawEvent.address.bech32() !== this.contractGateway) {
        continue;
      }

      const eventName = rawEvent.topics?.[0]?.toString();

      if (rawEvent.identifier === EventIdentifiers.CALL_CONTRACT && eventName === Events.CONTRACT_CALL_EVENT) {
        await this.handleContractCallEvent(rawEvent, transaction.hash, index);

        continue;
      }

      if (rawEvent.identifier === EventIdentifiers.ROTATE_SIGNERS && eventName === Events.SIGNERS_ROTATED_EVENT) {
        await this.handleSignersRotatedEvent(rawEvent, transaction.hash, index);
      }
    }
  }

  private async handleContractCallEvent(rawEvent: ITransactionEvent, txHash: string, index: number) {
    const event = this.gatewayContract.decodeContractCallEvent(rawEvent);

    const contractCallEvent = await this.contractCallEventRepository.create({
      txHash: txHash,
      eventIndex: index,
      status: ContractCallEventStatus.PENDING,
      sourceAddress: event.sender.bech32(),
      sourceChain: CONSTANTS.SOURCE_CHAIN_NAME,
      destinationAddress: event.destinationAddress,
      destinationChain: event.destinationChain,
      payloadHash: event.payloadHash,
      payload: event.payload,
      retry: 0,
    });

    // A duplicate might exist in the database, so we can skip creation in this case
    if (!contractCallEvent) {
      return;
    }

    this.grpcService.verify(contractCallEvent);
  }

  private async handleSignersRotatedEvent(rawEvent: ITransactionEvent, txHash: string, index: number) {
    const weightedSigners = this.gatewayContract.decodeSignersRotatedEvent(rawEvent);

    // The id needs to have `0x` in front of the txHash (hex string)
    const id = `0x${txHash}-${index}`;

    // TODO: Test that this works correctly
    const response = await this.grpcService.verifyVerifierSet(
      id,
      weightedSigners.signers,
      weightedSigners.threshold,
      weightedSigners.nonce,
    );

    if (response.published) {
      return;
    }

    this.logger.warn(`Couldn't dispatch verifyWorkerSet ${id} to Amplifier API. Retrying...`);

    setTimeout(async () => {
      const response = await this.grpcService.verifyVerifierSet(
        id,
        weightedSigners.signers,
        weightedSigners.threshold,
        weightedSigners.nonce,
      );

      if (!response.published) {
        this.logger.error(`Couldn't dispatch verifyWorkerSet ${id} to Amplifier API.`);
      }
    }, 60_000);
  }
}
