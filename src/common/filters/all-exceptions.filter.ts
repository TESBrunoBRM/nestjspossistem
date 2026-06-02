/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { toPublicSiiError } from 'sii-engine';
import { sanitizePublicPayload } from '../security/sensitive-redaction.util';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: any = null;
    let code = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        message = (exceptionResponse as any).message || message;
        details = (exceptionResponse as any).message; // Typical class-validator validation response
        code = (exceptionResponse as any).error || 'HTTP_EXCEPTION';

        // If it's a validation array, wrap it nicely
        if (Array.isArray(details)) {
          message = 'Validation failed';
          code = 'VALIDATION_ERROR';
        }
      }
    } else if (exception instanceof Error) {
      // It's a standard Error that was unhandled
      this.logger.error(
        sanitizePublicPayload(`[Unhandled Exception] ${exception.message}`),
        sanitizePublicPayload(exception.stack),
      );
      if (process.env.NODE_ENV !== 'production') {
        message = exception.message;
      }
    }

    // Log the error for internal tracking
    const logMessage = sanitizePublicPayload(
      `${request.method} ${request.url} [${status}]: ${message}`,
    );
    if (Number(status) >= 500) {
      this.logger.error(
        logMessage,
        exception instanceof Error
          ? sanitizePublicPayload(exception.stack)
          : undefined,
      );
    } else {
      this.logger.warn(logMessage);
    }

    // Sanitization: hide XML, certificate refs, and paths from production responses
    // Use sii-engine helpers to sanitize Sii errors
    let finalMessage = message;
    let finalDetails = details;

    if (exception instanceof Error || typeof exception === 'object') {
      try {
        const publicErr = toPublicSiiError(exception);
        finalMessage = publicErr.message;
        if (publicErr.code) {
          code = publicErr.code;
        }
        if ((publicErr as any).details) {
          finalDetails = (publicErr as any).details;
        }
      } catch {
        // Fallback si no es un error que pueda ser procesado por sii-engine (aunque toPublicSiiError maneja unknown)
      }
    }

    if (
      process.env.NODE_ENV === 'production' &&
      typeof finalMessage === 'string'
    ) {
      finalMessage = finalMessage.replace(/<[^>]*>?/gm, '[XML REDACTED]');
      if (Number(status) >= 500) {
        finalMessage = 'Internal server error';
        finalDetails = null;
      }
    }

    // Send the standardized response (excluding path and raw details if not in dev, but for now we sanitize)
    response.status(status).json(
      sanitizePublicPayload({
        success: false,
        error: {
          statusCode: status,
          message: finalMessage,
          details: finalDetails,
          code,
        },
        timestamp: new Date().toISOString(),
        // Path is omitted from public response for security
      }),
    );
  }
}
