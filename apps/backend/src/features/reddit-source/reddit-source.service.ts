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

  private async getActiveSource(): Promise<RedditSource> {
    const provider = await this.getProvider();
    this.logger.log(`Using scraping provider: ${provider}`);
    return provider === 'reddit-direct' ? this.redditDirectService : this.decodoService;
  }
}
