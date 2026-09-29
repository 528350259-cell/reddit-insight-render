import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '../../shared/config/config.service';
import type { TikhubProduct, TikhubRegion } from './tikhub.types';

interface TikhubRawProduct {
  product_id: string;
  title: string;
  image?: { url_list?: string[] };
  product_price_info?: { sale_price_format?: string };
  rate_info?: { score?: number; review_count?: string };
  sold_info?: { sold_count?: number };
  seller_info?: { shop_name?: string };
  seo_url?: { canonical_url?: string };
}

interface TikhubSearchResponse {
  code: number;
  message: string;
  data?: {
    code: number;
    message: string;
    data?: { products?: TikhubRawProduct[] };
  };
}

@Injectable()
export class TikhubService {
  private readonly logger = new Logger(TikhubService.name);
  private static readonly BASE_URL = 'https://api.tikhub.io/api/v1/tiktok/shop/web';

  constructor(private readonly configService: ConfigService) {}

  async searchProducts(keyword: string, region: TikhubRegion = 'US'): Promise<TikhubProduct[]> {
    const { apiKey } = this.configService.tikhub;
    if (!apiKey) {
      throw new BadRequestException('TIKHUB_API_KEY is not configured');
    }

    const url = new URL(`${TikhubService.BASE_URL}/fetch_search_products_list`);
    url.searchParams.set('search_word', keyword);
    url.searchParams.set('offset', '0');
    url.searchParams.set('region', region);

    this.logger.log(`[TikHub] Searching "${keyword}" (${region})`);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    });

    if (response.status === 403) {
      throw new ForbiddenException(
        'TikHub token lacks the TikTok-Shop-Web-API scope — enable it at user.tikhub.io/dashboard/api',
      );
    }
    if (response.status === 429) {
      throw new HttpException('TikHub rate limit reached', 429);
    }
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `TikHub API error: ${response.status} ${response.statusText}`,
      );
    }

    const body = (await response.json()) as TikhubSearchResponse;
    const products = body.data?.data?.products ?? [];

    this.logger.log(`[TikHub] "${keyword}" → ${products.length} products`);

    return products.map((p) => this.mapProduct(p));
  }

  private mapProduct(raw: TikhubRawProduct): TikhubProduct {
    return {
      productId: raw.product_id,
      title: raw.title,
      priceFormat: raw.product_price_info?.sale_price_format ?? '',
      soldCount: raw.sold_info?.sold_count ?? 0,
      ratingScore: raw.rate_info?.score ?? 0,
      reviewCount: Number(raw.rate_info?.review_count ?? 0),
      shopName: raw.seller_info?.shop_name ?? '',
      imageUrl: raw.image?.url_list?.[0] ?? '',
      productUrl: raw.seo_url?.canonical_url ?? '',
    };
  }
}
