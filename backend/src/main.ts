import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { PrismaService } from './common/prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });

  // --- Bezpieczeństwo (sekcja "Bezpieczeństwo" specyfikacji) ---
  app.use(helmet()); // nagłówki chroniące przed XSS, clickjacking itd.
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.FRONTEND_URL,
    credentials: true, // wymagane dla httpOnly cookie z refresh tokenem
  });

  // Walidacja + sanityzacja wejścia na WSZYSTKICH endpointach — chroni
  // przed SQL Injection (Prisma parametryzuje zapytania) i nadmiarowymi polami
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const prismaService = app.get(PrismaService);
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
    new AuditLogInterceptor(prismaService),
  );

  app.setGlobalPrefix('', { exclude: [] });

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`ERP Elektryk backend nasłuchuje na porcie ${port}`);
}

bootstrap();
