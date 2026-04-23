import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKeyHeader = request.headers['x-api-key'];
    
    // Obtener la API Key configurada para el Frontend
    const validApiKey = this.configService.get<string>('API_KEY_FRONTEND');

    // Si no está configurada la llave en el entorno, por seguridad rechazamos todo
    if (!validApiKey) {
      throw new UnauthorizedException('API Key no configurada en el servidor');
    }

    if (apiKeyHeader !== validApiKey) {
      throw new UnauthorizedException('Acceso no autorizado: API Key inválida');
    }

    return true;
  }
}
