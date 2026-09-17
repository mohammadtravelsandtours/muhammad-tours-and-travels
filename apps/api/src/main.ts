import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // The API normally sits behind Caddy/Nginx on the Hostinger VPS. Trusting
  // exactly one proxy hop lets Express/Nest rate limiting and request logs
  // see the real client IP instead of treating every visitor as the proxy.
  if (config.get<string>('nodeEnv') === 'production') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  // Standard security headers (HSTS, X-Content-Type-Options,
  // X-Frame-Options, a conservative default CSP, etc.) — cheap,
  // uncontroversial hardening that costs nothing for an API-only
  // service with no server-rendered HTML of its own.
  app.use(helmet());

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const corsOrigins = config.get<string[]>('corsOrigins') ?? [];
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
  });

  const port = config.get<number>('port') ?? 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Muhammad Tours and Travels API listening on :${port} (prefix: /api/v1)`);
}

bootstrap();
