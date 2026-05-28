/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { TransformInterceptor } from './../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';

process.env.API_KEY = 'test-api-key';
process.env.API_KEY_FRONTEND = 'test-frontend-api-key';
process.env.SII_AMBIENTE = '0';
process.env.NODE_ENV = 'test';
process.env.SII_PFX_PATH = '';
process.env.SII_PFX_PASSWORD = '';
process.env.SII_CAF_PATH = '';
process.env.SII_CAF_PATHS = '';

import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toBe('Hello World!');
        expect(res.body.timestamp).toBeDefined();
      });
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });
});
