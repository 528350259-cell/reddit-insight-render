import { Module } from '@nestjs/common';
import { DreamInsightService } from './dream-insight.service';

@Module({
  providers: [DreamInsightService],
  exports: [DreamInsightService],
})
export class DreamInsightModule {}
