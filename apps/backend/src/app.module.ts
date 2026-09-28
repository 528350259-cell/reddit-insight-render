import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule, DatabaseModule } from './shared';
import { FeishuModule } from './features/feishu/feishu.module';
import { QueriesModule } from './features/queries/queries.module';
import { SettingsModule } from './features/settings/settings.module';
import { TrackerModule } from './features/tracker/tracker.module';
import { TikhubModule } from './features/tikhub/tikhub.module';
import { DreamInsightModule } from './features/dream-insight/dream-insight.module';
import { MarketSignalsModule } from './features/market-signals/market-signals.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    QueriesModule,
    SettingsModule,
    TrackerModule,
    FeishuModule,
    TikhubModule,
    DreamInsightModule,
    MarketSignalsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
