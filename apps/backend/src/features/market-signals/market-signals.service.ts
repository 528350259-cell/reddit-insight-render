import { Injectable, Logger } from '@nestjs/common';
import { TikhubSyncService } from '../tikhub/tikhub-sync.service';
import { DreamInsightService } from '../dream-insight/dream-insight.service';
import type { MarketSignalsResult } from './market-signals.types';

@Injectable()
export class MarketSignalsService {
  private readonly logger = new Logger(MarketSignalsService.name);

  constructor(
    private readonly tikhubSyncService: TikhubSyncService,
    private readonly dreamInsightService: DreamInsightService,
  ) {}

  async getSignals(keyword: string): Promise<MarketSignalsResult> {
    const trimmed = keyword.trim();
    this.logger.log(`[MarketSignals] ▶ "${trimmed}"`);

    const [snapshot, ownShop, marketBestsellers] = await Promise.all([
      this.tikhubSyncService.getSnapshot(trimmed),
      this.dreamInsightService.findOwnProductMatches(trimmed),
      this.dreamInsightService.findBestsellerMatches(trimmed),
    ]);

    return {
      keyword: trimmed,
      isTracked: snapshot !== null,
      tikhub: {
        products: snapshot?.products ?? [],
        fetchedAt: snapshot?.fetchedAt ? snapshot.fetchedAt.toISOString() : null,
      },
      ownShop,
      marketBestsellers,
    };
  }
}
