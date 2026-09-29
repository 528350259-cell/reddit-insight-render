import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type TikhubRegion = 'US' | 'SG' | 'MY' | 'PH' | 'TH' | 'VN' | 'ID' | 'JP' | 'MX';

export interface TrackedKeyword {
  _id: string;
  keyword: string;
  region: TikhubRegion;
  createdAt: string;
}

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

export interface BestsellerMatch {
  rank: number;
  productName: string;
  gmvRange: string;
  rating: string;
  shopName: string;
  categoryName: string;
}

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

const KEYWORDS_KEY = ['tikhub-keywords'] as const;

const fetchKeywords = async (): Promise<TrackedKeyword[]> => {
  const { data } = await api.get<TrackedKeyword[]>('/tikhub/keywords');
  return data;
};

export const useTrackedKeywordsQuery = () =>
  useQuery({ queryKey: KEYWORDS_KEY, queryFn: fetchKeywords });

export const useAddKeywordMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { keyword: string; region?: TikhubRegion }) => {
      const { data } = await api.post<TrackedKeyword>('/tikhub/keywords', input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEYWORDS_KEY }),
  });
};

export const useRemoveKeywordMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/tikhub/keywords/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEYWORDS_KEY }),
  });
};

export const useMarketSignalsQuery = (keyword: string) =>
  useQuery({
    queryKey: ['market-signals', keyword] as const,
    queryFn: async (): Promise<MarketSignalsResult> => {
      const { data } = await api.get<MarketSignalsResult>('/market-signals', {
        params: { keyword },
      });
      return data;
    },
    enabled: keyword.trim().length > 0,
  });
