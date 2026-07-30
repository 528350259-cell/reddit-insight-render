import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { QueriesModule } from '../queries/queries.module';
import { TrackerController } from './tracker.controller';
import { TrackerService } from './tracker.service';
import { RedditSourceModule } from '../reddit-source/reddit-source.module';

@Module({
  imports: [LlmModule, RedditSourceModule, QueriesModule],
  controllers: [TrackerController],
  providers: [TrackerService],
  exports: [TrackerService],
})
export class TrackerModule {}
