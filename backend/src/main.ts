import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required. Configure it in backend/.env before starting the API.');
  }

  if (!process.env.PLATFORM_DATABASE_URL?.trim()) {
    throw new Error('PLATFORM_DATABASE_URL is required for cross-tenant login and permission lookups.');
  }

  const jwtSecret = process.env.JWT_SECRET?.trim();
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set to a random value at least 32 characters long.');
  }

  const port = Number(process.env.PORT ?? 3005);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  const app = await NestFactory.create(AppModule);
  const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // Strips unknown properties and validates DTOs (e.g. LoginDto) automatically
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Kariakoo backend listening on http://localhost:${port}`);
}

bootstrap();
