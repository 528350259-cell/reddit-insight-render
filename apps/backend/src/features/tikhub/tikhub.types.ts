export type TikhubRegion = 'US' | 'SG' | 'MY' | 'PH' | 'TH' | 'VN' | 'ID' | 'JP' | 'MX';

/** One TikTok Shop listing, trimmed down to what the market-signals page needs. */
export interface TikhubProduct {
  productId: string;
  title: string;
  priceFormat: string;
  soldCount: number;
  ratingScore: number;
  reviewCount: number;
  shopName: string;
  imageUrl: string;
  productUrl: string;
}

export interface TrackedKeyword {
  keyword: string;
  region: TikhubRegion;
}
