import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { AnalyzePlanDto } from './dto/analyze-plan.dto';
import type { GeneratePlanDto } from './dto/generate-plan.dto';
import {
  AnalysisTask,
  AnalysisTaskDocument,
  AnalysisTaskKind,
} from './analysis-task.schema';
import { TrackerService, type ProgressEvent } from './tracker.service';

export interface AnalysisTaskView {
  id: string;
  kind: AnalysisTaskKind;
  status: 'queued' | 'running' | 'completed' | 'failed';
  stage: string;
  progress: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

@Injectable()
export class AnalysisTaskService {
  private readonly logger = new Logger(AnalysisTaskService.name);

  constructor(
    @InjectModel(AnalysisTask.name)
    private readonly taskModel: Model<AnalysisTaskDocument>,
    private readonly trackerService: TrackerService,
  ) {}

  async create(
    kind: AnalysisTaskKind,
    payload: GeneratePlanDto | AnalyzePlanDto,
  ): Promise<AnalysisTaskView> {
    const task = await this.taskModel.create({
      kind,
      status: 'queued',
      payload,
      stage: 'queued',
      progress: {},
    });
    return this.toView(task);
  }

  async findOne(id: string): Promise<AnalysisTaskView> {
    let task = await this.taskModel.findById(id).exec();
    if (!task) throw new NotFoundException(`Task ${id} not found`);

    const executionLimitMs = 16 * 60 * 1000;
    if (
      task.status === 'running' &&
      task.startedAt &&
      Date.now() - task.startedAt.getTime() > executionLimitMs
    ) {
      task = await this.taskModel
        .findByIdAndUpdate(
          id,
          {
            $set: {
              status: 'failed',
              stage: 'failed',
              error: '后台任务超过 15 分钟执行上限，请缩小抓取范围后重试。',
              finishedAt: new Date(),
            },
          },
          { new: true },
        )
        .exec();
      if (!task) throw new NotFoundException(`Task ${id} not found`);
    }

    return this.toView(task);
  }

  async fail(id: string, message: string): Promise<void> {
    await this.taskModel.findByIdAndUpdate(id, {
      $set: {
        status: 'failed',
        stage: 'failed',
        error: message,
        finishedAt: new Date(),
      },
    });
  }

  async run(id: string): Promise<AnalysisTaskView> {
    const task = await this.taskModel
      .findOneAndUpdate(
        { _id: id, status: 'queued' },
        {
          $set: {
            status: 'running',
            stage: 'starting',
            startedAt: new Date(),
          },
          $unset: { error: 1, finishedAt: 1 },
        },
        { new: true },
      )
      .exec();

    if (!task) return this.findOne(id);

    try {
      const result =
        task.kind === 'plan'
          ? await this.runPlan(task)
          : await this.runAnalysis(task);

      const completed = await this.taskModel
        .findByIdAndUpdate(
          id,
          {
            $set: {
              status: 'completed',
              stage: 'completed',
              progress: { percent: 100, message: '任务已完成' },
              result,
              finishedAt: new Date(),
            },
          },
          { new: true },
        )
        .exec();

      if (!completed) throw new NotFoundException(`Task ${id} not found`);
      return this.toView(completed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[Task ${id}] ${message}`, error instanceof Error ? error.stack : undefined);

      const failed = await this.taskModel
        .findByIdAndUpdate(
          id,
          {
            $set: {
              status: 'failed',
              stage: 'failed',
              error: message,
              finishedAt: new Date(),
            },
          },
          { new: true },
        )
        .exec();

      if (!failed) throw new NotFoundException(`Task ${id} not found`);
      return this.toView(failed);
    }
  }

  private async runPlan(task: AnalysisTaskDocument): Promise<Record<string, unknown>> {
    await this.updateProgress(String(task._id), 'planning', {
      percent: 20,
      message: '正在生成 Reddit 检索计划',
    });
    return (await this.trackerService.generatePlan(
      task.payload as unknown as GeneratePlanDto,
    )) as unknown as Record<string, unknown>;
  }

  private async runAnalysis(task: AnalysisTaskDocument): Promise<Record<string, unknown>> {
    const id = String(task._id);
    let progressUpdates = Promise.resolve();
    const onProgress = (event: ProgressEvent) => {
      const update = this.progressFromEvent(event);
      progressUpdates = progressUpdates
        .then(() => this.updateProgress(id, update.stage, update.progress))
        .catch((error) => {
          this.logger.warn(`[Task ${id}] Failed to persist progress: ${String(error)}`);
        });
    };

    const result = await this.trackerService.analyzePlan(
      task.payload as unknown as AnalyzePlanDto,
      onProgress,
    );
    await progressUpdates;
    return result as unknown as Record<string, unknown>;
  }

  private progressFromEvent(event: ProgressEvent): {
    stage: string;
    progress: Record<string, unknown>;
  } {
    switch (event.type) {
      case 'started':
        return {
          stage: 'scraping',
          progress: {
            completed: 0,
            total: event.totalTasks,
            percent: 10,
            message: '正在抓取 Reddit 帖子',
          },
        };
      case 'task_complete':
        return {
          stage: 'scraping',
          progress: {
            completed: event.completed,
            total: event.total,
            percent: Math.max(10, Math.round((event.completed / Math.max(event.total, 1)) * 55)),
            message: `已完成 ${event.completed}/${event.total} 个抓取目标`,
            detail: event.label,
          },
        };
      case 'deep_diving':
        return {
          stage: 'comments',
          progress: {
            percent: 65,
            message: `正在深挖 ${event.posts} 个高价值评论区`,
          },
        };
      case 'summarizing':
        return {
          stage: 'summarizing',
          progress: { percent: 82, message: '正在生成 AI 洞察报告' },
        };
      case 'saving':
        return {
          stage: 'saving',
          progress: { percent: 95, message: '正在保存报告与历史记录' },
        };
    }
  }

  private async updateProgress(
    id: string,
    stage: string,
    progress: Record<string, unknown>,
  ): Promise<void> {
    await this.taskModel.updateOne({ _id: id, status: 'running' }, { $set: { stage, progress } });
  }

  private toView(task: AnalysisTaskDocument): AnalysisTaskView {
    const timestamps = task as AnalysisTaskDocument & { createdAt?: Date; updatedAt?: Date };
    return {
      id: String(task._id),
      kind: task.kind,
      status: task.status,
      stage: task.stage,
      progress: task.progress ?? {},
      result: task.result,
      error: task.error,
      createdAt: timestamps.createdAt,
      updatedAt: timestamps.updatedAt,
    };
  }
}
