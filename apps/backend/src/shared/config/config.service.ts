import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class ConfigService {
  constructor(private readonly configService: NestConfigService) {}

  get app() {
    const port = this.configService.get<number>('PORT', 5002);
    const publicApiUrl = this.configService.get<string>(
      'PUBLIC_API_BASE_URL',
      `http://localhost:${port}`,
    );
    return {
      port,
      publicApiUrl,
      publicFrontendUrl: this.configService.get<string>(
        'PUBLIC_FRONTEND_URL',
        'http://localhost:5274',
      ),
    };
  }

  get feishu() {
    return {
      appId: this.configService.get<string>('FEISHU_APP_ID', 'cli_aa9d10be84badbb3'),
      appSecret: this.configService.get<string>('FEISHU_APP_SECRET', ''),
      verificationToken: this.configService.get<string>('FEISHU_VERIFICATION_TOKEN', ''),
      enabled: this.configService.get<string>('FEISHU_ENABLED', 'false') === 'true',
    };
  }

  get mongodb() {
    return {
      uri: this.configService.get<string>('MONGODB_URI', 'mongodb://localhost:27018/platform'),
    };
  }

  get decodo() {
    return {
      apiKey: this.configService.get<string>('DECODO_BASIC_AUTH_TOKEN', ''),
      baseUrl: 'https://scraper-api.decodo.com/v2',
    };
  }

  get scraping() {
    return {
      provider: this.configService.get<string>('SCRAPING_PROVIDER', 'decodo'),
    };
  }

  get tikhub() {
    return {
      apiKey: this.configService.get<string>('TIKHUB_API_KEY', ''),
      // Protects POST /admin/tikhub/sync — separate from Dream Insight's own
      // admin token so the two systems' credentials stay independent.
      syncToken: this.configService.get<string>('TIKHUB_SYNC_TOKEN', ''),
    };
  }

  get dreamInsight() {
    return {
      baseUrl: this.configService.get<string>(
        'DREAM_INSIGHT_API_BASE_URL',
        'https://dream-creative-api-1.onrender.com',
      ),
      adminToken: this.configService.get<string>('DREAM_INSIGHT_ADMIN_TOKEN', ''),
    };
  }

  get llm() {
    return {
      provider: this.configService.get<string>('LLM_PROVIDER', 'claude'),
      model: this.configService.get<string>('LLM_MODEL', ''),
      anthropicApiKey: this.configService.get<string>('ANTHROPIC_API_KEY', ''),
      openaiApiKey: this.configService.get<string>('OPENAI_API_KEY', ''),
      geminiApiKey: this.configService.get<string>('GEMINI_API_KEY', ''),
      deepseekApiKey: this.configService.get<string>('DEEPSEEK_API_KEY', ''),
      deepseekBaseUrl: this.configService.get<string>(
        'DEEPSEEK_BASE_URL',
        'https://api.deepseek.com',
      ),
    };
  }
}
