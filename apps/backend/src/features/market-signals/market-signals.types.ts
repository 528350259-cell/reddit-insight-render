import type { TikhubProduct } from '../tikhub/tikhub.types';
import type { OwnShopProductMatch, BestsellerMatch } from '../dream-insight/dream-insight.types';

export interface MarketSignalsResult {
  keyword: string;
  isTracked: boolean;
  tikhub: {
    products: TikhubProduct[];
    fetchedAt: string | null;
  };
  ownShop: OwnShopProductMatch[];
  marketBestsellers: BestsellerMatch[];
}
