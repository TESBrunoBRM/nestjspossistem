import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { assertNoSensitiveKeys } from '../security/sensitive-redaction.util';

@Injectable()
export class SecurityInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<{
      body?: unknown;
      method?: string;
      originalUrl?: string;
      url?: string;
    }>();
    try {
      assertNoSensitiveKeys(request.body, {
        allowKeys: isCafImportEndpoint(request) ? ['cafXml'] : [],
      });
    } catch {
      throw new BadRequestException(
        'El cuerpo de la solicitud contiene campos de seguridad prohibidos.',
      );
    }

    return next.handle();
  }
}

function isCafImportEndpoint(request: {
  method?: string;
  originalUrl?: string;
  url?: string;
}): boolean {
  const url = request.originalUrl ?? request.url ?? '';
  return (
    request.method === 'POST' && /\/api\/fiscal\/folios\/cafs(?:\?|$)/.test(url)
  );
}
