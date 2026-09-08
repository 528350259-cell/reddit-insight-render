import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { DecodoService } from '../decodo/decodo.service';
import { RedditDirectService } from './reddit-direct.service';
import type { RedditSource, ScrapingProvider } from './reddit-source.types';

@Injectable()
export class RedditSourceService {
  private readonly logger = new Logger(RedditSourceService.name);

  constructor(
    private readonly settingsService: SettingsService,
    private readonly decodoService: DecodoService,
    private readonly redditDirectService: RedditDirectService,
  ) {}

  async getProvider(): Promise<ScrapingProvider> {
    const config = await this.settingsService.getEffectiveConfig();
    return config.scrapingProvider;
  }

  async searchReddit(...args: Parameters<RedditSource['searchReddit']>) {
    return this.getActiveSource().then((source) => source.searchReddit(...args));
  }

  async scrapeSubreddit(...args: Parameters<RedditSource['scrapeSubreddit']>) {
    return this.getActiveSource().then((source) => source.scrapeSubreddit(...args));
  }

  async scrapePost(...args: Parameters<RedditSource['scrapePost']>) {
    return this.getActiveSource().then((source) => source.scrapePost(...args));
  }

  // Google-assisted discovery only works via Decodo (it needs Decodo's own
  // anti-bot proxy to hit Google) — reddit-direct has no such capability, so
  // this quietly no-ops for that provider instead of erroring.
  async discoverViaGoogle(
    query: string,
    limit?: number,
    signal?: AbortSignal,
  ): Promise<ReturnType<DecodoService['searchGoogleForReddit']>> {
    const provider = await this.getProvider();
    if (provider !== 'decodo') return [];
    return this.decodoService.searchGoogleForReddit(query, limit, signal);
  }

  private async getActiveSource(): Promise<RedditSource> {
    const provider = await this.getProvider();
    this.logger.log(`Using scraping provider: ${provider}`);
    return provider === 'reddit-direct' ? this.redditDirectService : this.decodoService;
  }
}
