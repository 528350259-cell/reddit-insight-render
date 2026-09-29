import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { MarketSignalsService } from './market-signals.service';

@Controller('market-signals')
export class MarketSignalsController {
  constructor(private readonly marketSignalsService: MarketSignalsService) {}

  @Get()
  async getSignals(@Query('keyword') keyword?: string) {
    if (!keyword?.trim()) {
      throw new BadRequestException('Query param "keyword" is required');
    }
    return this.marketSignalsService.getSignals(keyword);
  }
}
