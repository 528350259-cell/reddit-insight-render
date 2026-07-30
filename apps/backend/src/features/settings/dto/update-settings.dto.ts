import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsIn(['claude', 'openai', 'gemini', 'deepseek'])
  provider?: string;

  @IsOptional()
  @IsIn(['decodo', 'reddit-direct'])
  scrapingProvider?: string;

  @IsOptional()
  @IsString()
  model?: string;
}
