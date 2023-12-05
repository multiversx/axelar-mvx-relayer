import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiConfigService {
  constructor(private readonly configService: ConfigService) {}

  getApiUrl(): string {
    const apiUrl = this.configService.get<string>('urls.api');
    if (!apiUrl) {
      throw new Error('No API url present');
    }

    return apiUrl;
  }

  getAxelarApiUrl(): string {
    const axelarApiUrl = this.configService.get<string>('urls.axelarApi');
    if (!axelarApiUrl) {
      throw new Error('No Axelar API url present');
    }

    return axelarApiUrl;
  }

  getEventsNotifierUrl(): string {
    const eventsNotifierUrl = this.configService.get<string>('urls.eventsNotifier');
    if (!eventsNotifierUrl) {
      throw new Error('No Events Notifier url present');
    }

    return eventsNotifierUrl;
  }

  getEventsNotifierQueue(): string {
    const eventsNotifierQueue = this.configService.get<string>('eventsNotifier.queue');
    if (!eventsNotifierQueue) {
      throw new Error('No Events Notifier Queue present');
    }

    return eventsNotifierQueue;
  }

  getEventsNotifierGatewayAddress(): string {
    const eventsNotifierGatewayAddress = this.configService.get<string>('eventsNotifier.gatewayAddress');
    if (!eventsNotifierGatewayAddress) {
      throw new Error('No Events Notifier Gateway Address present');
    }

    return eventsNotifierGatewayAddress;
  }

  getRedisUrl(): string {
    const redisUrl = this.configService.get<string>('urls.redis');
    if (!redisUrl) {
      throw new Error('No redisUrl present');
    }

    return redisUrl;
  }

  getRedisHost(): string {
    const url = this.getRedisUrl();

    return url.split(':')[0];
  }

  getRedisPort(): number {
    const url = this.getRedisUrl();
    const components = url.split(':');

    if (components.length > 1) {
      return Number(components[1]);
    }

    return 6379;
  }

  getPoolLimit(): number {
    return this.configService.get<number>('caching.poolLimit') ?? 100;
  }

  getProcessTtl(): number {
    return this.configService.get<number>('caching.processTtl') ?? 60;
  }
}
