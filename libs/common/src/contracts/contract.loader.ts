import { AbiRegistry, Address, SmartContract } from '@multiversx/sdk-core';
import { Logger } from '@nestjs/common';

export class ContractLoader {
  private readonly logger: Logger;
  private readonly json: any;
  private abiRegistry: AbiRegistry | undefined = undefined;
  private contract: SmartContract | undefined = undefined;

  constructor(json: any) {
    this.json = json;

    this.logger = new Logger(ContractLoader.name);
  }

  private load(contractAddress: string): SmartContract {
    try {
      this.abiRegistry = AbiRegistry.create(this.json);

      return new SmartContract({
        address: new Address(contractAddress),
        abi: this.abiRegistry,
      });
    } catch (error) {
      this.logger.log(`Unexpected error when trying to create smart contract from abi`);
      this.logger.error(error);

      throw new Error('Error when creating contract from abi');
    }
  }

  getContract(contractAddress: string): SmartContract {
    if (!this.contract) {
      this.contract = this.load(contractAddress);
    }

    return this.contract;
  }

  getAbiRegistry(contractAddress: string): AbiRegistry {
    if (!this.abiRegistry) {
      this.load(contractAddress);
    }

    return this.abiRegistry as AbiRegistry;
  }
}
