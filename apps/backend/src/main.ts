import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './shared/filters/all-exceptions.filter';

function normalizeCorsOrigins(value?: string): string[] | undefined {
  if (!value) return undefined;

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .flatMap((origin) => {
      if (/^https?:\/\//i.test(origin)) return [origin];
      return [`https://${origin}`, `http://${origin}`];
    });
}

function useAccessPassword(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.APP_ACCESS_PASSWORD?.trim();
  if (!expected || req.method === 'OPTIONS' || req.path === '/healthz') {
    next();
    return;
  }

  const headerPassword = req.header('x-app-password')?.trim();
  const bearerPassword = req
    .header('authorization')
    ?.replace(/^Bearer\s+/i, '')
    .trim();

  if (headerPassword === expected || bearerPassword === expected) {
    next();
    return;
  }

  res.status(401).json({ message: '请输入正确的访问口令。' });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();

  app.enableCors({
    origin: normalizeCorsOrigins(process.env.PUBLIC_FRONTEND_URL),
    credentials: true,
  });

  app.use(useAccessPassword);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(process.env.PORT ?? 5002);
}

void bootstrap();
