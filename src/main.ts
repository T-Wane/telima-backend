import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
    }),
  );

  const storageProvider = configService.get<string>('STORAGE_PROVIDER', 'local');
  if (storageProvider === 'local') {
    app.useStaticAssets(
      join(process.cwd(), configService.get<string>('STORAGE_LOCAL_PATH', './uploads')),
      {
        prefix: '/uploads/',
      },
    );
  }

  const corsOrigins = (configService.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // En dev, on ajoute toujours les origines locales du dashboard
  const devOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:5175',
    'http://127.0.0.1:5175',
  ];
  const allOrigins = [...new Set([...corsOrigins, ...devOrigins])];

  const isProd = configService.get<string>('NODE_ENV') === 'production';

  app.enableCors({
    origin: allOrigins.length > 0 ? allOrigins : !isProd,
    credentials: true,
  });

  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  if (!isProd || configService.get<string>('SWAGGER_ENABLED') === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Telima API')
      .setDescription('Backend VTC & Livraison Telima')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  const port = configService.get<number>('PORT') ?? 3000;
  await app.listen(port);
  logger.log(`Telima backend listening on port ${port}`);
}

bootstrap();
