import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '../../shared/config/config.service';
import { TikhubSyncService } from './tikhub-sync.service';
import { AddTrackedKeywordDto } from './dto/add-tracked-keyword.dto';
import type { TikhubRegion } from './tikhub.types';

@Controller()
export class TikhubController {
  constructor(
    private readonly syncService: TikhubSyncService,
    private readonly configService: ConfigService,
  ) {}

  @Get('tikhub/keywords')
  async listKeywords() {
    return this.syncService.listKeywords();
  }

  @Post('tikhub/keywords')
  async addKeyword(@Body() dto: AddTrackedKeywordDto) {
    return this.syncService.addKeyword(dto.keyword, dto.region);
  }

  @Delete('tikhub/keywords/:id')
  async removeKeyword(@Param('id') id: string) {
    await this.syncService.removeKeyword(id);
    return { deleted: true };
  }

  @Get('tikhub/snapshot')
  async getSnapshot(@Query('keyword') keyword: string, @Query('region') region?: TikhubRegion) {
    return this.syncService.getSnapshot(keyword, region ?? 'US');
  }

  /**
   * Triggered weekly by .github/workflows/weekly-tikhub-sync.yml — not called
   * from the frontend. Protected by TIKHUB_SYNC_TOKEN, a credential separate
   * from Dream Insight's own admin token.
   */
  @Post('admin/tikhub/sync')
  async sync(@Headers('x-sync-token') suppliedToken?: string) {
    const expected = this.configService.tikhub.syncToken.trim();
    if (!expected || (suppliedToken ?? '').trim() !== expected) {
      throw new UnauthorizedException('Invalid or missing X-Sync-Token');
    }
    return this.syncService.syncAllTrackedKeywords();
  }
}
