import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TikhubController } from './tikhub.controller';
import { TikhubService } from './tikhub.service';
import { TikhubSyncService } from './tikhub-sync.service';
import { TrackedKeywordEntity, TrackedKeywordSchema } from './tracked-keyword.schema';
import { TikhubSnapshotEntity, TikhubSnapshotSchema } from './tikhub-snapshot.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TrackedKeywordEntity.name, schema: TrackedKeywordSchema },
      { name: TikhubSnapshotEntity.name, schema: TikhubSnapshotSchema },
    ]),
  ],
  controllers: [TikhubController],
  providers: [TikhubService, TikhubSyncService],
  exports: [TikhubSyncService],
})
export class TikhubModule {}
