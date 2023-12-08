import { AbiRegistry, Address, SmartContract } from '@multiversx/sdk-core';
import { Logger } from '@nestjs/common';
import * as fs from 'fs';

export class ContractLoader {
  private readonly logger: Logger;
  private readonly abiPath: string;
  private abiRegistry: AbiRegistry | undefined = undefined;
  private contract: SmartContract | undefined = undefined;

  constructor(abiPath: string) {
    this.abiPath = abiPath;

    this.logger = new Logger(ContractLoader.name);
  }

  private async load(contractAddress: string): Promise<SmartContract> {
    try {
      const jsonContent: string = await fs.promises.readFile(this.abiPath, { encoding: 'utf8' });
      const json = JSON.parse(jsonContent);

      this.abiRegistry = AbiRegistry.create(json);

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

  async getContract(contractAddress: string): Promise<SmartContract> {
    if (!this.contract) {
      this.contract = await this.load(contractAddress);
    }

    return this.contract;
  }

  async getAbiRegistry(contractAddress: string): Promise<AbiRegistry> {
    if (!this.abiRegistry) {
      await this.load(contractAddress);
    }

    return this.abiRegistry as AbiRegistry;
  }
}
