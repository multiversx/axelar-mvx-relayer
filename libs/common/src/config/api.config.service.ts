import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiConfigService {
  constructor(private readonly configService: ConfigService) {}

  getApiUrl(): string {
    const apiUrl = this.configService.get<string>('API_URL');
    if (!apiUrl) {
      throw new Error('No API url present');
    }

    return apiUrl;
  }

  getGatewayUrl(): string {
    const gatewayUrl = this.configService.get<string>('GATEWAY_URL');
    if (!gatewayUrl) {
      throw new Error('No Gateway url present');
    }

    return gatewayUrl;
  }

  getRedisUrl(): string {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      throw new Error('No redisUrl present');
    }

    return redisUrl;
  }

  getRedisPort(): number {
    const url = this.getRedisUrl();
    const components = url.split(':');

    if (components.length > 1) {
      return Number(components[1]);
    }

    return 6379;
  }

  getEventsNotifierUrl(): string {
    const eventsNotifierUrl = this.configService.get<string>('EVENTS_NOTIFIER_URL');
    if (!eventsNotifierUrl) {
      throw new Error('No Events Notifier url present');
    }

    return eventsNotifierUrl;
  }

  getContractGateway(): string {
    const contractGateway = this.configService.get<string>('CONTRACT_GATEWAY');
    if (!contractGateway) {
      throw new Error('No Contract Gateway present');
    }

    return contractGateway;
  }

  getContractGasService(): string {
    const contractGasService = this.configService.get<string>('CONTRACT_GAS_SERVICE');
    if (!contractGasService) {
      throw new Error('No Contract Gas Service present');
    }

    return contractGasService;
  }

  getContractIts(): string {
    const contractIts = this.configService.get<string>('CONTRACT_ITS');
    if (!contractIts) {
      throw new Error('No Contract ITS present');
    }

    return contractIts;
  }

  getContractWegldSwap(): string {
    const contractWegldSwap = this.configService.get<string>('CONTRACT_WEGLD_SWAP');
    if (!contractWegldSwap) {
      throw new Error('No Contract Wegld Swap present');
    }

    return contractWegldSwap;
  }

  getAxelarContractVotingVerifier(): string {
    const axelarContractVotingVerifier = this.configService.get<string>('AXELAR_CONTRACT_VOTING_VERIFIER');
    if (!axelarContractVotingVerifier) {
      throw new Error('No Axelar Contract Voting Verifier present');
    }

    return axelarContractVotingVerifier;
  }

  getAxelarGmpApiUrl(): string {
    const axelarGmpApiUrl = this.configService.get<string>('AXELAR_GMP_API_URL');
    if (!axelarGmpApiUrl) {
      throw new Error('No Axelar GMP API url present');
    }

    return axelarGmpApiUrl;
  }

  getChainId(): string {
    const chainId = this.configService.get<string>('CHAIN_ID');
    if (!chainId) {
      throw new Error('No Chain Id present');
    }

    return chainId;
  }

  getWalletMnemonic(): string {
    const walletMnemonic = this.configService.get<string>('WALLET_MNEMONIC');
    if (!walletMnemonic) {
      throw new Error('No Wallet Mnemonic present');
    }

    return walletMnemonic;
  }

  getPoolLimit(): number {
    return this.configService.get<number>('CACHING_POOL_LIMIT') ?? 100;
  }

  getProcessTtl(): number {
    return this.configService.get<number>('CACHING_PROCESS_TTL') ?? 60;
  }

  getApiTimeout(): number {
    return this.configService.get<number>('API_TIMEOUT') ?? 30_000; // 30 seconds default
  }

  getGatewayTimeout(): number {
    return this.configService.get<number>('GATEWAY_TIMEOUT') ?? 30_000; // 30 seconds default
  }
}
