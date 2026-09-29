import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { TikhubProduct, TikhubRegion } from './tikhub.types';

export type TikhubSnapshotDocument = HydratedDocument<TikhubSnapshotEntity>;

/**
 * Cached result of one TikHub product search, refreshed weekly by the
 * `weekly-tikhub-sync` GitHub Actions workflow (POST /admin/tikhub/sync).
 * The market-signals page reads this collection, it never calls TikHub directly.
 */
@Schema({ timestamps: true })
export class TikhubSnapshotEntity {
  @Prop({ required: true, trim: true })
  keyword: string;

  @Prop({ type: String, required: true, default: 'US' })
  region: TikhubRegion;

  @Prop({ type: [Object], default: [] })
  products: TikhubProduct[];

  @Prop({ required: true })
  fetchedAt: Date;
}

export const TikhubSnapshotSchema = SchemaFactory.createForClass(TikhubSnapshotEntity);
TikhubSnapshotSchema.index({ keyword: 1, region: 1 }, { unique: true });
