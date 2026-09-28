import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { TikhubRegion } from '../tikhub.types';

const REGIONS: TikhubRegion[] = ['US', 'SG', 'MY', 'PH', 'TH', 'VN', 'ID', 'JP', 'MX'];

export class AddTrackedKeywordDto {
  @IsString()
  @MinLength(1)
  keyword: string;

  @IsOptional()
  @IsIn(REGIONS)
  region?: TikhubRegion;
}
