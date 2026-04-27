import { Test, TestingModule } from '@nestjs/testing';
import { FacturaController } from './factura.controller';
import { SiiService } from '../sii.service';
import { BadRequestException } from '@nestjs/common';
import { EmitirFacturaDto } from '../dto/emitir-factura.dto';
import { EmitirNotaCreditoDto } from '../dto/emitir-nota-credito.dto';
import { ConfigService } from '@nestjs/config';

describe('FacturaController', () => {
  let controller: FacturaController;
  let service: SiiService;

  const mockSiiService = {
    emitirFactura: jest.fn(),
    emitirNotaCredito: jest.fn(),
  };

  const mockFile = { buffer: Buffer.from('mock') } as Express.Multer.File;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FacturaController],
      providers: [
        {
          provide: SiiService,
          useValue: mockSiiService,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<FacturaController>(FacturaController);
    service = module.get<SiiService>(SiiService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debería estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('emitirFactura', () => {
    it('debería emitir una factura', async () => {
      const mockDto: Partial<EmitirFacturaDto> = { IdentificacionDTE: { Folio: 100, TipoDTE: 33, FechaEmision: '2023-01-01' } };
      const mockResponse = { trackId: '456' };
      mockSiiService.emitirFactura.mockResolvedValue(mockResponse);

      const result = await controller.emitirFactura(JSON.stringify(mockDto), {
        certificado: [mockFile],
        caf: [mockFile],
      });

      expect(result).toEqual(mockResponse);
      expect(service.emitirFactura).toHaveBeenCalledWith(mockDto, mockFile, mockFile);
    });

    it('debería lanzar BadRequestException si falta un archivo', async () => {
      await expect(
        controller.emitirFactura('{}', { certificado: [mockFile] })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('emitirNotaCredito', () => {
    it('debería emitir una nota de crédito', async () => {
      const mockDto: Partial<EmitirNotaCreditoDto> = { IdentificacionDTE: { Folio: 200, TipoDTE: 61, FechaEmision: '2023-01-01' } };
      const mockResponse = { trackId: '789' };
      mockSiiService.emitirNotaCredito.mockResolvedValue(mockResponse);

      const result = await controller.emitirNotaCredito(JSON.stringify(mockDto), {
        certificado: [mockFile],
        caf: [mockFile],
      });

      expect(result).toEqual(mockResponse);
      expect(service.emitirNotaCredito).toHaveBeenCalledWith(mockDto, mockFile, mockFile);
    });
  });
});
