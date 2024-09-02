import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Locker } from '@multiversx/sdk-nestjs-common';
import { ApiConfigService, AxelarGmpApi, CacheInfo } from '@mvx-monorepo/common';
import { RedisHelper } from '@mvx-monorepo/common/helpers/redis.helper';
import { ITransactionOnNetwork } from '@multiversx/sdk-core/out';
import { ProxyNetworkProvider } from '@multiversx/sdk-network-providers/out';
import { GasServiceProcessor, GatewayProcessor } from './processors';

@Injectable()
export class CrossChainTransactionProcessorService {
  private readonly contractGateway: string;
  private readonly contractGasService: string;
  private readonly logger: Logger;

  constructor(
    private readonly gatewayProcessor: GatewayProcessor,
    private readonly gasServiceProcessor: GasServiceProcessor,
    private readonly axelarGmpApi: AxelarGmpApi,
    private readonly redisHelper: RedisHelper,
    private readonly proxy: ProxyNetworkProvider,
    apiConfigService: ApiConfigService,
  ) {
    this.contractGateway = apiConfigService.getContractGateway();
    this.contractGasService = apiConfigService.getContractGasService();
    this.logger = new Logger(CrossChainTransactionProcessorService.name);
  }

  // TODO: Change this to use RabbitMQ instead
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
    const eventsToSend = [];

    for (const [index, rawEvent] of transaction.logs.events.entries()) {
      const address = rawEvent.address.bech32();

      if (address === this.contractGateway) {
        const event = await this.gatewayProcessor.handleGatewayEvent(rawEvent, transaction, index);

        if (event) {
          eventsToSend.push(event);
        }

        continue;
      }

      if (address === this.contractGasService) {
        const event = await this.gasServiceProcessor.handleGasServiceEvent(rawEvent, transaction, index);

        if (event) {
          eventsToSend.push(event);
        }
      }
    }

    // TODO: Handle errors
    await this.axelarGmpApi.postEvents(eventsToSend);
  }
}
