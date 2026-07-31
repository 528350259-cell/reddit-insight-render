import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { TrackerService } from './tracker.service';
import type { OnProgress } from './tracker.service';
import { GeneratePlanDto } from './dto/generate-plan.dto';
import { AnalyzePlanDto } from './dto/analyze-plan.dto';
import { AnalysisTaskService } from './analysis-task.service';

@Controller('tracker')
export class TrackerController {
  private readonly logger = new Logger(TrackerController.name);

  constructor(
    private readonly trackerService: TrackerService,
    private readonly analysisTaskService: AnalysisTaskService,
  ) {}

  @Post('tasks/plan')
  @HttpCode(HttpStatus.ACCEPTED)
  async createPlanTask(@Body() dto: GeneratePlanDto) {
    const task = await this.analysisTaskService.create('plan', dto);
    setImmediate(() => void this.analysisTaskService.run(task.id));
    return task;
  }

  @Post('tasks/analyze')
  @HttpCode(HttpStatus.ACCEPTED)
  async createAnalysisTask(@Body() dto: AnalyzePlanDto) {
    const task = await this.analysisTaskService.create('analyze', dto);
    setImmediate(() => void this.analysisTaskService.run(task.id));
    return task;
  }

  @Get('tasks/:id')
  async getTask(@Param('id') id: string) {
    return this.analysisTaskService.findOne(id);
  }

  /**
   * POST /tracker/plan
   * Takes a natural language prompt and returns a suggested scraping plan
   * (subreddits, queries, time range). The user can review and adjust before executing.
   */
  @Post('plan')
  @HttpCode(HttpStatus.OK)
  async generatePlan(@Body() dto: GeneratePlanDto) {
    return this.trackerService.generatePlan(dto);
  }

  /**
   * POST /tracker/analyze
   * Accepts a confirmed scraping plan, executes scraping via Decodo,
   * and returns an LLM-generated intelligence report.
   */
  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  async analyzePlan(@Body() dto: AnalyzePlanDto) {
    return this.trackerService.analyzePlan(dto);
  }

  /**
   * POST /tracker/analyze/stream
   * Same as /analyze but streams progress as Server-Sent Events so the UI
   * can show live scraping progress. Final event type is 'complete' (full result);
   * errors arrive as type 'error'.
   */
  @Post('analyze/stream')
  async analyzePlanStream(@Body() dto: AnalyzePlanDto, @Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data: object) => {
      if (!res.destroyed) res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const onProgress: OnProgress = (event) => send(event);

    const ac = new AbortController();
    res.on('close', () => {
      if (ac.signal.aborted) return;
      this.logger.log(
        `[Analyze] Client disconnected — cancelling request for prompt: "${dto.prompt}"`,
      );
      ac.abort();
    });

    try {
      const result = await this.trackerService.analyzePlan(dto, onProgress, ac.signal);
      send({ type: 'complete', ...result });
    } catch (err) {
      send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      res.end();
    }
  }
}
