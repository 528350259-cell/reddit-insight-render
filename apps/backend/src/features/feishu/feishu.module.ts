import { Module } from '@nestjs/common';
import { TrackerModule } from '../tracker/tracker.module';
import { FeishuController } from './feishu.controller';
import { FeishuService } from './feishu.service';
import { FeishuWsService } from './feishu.ws.service';

@Module({
  imports: [TrackerModule],
  controllers: [FeishuController],
  providers: [FeishuService, FeishuWsService],
})
export class FeishuModule {}
