import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { FeishuService } from './feishu.service';
import type { FeishuCliMessageEvent, FeishuEventPayload } from './feishu.types';

@Controller('feishu')
export class FeishuController {
  constructor(private readonly feishuService: FeishuService) {}

  @Post('events')
  @HttpCode(HttpStatus.OK)
  async handleEvent(@Body() payload: FeishuEventPayload) {
    return this.feishuService.handleEvent(payload);
  }

  @Post('consume')
  @HttpCode(HttpStatus.OK)
  async handleCliEvent(@Body() payload: FeishuCliMessageEvent) {
    return this.feishuService.handleCliMessageEvent(payload);
  }
}
