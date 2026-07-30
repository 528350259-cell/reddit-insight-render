import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '../../shared/config/config.service';
import { Settings, SettingsDocument } from './settings.schema';

export interface EffectiveConfig {
  provider: string;
  model: string;
  scrapingProvider: 'decodo' | 'reddit-direct';
  decodoApiKey: string;
  anthropicApiKey: string;
  openaiApiKey: string;
  geminiApiKey: string;
  deepseekApiKey: string;
  deepseekBaseUrl: string;
}

export interface SettingsStatus {
  provider: string;
  model: string;
  scrapingProvider: 'decodo' | 'reddit-direct';
  decodoKeySet: boolean;
  anthropicKeySet: boolean;
  openaiKeySet: boolean;
  geminiKeySet: boolean;
  deepseekKeySet: boolean;
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @InjectModel(Settings.name)
    private readonly settingsModel: Model<SettingsDocument>,
    private readonly configService: ConfigService,
  ) {}

  async getEffectiveConfig(): Promise<EffectiveConfig> {
    let doc: SettingsDocument | null = null;
    try {
      doc = await this.settingsModel.findOne({ key: 'global' }).exec();
    } catch (err) {
      this.logger.warn(`Failed to read settings from DB: ${String(err)}`);
    }

    const envLlm = this.configService.llm;
    const envDecodo = this.configService.decodo;
    const envScraping = this.configService.scraping;

    return {
      // Provider and model: DB selection overrides env, env overrides default
      provider: doc?.provider || envLlm.provider || 'claude',
      model: doc?.model || envLlm.model || '',
      scrapingProvider:
        (doc?.scrapingProvider as 'decodo' | 'reddit-direct') ||
        (envScraping.provider as 'decodo' | 'reddit-direct') ||
        'decodo',
      // API keys: always from env only, never from DB
      decodoApiKey: envDecodo.apiKey || '',
      anthropicApiKey: envLlm.anthropicApiKey || '',
      openaiApiKey: envLlm.openaiApiKey || '',
      geminiApiKey: envLlm.geminiApiKey || '',
      deepseekApiKey: envLlm.deepseekApiKey || '',
      deepseekBaseUrl: envLlm.deepseekBaseUrl || 'https://api.deepseek.com',
    };
  }

  async getStatus(): Promise<SettingsStatus> {
    const config = await this.getEffectiveConfig();
    return {
      provider: config.provider,
      model: config.model,
      scrapingProvider: config.scrapingProvider,
      decodoKeySet: !!config.decodoApiKey,
      anthropicKeySet: !!config.anthropicApiKey,
      openaiKeySet: !!config.openaiApiKey,
      geminiKeySet: !!config.geminiApiKey,
      deepseekKeySet: !!config.deepseekApiKey,
    };
  }

  async update(input: {
    provider?: string;
    model?: string;
    scrapingProvider?: 'decodo' | 'reddit-direct';
  }): Promise<SettingsStatus> {
    const patch: Record<string, string> = {};
    if (input.provider) patch.provider = input.provider;
    if (input.scrapingProvider) patch.scrapingProvider = input.scrapingProvider;
    // Clear model when provider changes so a stale model from another provider isn't used
    if (input.provider) patch.model = '';
    // Allow explicit model override (empty string resets to provider default)
    if (input.model !== undefined) patch.model = input.model.trim();

    this.logger.log(`[Settings] Updating: ${JSON.stringify(patch)}`);
    await this.settingsModel
      .findOneAndUpdate({ key: 'global' }, { $set: patch }, { upsert: true, new: true })
      .exec();

    return this.getStatus();
  }
}
