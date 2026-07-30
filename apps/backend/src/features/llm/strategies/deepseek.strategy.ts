import { BadRequestException, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { LLM_DEFAULTS } from '../llm.constants';
import type { LlmResponse } from '../llm.types';
import type { LlmStrategy, LlmStrategyArgs } from './llm-strategy.interface';

export class DeepSeekStrategy implements LlmStrategy {
  private readonly logger = new Logger(DeepSeekStrategy.name);

  async complete({ request, config, signal }: LlmStrategyArgs): Promise<LlmResponse> {
    if (!config.deepseekApiKey) {
      throw new BadRequestException('DEEPSEEK_API_KEY is not configured');
    }

    const model = (request.model ?? config.model) || LLM_DEFAULTS.deepseek.model;
    const client = new OpenAI({
      apiKey: config.deepseekApiKey,
      baseURL: config.deepseekBaseUrl,
    });
    this.logger.log(`Calling DeepSeek model: ${model}`);

    const response = await client.chat.completions.create(
      {
        model,
        messages: request.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        ...(request.responseFormat === 'json'
          ? { response_format: { type: 'json_object' as const } }
          : {}),
      },
      { signal },
    );

    const content = response.choices[0]?.message?.content ?? '';
    return { content, provider: 'deepseek', model };
  }
}
