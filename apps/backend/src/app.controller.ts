import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('healthz')
  healthz() {
    return {
      ok: true,
      service: 'reddit-insight-api',
      timestamp: new Date().toISOString(),
    };
  }
}
