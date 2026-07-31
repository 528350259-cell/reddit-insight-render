import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AnalysisTaskDocument = HydratedDocument<AnalysisTask>;
export type AnalysisTaskKind = 'plan' | 'analyze';
export type AnalysisTaskStatus = 'queued' | 'running' | 'completed' | 'failed';

@Schema({ timestamps: true })
export class AnalysisTask {
  @Prop({ type: String, required: true, enum: ['plan', 'analyze'] })
  kind: AnalysisTaskKind;

  @Prop({
    type: String,
    required: true,
    enum: ['queued', 'running', 'completed', 'failed'],
  })
  status: AnalysisTaskStatus;

  @Prop({ type: Object, required: true })
  payload: Record<string, unknown>;

  @Prop({ type: Object })
  result?: Record<string, unknown>;

  @Prop({ type: String, default: 'queued' })
  stage: string;

  @Prop({ type: Object, default: {} })
  progress: Record<string, unknown>;

  @Prop({ type: String })
  error?: string;

  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: Date })
  finishedAt?: Date;
}

export const AnalysisTaskSchema = SchemaFactory.createForClass(AnalysisTask);

// Completed task payloads can be large. History reports live in Query documents,
// so transient polling records are removed after seven days.
AnalysisTaskSchema.index({ finishedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });
