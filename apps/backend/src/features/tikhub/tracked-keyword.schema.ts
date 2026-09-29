import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { TikhubRegion } from './tikhub.types';

export type TrackedKeywordDocument = HydratedDocument<TrackedKeywordEntity>;

/** A keyword the weekly sync job searches TikHub for. Managed from the 市场信号 page. */
@Schema({ timestamps: true })
export class TrackedKeywordEntity {
  @Prop({ required: true, trim: true })
  keyword: string;

  @Prop({ type: String, required: true, default: 'US' })
  region: TikhubRegion;
}

export const TrackedKeywordSchema = SchemaFactory.createForClass(TrackedKeywordEntity);
TrackedKeywordSchema.index({ keyword: 1, region: 1 }, { unique: true });
