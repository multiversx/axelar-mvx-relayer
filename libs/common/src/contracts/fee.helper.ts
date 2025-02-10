import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ProxyNetworkProvider } from '@multiversx/sdk-network-providers/out';
import { ApiConfigService } from '@mvx-monorepo/common';
import { ITransactionPayload, ITransactionValue } from '@multiversx/sdk-core/out';
import { MessageApproved } from '@prisma/client';
import { NotEnoughGasError } from '@mvx-monorepo/common/contracts/entities/gas.error';

const MAX_GAS_LIMIT = 600_000_000n;

@Injectable()
export class FeeHelper implements OnModuleInit {
  private readonly logger: Logger;

  private readonly isEnabledGasCheck: boolean;
  private minGasPrice: bigint = BigInt(1000000000);
  private minGasLimit: bigint = BigInt(50000);
  private gasPerDataByte: bigint = BigInt(1500);
  private gasPriceModifierInverted: bigint = BigInt(100);

  constructor(
    private readonly proxy: ProxyNetworkProvider,
    apiConfigService: ApiConfigService,
  ) {
    this.logger = new Logger(FeeHelper.name);

    this.isEnabledGasCheck = apiConfigService.isEnabledGasCheck();
  }

  async onModuleInit() {
    const config = await this.proxy.getNetworkConfig();

    this.minGasPrice = BigInt(config.MinGasPrice);
    this.minGasLimit = BigInt(config.MinGasLimit);
    this.gasPerDataByte = BigInt(config.GasPerDataByte);
    this.gasPriceModifierInverted = BigInt(10_000 * config.GasPriceModifier);
  }

  public checkGasCost(
    gas: number,
    value: ITransactionValue,
    data: ITransactionPayload,
    messageApproved: MessageApproved,
  ) {
    const gasFee = this.getEgldFeeFromGasLimit(BigInt(gas), BigInt(data.length()));
    const egldValue = BigInt(value.toString());
    const total = gasFee + egldValue;

    // Also take into account value in case of ITS
    if (total <= BigInt(messageApproved.availableGasBalance)) {
      return;
    }

    if (!this.isEnabledGasCheck) {
      this.logger.warn(
        `[GAS CHECK NOT ENABLED] Not enough gas to execute transaction ${messageApproved.sourceChain} ${messageApproved.messageId} BUT it will be executed anyway. Needed ${total} EGLD but only have ${messageApproved.availableGasBalance} EGLD`,
      );

      return;
    }

    this.logger.warn(
      `[GAS CHECK ENABLED] Not enough gas to execute transaction ${messageApproved.sourceChain} ${messageApproved.messageId}. Needed ${total} EGLD but only have ${messageApproved.availableGasBalance} EGLD`,
    );

    throw new NotEnoughGasError();
  }

  public getGasLimitFromEgldFee(availableGasBalance: bigint, data: ITransactionPayload): bigint {
    const gasLimit1 = this.minGasLimit + this.gasPerDataByte * BigInt(data.length());

    // Use data gas limit in this case
    if (availableGasBalance < gasLimit1 * this.minGasPrice) {
      return gasLimit1;
    }

    const gasLimit =
      ((availableGasBalance - gasLimit1 * this.minGasPrice) * this.gasPriceModifierInverted) / this.minGasPrice;

    if (gasLimit > MAX_GAS_LIMIT) {
      return MAX_GAS_LIMIT;
    }

    return gasLimit;
  }

  public getEgldFeeFromGasLimit(gasLimit2: bigint, dataLength: bigint): bigint {
    const gasLimit1 = this.minGasLimit + this.gasPerDataByte * dataLength;

    return gasLimit1 * this.minGasPrice + (gasLimit2 * this.minGasPrice) / this.gasPriceModifierInverted;
  }
}
