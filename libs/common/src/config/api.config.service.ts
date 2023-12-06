import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EVENTS_NOTIFIER_QUEUE } from '../../../../config/configuration';

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

  getEventsNotifierQueue(): string {
    return EVENTS_NOTIFIER_QUEUE;
  }

  getContractGateway(): string {
    const eventsNotifierGatewayAddress = this.configService.get<string>('CONTRACT_GATEWAY');
    if (!eventsNotifierGatewayAddress) {
      throw new Error('No Events Notifier Gateway Address present');
    }

    return eventsNotifierGatewayAddress;
  }

  getAxelarApiUrl(): string {
    const axelarApiUrl = this.configService.get<string>('AXELAR_API_URL');
    if (!axelarApiUrl) {
      throw new Error('No Axelar API url present');
    }

    return axelarApiUrl;
  }

  getSourceChainName(): string {
    const sourceChainName = this.configService.get<string>('SOURCE_CHAIN_NAME');
    if (!sourceChainName) {
      throw new Error('No Axelar API url present');
    }

    return sourceChainName;
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
