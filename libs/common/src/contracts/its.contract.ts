import { AbiRegistry, IAddress, ResultsParser, SmartContract } from '@multiversx/sdk-core/out';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ItsContract {
  constructor(
    private readonly smartContract: SmartContract,
    private readonly _abi: AbiRegistry,
    private readonly _resultsParser: ResultsParser,
  ) {}
}
