import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TikhubService } from './tikhub.service';
import { TrackedKeywordEntity, TrackedKeywordDocument } from './tracked-keyword.schema';
import { TikhubSnapshotEntity, TikhubSnapshotDocument } from './tikhub-snapshot.schema';
import type { TikhubRegion } from './tikhub.types';

const SYNC_CONCURRENCY = 2; // TikHub is a paid, rate-limited API — keep this small.

export interface SyncSummary {
  keywordsSynced: number;
  failures: Array<{ keyword: string; region: TikhubRegion; error: string }>;
}

@Injectable()
export class TikhubSyncService {
  private readonly logger = new Logger(TikhubSyncService.name);

  constructor(
    private readonly tikhubService: TikhubService,
    @InjectModel(TrackedKeywordEntity.name)
    private readonly trackedKeywordModel: Model<TrackedKeywordDocument>,
    @InjectModel(TikhubSnapshotEntity.name)
    private readonly snapshotModel: Model<TikhubSnapshotDocument>,
  ) {}

  // ---------------------------------------------------------------------------
  // Keyword management (used by the 市场信号 page's admin section)
  // ---------------------------------------------------------------------------

  async listKeywords(): Promise<TrackedKeywordDocument[]> {
    return this.trackedKeywordModel.find().sort({ createdAt: -1 }).exec();
  }

  async addKeyword(keyword: string, region: TikhubRegion = 'US'): Promise<TrackedKeywordDocument> {
    const trimmed = keyword.trim();
    const existing = await this.trackedKeywordModel.findOne({ keyword: trimmed, region }).exec();
    if (existing) {
      throw new ConflictException(`"${trimmed}" (${region}) is already tracked`);
    }
    return this.trackedKeywordModel.create({ keyword: trimmed, region });
  }

  async removeKeyword(id: string): Promise<void> {
    const deleted = await this.trackedKeywordModel.findByIdAndDelete(id).exec();
    if (!deleted) {
      throw new NotFoundException(`Tracked keyword ${id} not found`);
    }
  }

  // ---------------------------------------------------------------------------
  // Snapshot reads (used by the market-signals aggregation endpoint)
  // ---------------------------------------------------------------------------

  async getSnapshot(
    keyword: string,
    region: TikhubRegion = 'US',
  ): Promise<TikhubSnapshotDocument | null> {
    return this.snapshotModel.findOne({ keyword, region }).exec();
  }

  // ---------------------------------------------------------------------------
  // Sync: called by POST /admin/tikhub/sync (weekly GitHub Actions workflow)
  // ---------------------------------------------------------------------------

  async syncAllTrackedKeywords(): Promise<SyncSummary> {
    const keywords = await this.listKeywords();
    this.logger.log(`[Sync] ▶ Syncing ${keywords.length} tracked keyword(s)`);

    const failures: SyncSummary['failures'] = [];
    let next = 0;

    const worker = async (): Promise<void> => {
      while (next < keywords.length) {
        const tracked = keywords[next++];
        try {
          const products = await this.tikhubService.searchProducts(tracked.keyword, tracked.region);
          await this.snapshotModel
            .findOneAndUpdate(
              { keyword: tracked.keyword, region: tracked.region },
              { products, fetchedAt: new Date() },
              { upsert: true },
            )
            .exec();
          this.logger.log(
            `[Sync] ✓ "${tracked.keyword}" (${tracked.region}) — ${products.length} products`,
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(`[Sync] ✗ "${tracked.keyword}" (${tracked.region}): ${message}`);
          failures.push({ keyword: tracked.keyword, region: tracked.region, error: message });
        }
      }
    };

    const workers = Array.from({ length: Math.min(SYNC_CONCURRENCY, keywords.length) }, () =>
      worker(),
    );
    await Promise.all(workers);

    this.logger.log(
      `[Sync] ✓ Done — ${keywords.length - failures.length}/${keywords.length} succeeded`,
    );

    return { keywordsSynced: keywords.length - failures.length, failures };
  }
}
