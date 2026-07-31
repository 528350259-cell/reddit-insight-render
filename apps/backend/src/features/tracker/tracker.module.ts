import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LlmModule } from '../llm/llm.module';
import { QueriesModule } from '../queries/queries.module';
import { TrackerController } from './tracker.controller';
import { TrackerService } from './tracker.service';
import { RedditSourceModule } from '../reddit-source/reddit-source.module';
import { AnalysisTask, AnalysisTaskSchema } from './analysis-task.schema';
import { AnalysisTaskService } from './analysis-task.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: AnalysisTask.name, schema: AnalysisTaskSchema }]),
    LlmModule,
    RedditSourceModule,
    QueriesModule,
  ],
  controllers: [TrackerController],
  providers: [TrackerService, AnalysisTaskService],
  exports: [TrackerService, AnalysisTaskService],
})
export class TrackerModule {}
