import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule, DatabaseModule } from './shared';
import { FeishuModule } from './features/feishu/feishu.module';
import { QueriesModule } from './features/queries/queries.module';
import { SettingsModule } from './features/settings/settings.module';
import { TrackerModule } from './features/tracker/tracker.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    QueriesModule,
    SettingsModule,
    TrackerModule,
    FeishuModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
