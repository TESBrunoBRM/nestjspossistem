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
        allowKeys: allowedSensitiveKeysForRequest(request),
      });
    } catch {
      throw new BadRequestException(
        'El cuerpo de la solicitud contiene campos de seguridad prohibidos.',
      );
    }

    return next.handle();
  }
}

function allowedSensitiveKeysForRequest(request: {
  method?: string;
  originalUrl?: string;
  url?: string;
}): string[] {
  const url = request.originalUrl ?? request.url ?? '';

  if (
    request.method === 'POST' &&
    /\/api\/fiscal\/folios\/cafs(?:\?|$)/.test(url)
  ) {
    return ['cafXml'];
  }

  if (
    request.method === 'POST' &&
    /\/api\/fiscal\/issuers(?:\?|$)/.test(url)
  ) {
    return ['pfxBase64', 'pfxPassword'];
  }

  return [];
}
