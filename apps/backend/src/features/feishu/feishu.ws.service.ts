import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createLarkChannel } from '@larksuiteoapi/node-sdk';
import { ConfigService } from '../../shared';
import { FeishuService } from './feishu.service';

@Injectable()
export class FeishuWsService implements OnModuleInit {
  private readonly logger = new Logger(FeishuWsService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly feishuService: FeishuService,
  ) {}

  async onModuleInit(): Promise<void> {
    const { appId, appSecret, enabled } = this.configService.feishu;

    if (!enabled) {
      this.logger.warn('[Feishu] skipped because FEISHU_ENABLED is false');
      return;
    }

    if (!appId || !appSecret) {
      this.logger.error('[Feishu] skipped because FEISHU_APP_ID or FEISHU_APP_SECRET is missing');
      return;
    }

    const channel = createLarkChannel({
      appId,
      appSecret,
      transport: 'websocket',
      includeRawEvent: true,
    });

    channel.on({
      message: async (message) => {
        this.logger.log(
          `[Feishu] message received in chat ${message.chatId} (msg ${message.messageId})`,
        );
        await this.feishuService.handleChannelMessage(message, channel);
      },
      cardAction: async (event) => {
        this.logger.log(
          `[Feishu] card action received for message ${event.messageId} in chat ${event.chatId}`,
        );
        await this.feishuService.handleCardAction(event, channel);
      },
      error: (error) => {
        this.logger.error(`[Feishu] channel error: ${error.message}`);
      },
      reconnecting: () => {
        this.logger.warn('[Feishu] reconnecting');
      },
      reconnected: () => {
        this.logger.log('[Feishu] reconnected');
      },
    });

    try {
      await channel.connect();
      this.logger.log('[Feishu] channel connected');
    } catch (error) {
      this.logger.error(
        `[Feishu] channel connect failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
