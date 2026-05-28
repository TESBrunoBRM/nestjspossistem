import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const isProduction = process.env.NODE_ENV === 'production';

  // Seguridad: Cabeceras HTTP seguras
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://fonts.googleapis.com',
          ],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'https:'],
          scriptSrcAttr: ["'unsafe-inline'"],
        },
      },
    }),
  );

  // Habilitar CORS — restrictivo en producción
  const corsOrigin = process.env.CORS_ORIGIN || '*';
  let allowedOrigins: boolean | string[] = true;

  if (isProduction && corsOrigin === '*') {
    logger.warn(
      '⚠️  CORS_ORIGIN está configurado como "*" en producción. ' +
        'Se ha restringido por seguridad. Debes configurar orígenes explícitos.',
    );
    allowedOrigins = false; // Desactivar CORS abierto en prod si no se configuran orígenes
  } else if (corsOrigin !== '*') {
    allowedOrigins = corsOrigin.split(',').map((o) => o.trim());
  }

  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'x-api-key', 'Authorization'],
    credentials: true,
  });

  // Validación global de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Elimina campos no declarados en el DTO
      forbidNonWhitelisted: true,
      transform: true, // Convierte tipos automáticamente
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Prefijo global de la API
  app.setGlobalPrefix('api');

  // Registrar interceptor y filtro globales
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  // Configuración de Swagger (disponible en /api para referencia del equipo)
  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('API POS System - Integración SII')
      .setDescription(
        'Documentación de la API para el sistema POS y su integración directa con el SII mediante sii-engine.',
      )
      .setVersion('1.0')
      .addApiKey(
        { type: 'apiKey', name: 'x-api-key', in: 'header' },
        'x-api-key',
      )
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
    logger.log('📄 Swagger UI disponible en /api');
  } else {
    logger.log('🛡️  Swagger deshabilitado en modo producción por seguridad.');
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`🚀 Servidor corriendo en http://localhost:${port}/api`);
}
void bootstrap();
