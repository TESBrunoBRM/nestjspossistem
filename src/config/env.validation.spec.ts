import 'reflect-metadata';
import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  it('rejects fixed fiscal bootstrap variables in production', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        API_KEY_FRONTEND: 'prod-key',
        SII_RUT_EMISOR: '76123456-7',
      }),
    ).toThrow('bootstrap fiscal por .env no permitido en produccion');
  });

  it('allows local fiscal bootstrap outside production', () => {
    expect(
      validateEnv({
        NODE_ENV: 'test',
        API_KEY_FRONTEND: 'test-key',
        SII_RUT_EMISOR: '76123456-7',
        SII_AMBIENTE: 0,
      }),
    ).toMatchObject({
      NODE_ENV: 'test',
      API_KEY_FRONTEND: 'test-key',
      SII_RUT_EMISOR: '76123456-7',
      SII_AMBIENTE: 0,
    });
  });

  it('allows local AWS endpoint overrides for ministack development', () => {
    expect(
      validateEnv({
        NODE_ENV: 'test',
        API_KEY_FRONTEND: 'test-key',
        AWS_REGION: 'us-east-1',
        AWS_ENDPOINT_URL: 'http://127.0.0.1:4566',
        AWS_FISCAL_DDB_TABLE: 'business-app-sii-fiscal',
        AWS_FISCAL_DDB_ENDPOINT: 'http://127.0.0.1:4566',
        AWS_FISCAL_S3_BUCKET: 'business-app-sii-fiscal',
        AWS_FISCAL_S3_ENDPOINT: 'http://127.0.0.1:4566',
        AWS_FISCAL_S3_FORCE_PATH_STYLE: 'true',
        AWS_FISCAL_SSM_ENDPOINT: 'http://127.0.0.1:4566',
        AWS_FISCAL_SSM_PREFIX: '/business-app-sii/fiscal',
      }),
    ).toMatchObject({
      AWS_REGION: 'us-east-1',
      AWS_ENDPOINT_URL: 'http://127.0.0.1:4566',
      AWS_FISCAL_DDB_TABLE: 'business-app-sii-fiscal',
      AWS_FISCAL_DDB_ENDPOINT: 'http://127.0.0.1:4566',
      AWS_FISCAL_S3_BUCKET: 'business-app-sii-fiscal',
      AWS_FISCAL_S3_ENDPOINT: 'http://127.0.0.1:4566',
      AWS_FISCAL_S3_FORCE_PATH_STYLE: true,
      AWS_FISCAL_SSM_ENDPOINT: 'http://127.0.0.1:4566',
      AWS_FISCAL_SSM_PREFIX: '/business-app-sii/fiscal',
    });
  });
});
