import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import type {
  DynamicModule,
  ForwardReference,
  Type,
} from '@nestjs/common/interfaces';
import { TransformInterceptor } from '../../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';

export async function createFiscalTestApp(): Promise<INestApplication> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AppModule } = require('../../src/app.module') as {
    AppModule:
      | Type<unknown>
      | DynamicModule
      | Promise<DynamicModule>
      | ForwardReference<unknown>;
  };
  jest.spyOn(ThrottlerGuard.prototype, 'canActivate').mockResolvedValue(true);

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(APP_GUARD)
    .useValue({ canActivate: () => true })
    .compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return app;
}
