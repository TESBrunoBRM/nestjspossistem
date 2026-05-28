import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

export function IsRut(validationOptions?: ValidationOptions) {
  return function (object: NonNullable<unknown>, propertyName: string) {
    registerDecorator({
      name: 'isRut',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;

          // Valida formato: 12345678-9 o 12.345.678-9
          const rutRegex =
            /^[0-9]{1,2}(?:\.[0-9]{3}){2}-[\dkK]$|^[0-9]{7,8}-[\dkK]$/i;
          if (!rutRegex.test(value)) return false;

          // Validación matemática (Módulo 11)
          const cleanRut = value.replace(/\./g, '').toUpperCase();
          const [numStr, dv] = cleanRut.split('-');
          let num = parseInt(numStr, 10);

          let m = 0;
          let s = 1;
          for (; num; num = Math.floor(num / 10)) {
            s = (s + (num % 10) * (9 - (m++ % 6))) % 11;
          }
          const expectedDv = s ? String(s - 1) : 'K';

          return dv === expectedDv;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} no es un RUT válido (formato esperado: 12345678-9 o 12.345.678-9 y dígito verificador correcto)`;
        },
      },
    });
  };
}
