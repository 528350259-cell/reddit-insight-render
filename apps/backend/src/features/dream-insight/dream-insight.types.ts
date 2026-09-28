/** One row from Dream Insight's GET /admin/tiktok/data snapshot endpoint. */
export interface DreamInsightSnapshot {
  snapshot_id: number;
  source: string;
  source_key: string;
  entity_level: string;
  entity_id: string;
  title: string;
  window_start: string;
  window_end: string;
  retrieved_at: string;
  dimensions: Record<string, unknown>;
  metrics: Record<string, unknown>;
}

export interface DreamInsightDataResponse {
  summary: { by_source: Record<string, number>; total: number };
  count: number;
  items: DreamInsightSnapshot[];
}

export interface BestsellerMatch {
  rank: number;
  productName: string;
  gmvRange: string;
  rating: string;
  shopName: string;
  categoryName: string;
}

/** Our own shop's product, joined with its own performance metrics by entity_id. */
export interface OwnShopProductMatch {
  productId: string;
  title: string;
  status: string;
  priceUsd: string;
  categories: string[];
  productUrl: string;
  performance: {
    productImpressions: number;
    productClicks: number;
    orders: number;
    itemsSold: number;
    gmvUsd: string;
  } | null;
}
