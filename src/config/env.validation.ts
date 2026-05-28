import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsString,
  IsOptional,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV?: Environment;

  @IsNumber()
  @IsOptional()
  PORT?: number;

  @IsString()
  @IsOptional()
  CORS_ORIGIN?: string;

  @IsString()
  API_KEY_FRONTEND: string;

  @IsNumber()
  @IsOptional()
  SII_AMBIENTE?: number;

  @IsString()
  @IsOptional()
  SII_RUT_EMISOR?: string;

  @IsString()
  @IsOptional()
  SII_RUT_FIRMANTE?: string;

  @IsString()
  @IsOptional()
  SII_CERT_REF?: string;

  @IsString()
  @IsOptional()
  SII_CERT_FINGERPRINT?: string;

  @IsString()
  @IsOptional()
  SII_FECHA_RESOLUCION?: string;

  @IsNumber()
  @IsOptional()
  SII_NRO_RESOLUCION?: number;

  @IsString()
  @IsOptional()
  SII_PFX_PATH?: string;

  @IsString()
  @IsOptional()
  SII_PFX_PASSWORD?: string;

  @IsString()
  @IsOptional()
  SII_CERT_PEM_PATH?: string;

  @IsString()
  @IsOptional()
  SII_KEY_PEM_PATH?: string;

  @IsString()
  @IsOptional()
  SII_CAF_PATH?: string;

  @IsString()
  @IsOptional()
  SII_CAF_PATHS?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const legacyExternalApiPrefix = ['SIMPLE', 'API_'].join('');
  const legacySimpleApiKeys = Object.keys(config).filter((key) =>
    key.startsWith(legacyExternalApiPrefix),
  );

  if (legacySimpleApiKeys.length > 0) {
    throw new Error(
      `Error de validacion de variables de entorno: variables externas heredadas no permitidas (${legacySimpleApiKeys.join(', ')})`,
    );
  }

  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Error de validación de variables de entorno: \n${errors.toString()}`,
    );
  }

  if (validatedConfig.NODE_ENV === Environment.Production) {
    assertNoProductionFiscalBootstrap(validatedConfig);
  }

  if (validatedConfig.SII_PFX_PATH && !validatedConfig.SII_PFX_PASSWORD) {
    throw new Error(
      'Error de validacion de variables de entorno: SII_PFX_PASSWORD es requerido cuando SII_PFX_PATH esta configurado',
    );
  }

  return validatedConfig;
}

function assertNoProductionFiscalBootstrap(config: EnvironmentVariables): void {
  const forbiddenKeys: Array<keyof EnvironmentVariables> = [
    'SII_AMBIENTE',
    'SII_RUT_EMISOR',
    'SII_RUT_FIRMANTE',
    'SII_CERT_REF',
    'SII_CERT_FINGERPRINT',
    'SII_FECHA_RESOLUCION',
    'SII_NRO_RESOLUCION',
    'SII_PFX_PATH',
    'SII_PFX_PASSWORD',
    'SII_CERT_PEM_PATH',
    'SII_KEY_PEM_PATH',
    'SII_CAF_PATH',
    'SII_CAF_PATHS',
  ];
  const configuredKeys = forbiddenKeys.filter((key) => {
    const value = config[key];
    return value !== undefined && value !== '';
  });

  if (configuredKeys.length > 0) {
    throw new Error(
      `Error de validacion de variables de entorno: bootstrap fiscal por .env no permitido en produccion (${configuredKeys.join(', ')}). Use providers productivos por tenant/emisor.`,
    );
  }
}
