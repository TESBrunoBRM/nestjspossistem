import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKeyHeader =
      request.get('x-api-key') ?? request.headers['x-api-key'];
    const providedApiKey = Array.isArray(apiKeyHeader)
      ? apiKeyHeader[0]
      : apiKeyHeader;

    // Obtener la API Key configurada para el Frontend
    const validApiKey = this.configService.get<string>('API_KEY_FRONTEND');

    // Si no está configurada la llave en el entorno, por seguridad rechazamos todo
    if (!validApiKey) {
      throw new UnauthorizedException('API Key no configurada en el servidor');
    }

    if (!providedApiKey) {
      throw new UnauthorizedException(
        'Acceso no autorizado: falta el header x-api-key',
      );
    }

    if (providedApiKey !== validApiKey) {
      throw new UnauthorizedException('Acceso no autorizado: API Key inválida');
    }

    return true;
  }
}
