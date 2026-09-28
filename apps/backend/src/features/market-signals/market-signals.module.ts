import { Module } from '@nestjs/common';
import { TikhubModule } from '../tikhub/tikhub.module';
import { DreamInsightModule } from '../dream-insight/dream-insight.module';
import { MarketSignalsController } from './market-signals.controller';
import { MarketSignalsService } from './market-signals.service';

@Module({
  imports: [TikhubModule, DreamInsightModule],
  controllers: [MarketSignalsController],
  providers: [MarketSignalsService],
})
export class MarketSignalsModule {}
