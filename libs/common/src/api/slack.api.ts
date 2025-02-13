import { Injectable, Logger } from '@nestjs/common';
import { SlackMessage } from './entities/slack.message';
import { ApiConfigService } from '../config';
import axios, { AxiosError, AxiosInstance } from 'axios';

@Injectable()
export class SlackApi {
  private readonly logger = new Logger(SlackApi.name);

  private readonly client: AxiosInstance;
  private readonly isEnabled: boolean;

  constructor(apiConfigService: ApiConfigService) {
    this.client = axios.create({
      baseURL: apiConfigService.getSlackWebhookUrl(),
      timeout: 30_000,
    });

    this.isEnabled = !!apiConfigService.getSlackWebhookUrl();
  }

  public async sendWarn(title: string, message: string): Promise<void> {
    const slackMessage = SlackMessage.buildWarnMessage(title, message);
    await this.sendAlert(slackMessage);
  }

  public async sendError(title: string, message: string): Promise<void> {
    const slackMessage = SlackMessage.buildErrorMessage(title, message);
    await this.sendAlert(slackMessage);
  }

  private async sendAlert(message: SlackMessage): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    try {
      await this.client.post('', message);
    } catch (e) {
      this.logger.error(`Could not send Slack message ${message}`, e);

      if (e instanceof AxiosError) {
        this.logger.error(e.response);
      }
    }
  }
}
