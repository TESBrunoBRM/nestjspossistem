import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

@Injectable()
export class ParseJsonPipe<T extends object> implements PipeTransform<string, Promise<T>> {
  constructor(
    private readonly targetType: Type<T>,
    private readonly options: { strict?: boolean } = { strict: true }
  ) {}

  async transform(value: string): Promise<T> {
    if (!value) {
      throw new BadRequestException('El campo JSON es requerido');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(value);
    } catch (e) {
      throw new BadRequestException('El campo no es un JSON válido');
    }

    const object = plainToInstance(this.targetType, parsed);
    const errors = await validate(object, {
      whitelist: this.options.strict,
      forbidNonWhitelisted: this.options.strict,
    });

    if (errors.length > 0) {
      const messages = errors.map((err) => ({
        property: err.property,
        constraints: err.constraints,
      }));
      throw new BadRequestException({
        message: 'Validación fallida en los datos JSON',
        errors: messages,
      });
    }

    return object;
  }
}
