import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '../../shared/config/config.service';
import type {
  BestsellerMatch,
  DreamInsightDataResponse,
  DreamInsightSnapshot,
  OwnShopProductMatch,
} from './dream-insight.types';

interface ProductSku {
  price?: { sale_price?: string; currency?: string };
}

interface ProductDimensions {
  status?: string;
  skus?: ProductSku[];
  categories?: string[];
  product_url?: string;
}

interface ShopProductMetrics {
  product_impressions?: number;
  product_clicks?: number;
  orders?: number;
  items_sold?: number;
  gmv?: { amount?: string };
}

interface BestsellerMetrics {
  gmv_range?: string;
  rank?: number;
  rating?: string;
  shop_name?: string;
}

interface BestsellerDimensions {
  filter_category_name?: string;
}

/**
 * Thin read-only proxy over Dream Insight's `/admin/tiktok/data` diagnostic
 * endpoint (a separate, independently deployed project — see
 * docs/MARKET_SIGNALS_INTEGRATION.md). This service never writes anything
 * back to Dream Insight and only touches its already-synced snapshot data.
 */
@Injectable()
export class DreamInsightService {
  private readonly logger = new Logger(DreamInsightService.name);

  constructor(private readonly configService: ConfigService) {}

  private async fetchSnapshots(
    source: string,
    opts: { limit?: number; query?: string } = {},
  ): Promise<DreamInsightSnapshot[]> {
    const { baseUrl, adminToken } = this.configService.dreamInsight;
    if (!adminToken) {
      throw new BadRequestException('DREAM_INSIGHT_ADMIN_TOKEN is not configured');
    }

    const url = new URL('/admin/tiktok/data', baseUrl);
    url.searchParams.set('source', source);
    url.searchParams.set('limit', String(opts.limit ?? 100));
    if (opts.query) url.searchParams.set('q', opts.query);

    // Render's free tier cold-starts slowly (observed up to ~90s) — use a
    // generous timeout rather than failing fast on the first request.
    const response = await fetch(url, {
      headers: { 'X-Admin-Token': adminToken },
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Dream Insight API error: ${response.status} ${response.statusText}`,
      );
    }

    const body = (await response.json()) as DreamInsightDataResponse;
    this.logger.log(`[DreamInsight] source=${source} q="${opts.query ?? ''}" → ${body.count} rows`);
    return body.items;
  }

  /**
   * Finds our own shop's products matching `keyword`, joined with their real
   * performance metrics (impressions/clicks/orders/GMV). The `shop_products`
   * source doesn't carry product names, so the join happens client-side by
   * entity_id/product_id.
   */
  async findOwnProductMatches(keyword: string): Promise<OwnShopProductMatch[]> {
    const [catalogMatches, allPerformance] = await Promise.all([
      this.fetchSnapshots('products', { limit: 100, query: keyword }),
      this.fetchSnapshots('shop_products', { limit: 300 }),
    ]);

    const performanceByProductId = new Map(allPerformance.map((row) => [row.entity_id, row]));

    return catalogMatches.map((row) => {
      const dims = row.dimensions as ProductDimensions;
      const perfRow = performanceByProductId.get(row.entity_id);
      const perfMetrics = perfRow?.metrics as ShopProductMetrics | undefined;

      return {
        productId: row.entity_id,
        title: row.title,
        status: dims.status ?? '',
        priceUsd: dims.skus?.[0]?.price?.sale_price ?? '',
        categories: dims.categories ?? [],
        productUrl: dims.product_url ?? '',
        performance: perfMetrics
          ? {
              productImpressions: perfMetrics.product_impressions ?? 0,
              productClicks: perfMetrics.product_clicks ?? 0,
              orders: perfMetrics.orders ?? 0,
              itemsSold: perfMetrics.items_sold ?? 0,
              gmvUsd: perfMetrics.gmv?.amount ?? '0.00',
            }
          : null,
      };
    });
  }

  /** Market-wide (not our own shop) bestseller leaderboard rows matching `keyword`. */
  async findBestsellerMatches(keyword: string, limit = 20): Promise<BestsellerMatch[]> {
    const rows = await this.fetchSnapshots('bestsellers', { limit, query: keyword });
    return rows
      .map((row) => {
        const metrics = row.metrics as BestsellerMetrics;
        const dims = row.dimensions as BestsellerDimensions;
        return {
          rank: metrics.rank ?? 0,
          productName: row.title,
          gmvRange: metrics.gmv_range ?? '',
          rating: metrics.rating ?? '',
          shopName: metrics.shop_name ?? '',
          categoryName: dims.filter_category_name ?? '',
        };
      })
      .sort((a, b) => a.rank - b.rank);
  }
}
