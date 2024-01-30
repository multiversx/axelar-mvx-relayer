import { AbiRegistry, BinaryCodec } from '@multiversx/sdk-core/out';
import { Injectable } from '@nestjs/common';
import { DecodingUtils } from '@mvx-monorepo/common/utils/decoding.utils';
import { TransferData } from '@mvx-monorepo/common/contracts/entities/auth-types';
import BigNumber from 'bignumber.js';

@Injectable()
export class AuthContract {
  constructor(private readonly abi: AbiRegistry, private readonly binaryCodec: BinaryCodec) {}

  decodeTransferData(params: Buffer): TransferData {
    const structType = this.abi.getStruct('TransferData');
    const outcome = this.binaryCodec.decodeTopLevel(params, structType).valueOf();

    return {
      newOperators: outcome.new_operators.map((operator: BigNumber[]) => DecodingUtils.decodeKeccak256Hash(operator)),
      newWeights: outcome.new_weights,
      newThreshold: outcome.new_threshold,
    };
  }
}
