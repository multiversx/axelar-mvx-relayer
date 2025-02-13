import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Locker } from '@multiversx/sdk-nestjs-common';
import { ApiConfigService, AxelarGmpApi, CacheInfo } from '@mvx-monorepo/common';
import { RedisHelper } from '@mvx-monorepo/common/helpers/redis.helper';
import { ApiNetworkProvider, TransactionOnNetwork } from '@multiversx/sdk-network-providers/out';
import { GasServiceProcessor, GatewayProcessor } from './processors';
import { AxiosError } from 'axios';
import { MessageApprovedEvent } from '@mvx-monorepo/common/api/entities/axelar.gmp.api';
import { ItsProcessor } from './processors/its.processor';

@Injectable()
export class CrossChainTransactionProcessorService {
  private readonly contractGateway: string;
  private readonly contractGasService: string;
  private readonly contractIts: string;
  private readonly logger: Logger;

  constructor(
    private readonly gatewayProcessor: GatewayProcessor,
    private readonly gasServiceProcessor: GasServiceProcessor,
    private readonly itsProcessor: ItsProcessor,
    private readonly axelarGmpApi: AxelarGmpApi,
    private readonly redisHelper: RedisHelper,
    private readonly api: ApiNetworkProvider,
    apiConfigService: ApiConfigService,
  ) {
    this.contractGateway = apiConfigService.getContractGateway();
    this.contractGasService = apiConfigService.getContractGasService();
    this.contractIts = apiConfigService.getContractIts();
    this.logger = new Logger(CrossChainTransactionProcessorService.name);
  }

  @Cron('7/10 * * * * *')
  async processCrossChainTransactions() {
    await Locker.lock('processCrossChainTransactions', this.processCrossChainTransactionsRaw.bind(this));
  }

  async processCrossChainTransactionsRaw() {
    this.logger.debug('Running processCrossChainTransactions cron');

    const txHashes = await this.redisHelper.smembers(CacheInfo.CrossChainTransactions().key);

    for (const txHash of txHashes) {
      try {
        const { transaction, fee } = await this.getTransactionWithFee(txHash);

        // Wait for transaction to be finished
        if (!transaction.isCompleted) {
          continue;
        }

        // Only handle events if successful
        if (transaction.status.isSuccessful()) {
          await this.handleEvents(transaction, fee);
        }

        await this.redisHelper.srem(CacheInfo.CrossChainTransactions().key, txHash);
      } catch (e) {
        this.logger.warn(`An error occurred while processing cross chain transaction ${txHash}. Will be retried`, e);
      }
    }
  }

  private async handleEvents(transaction: TransactionOnNetwork, fee: string) {
    const eventsToSend = [];

    const approvalEvents = [];

    for (const [index, rawEvent] of transaction.logs.events.entries()) {
      const address = rawEvent.address.bech32();

      if (address === this.contractGateway) {
        const event = await this.gatewayProcessor.handleGatewayEvent(
          rawEvent,
          transaction,
          index,
          fee,
          transaction.value,
        );

        if (event) {
          eventsToSend.push(event);

          if (event.type === 'MESSAGE_APPROVED') {
            approvalEvents.push(event);
          }
        }

        continue;
      }

      if (address === this.contractGasService) {
        const event = this.gasServiceProcessor.handleGasServiceEvent(rawEvent, transaction, index, fee);

        if (event) {
          eventsToSend.push(event);
        }
      }

      if (address === this.contractIts) {
        const event = this.itsProcessor.handleItsEvent(rawEvent, transaction, index);

        if (event) {
          eventsToSend.push(event);
        }
      }
    }

    if (!eventsToSend.length) {
      return;
    }

    // Set cost for approval events if needed
    for (const event of approvalEvents) {
      const approvalEvent = event as MessageApprovedEvent;

      approvalEvent.cost.amount = String(BigInt(fee) / BigInt(approvalEvents.length));
    }

    try {
      await this.axelarGmpApi.postEvents(eventsToSend, transaction.hash);
    } catch (e) {
      this.logger.error('Could not send all events to GMP API...', e);

      if (e instanceof AxiosError) {
        this.logger.error(e.response);
      }

      throw e;
    }
  }

  private async getTransactionWithFee(txHash: string): Promise<{ transaction: TransactionOnNetwork; fee: string }> {
    const response = await this.api.doGetGeneric(`transactions/${txHash}`);
    const transaction = TransactionOnNetwork.fromApiHttpResponse(txHash, response);

    return { transaction, fee: response.fee };
  }
}
