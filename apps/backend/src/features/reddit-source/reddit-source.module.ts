import { Module } from '@nestjs/common';
import { DecodoModule } from '../decodo/decodo.module';
import { SettingsModule } from '../settings/settings.module';
import { RedditDirectService } from './reddit-direct.service';
import { RedditSourceService } from './reddit-source.service';

@Module({
  imports: [DecodoModule, SettingsModule],
  providers: [RedditDirectService, RedditSourceService],
  exports: [RedditSourceService],
})
export class RedditSourceModule {}
