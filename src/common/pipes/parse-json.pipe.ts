import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

/** Tamaño máximo del string JSON entrante: 1 MB */
const MAX_JSON_LENGTH = 1 * 1024 * 1024;

@Injectable()
export class ParseJsonPipe<T extends object> implements PipeTransform<
  string,
  Promise<T>
> {
  constructor(
    private readonly targetType: Type<T>,
    private readonly options: { strict?: boolean } = { strict: true },
  ) {}

  async transform(value: string): Promise<T> {
    if (!value) {
      throw new BadRequestException('El campo JSON es requerido');
    }

    if (typeof value !== 'string') {
      throw new BadRequestException('El campo JSON debe ser un string');
    }

    if (value.length > MAX_JSON_LENGTH) {
      throw new BadRequestException(
        `El payload JSON excede el tamaño máximo permitido (${(MAX_JSON_LENGTH / 1024).toFixed(0)} KB)`,
      );
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(value) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('El campo no es un JSON válido');
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new BadRequestException(
        'El JSON debe ser un objeto, no un arreglo ni un valor primitivo',
      );
    }

    const object = plainToInstance(this.targetType, parsed);
    const errors = await validate(object as object, {
      whitelist: this.options.strict !== false,
      forbidNonWhitelisted: this.options.strict !== false,
    });

    if (errors.length > 0) {
      const messages = this.flattenErrors(errors);
      throw new BadRequestException({
        message: 'Validación fallida en los datos JSON',
        errors: messages,
      });
    }

    return object;
  }

  /**
   * Aplana errores de validación recursivos para sub-DTOs anidados.
   */
  private flattenErrors(
    errors: Array<{
      property: string;
      constraints?: Record<string, string>;
      children?: unknown[];
    }>,
    parentPath = '',
  ): Array<{ property: string; constraints?: Record<string, string> }> {
    const result: Array<{
      property: string;
      constraints?: Record<string, string>;
    }> = [];

    for (const err of errors) {
      const path = parentPath ? `${parentPath}.${err.property}` : err.property;

      if (err.constraints) {
        result.push({ property: path, constraints: err.constraints });
      }

      if (
        err.children &&
        Array.isArray(err.children) &&
        err.children.length > 0
      ) {
        result.push(
          ...this.flattenErrors(
            err.children as Array<{
              property: string;
              constraints?: Record<string, string>;
              children?: unknown[];
            }>,
            path,
          ),
        );
      }
    }

    return result;
  }
}
