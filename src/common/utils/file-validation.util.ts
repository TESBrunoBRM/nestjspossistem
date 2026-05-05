import { BadRequestException } from '@nestjs/common';

export interface FileValidationOptions {
  /** Extensiones permitidas incluyendo el punto, ej: ['.pfx', '.p12'] */
  allowedExtensions: string[];
  /** Tamaño máximo en bytes (por defecto 5 MB) */
  maxSizeBytes?: number;
  /** Nombre descriptivo del campo para mensajes de error */
  fieldName: string;
}

/**
 * Valida un archivo subido por Multer.
 * Lanza BadRequestException si:
 * - El archivo es undefined/null
 * - La extensión no está en la lista permitida
 * - El archivo excede el tamaño máximo
 * - El buffer está vacío
 */
export function validateUploadedFile(
  file: Express.Multer.File | undefined,
  options: FileValidationOptions,
): asserts file is Express.Multer.File {
  const { allowedExtensions, maxSizeBytes = 5 * 1024 * 1024, fieldName } = options;

  if (!file) {
    throw new BadRequestException(`Se requiere el archivo "${fieldName}"`);
  }

  if (!file.buffer || file.buffer.length === 0) {
    throw new BadRequestException(`El archivo "${fieldName}" está vacío`);
  }

  if (file.buffer.length > maxSizeBytes) {
    const maxMB = (maxSizeBytes / (1024 * 1024)).toFixed(1);
    throw new BadRequestException(
      `El archivo "${fieldName}" excede el tamaño máximo de ${maxMB} MB`,
    );
  }

  const originalName = file.originalname?.toLowerCase() ?? '';
  const hasValidExtension = allowedExtensions.some((ext) =>
    originalName.endsWith(ext.toLowerCase()),
  );

  if (!hasValidExtension) {
    throw new BadRequestException(
      `El archivo "${fieldName}" debe tener extensión: ${allowedExtensions.join(', ')}`,
    );
  }
}

/**
 * Valida el archivo de certificado digital (.pfx o .p12)
 */
export function validateCertificadoFile(
  file: Express.Multer.File | undefined,
): asserts file is Express.Multer.File {
  validateUploadedFile(file, {
    allowedExtensions: ['.pfx', '.p12'],
    fieldName: 'certificado',
  });
}

/**
 * Valida el archivo de folios CAF (.xml)
 */
export function validateCafFile(
  file: Express.Multer.File | undefined,
): asserts file is Express.Multer.File {
  validateUploadedFile(file, {
    allowedExtensions: ['.xml'],
    fieldName: 'caf',
  });
}
