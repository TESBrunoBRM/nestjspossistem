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

  const mockCertFile = {
    buffer: Buffer.from('mock'),
    originalname: 'cert.pfx',
  } as Express.Multer.File;

  const mockCafFile = {
    buffer: Buffer.from('mock'),
    originalname: 'folios.xml',
  } as Express.Multer.File;

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
    it('debería emitir una factura con DTO validado por ParseJsonPipe', async () => {
      const mockDto = {
        IdentificacionDTE: { Folio: 100, TipoDTE: 33, FechaEmision: '2023-01-01' },
      } as EmitirFacturaDto;
      const mockResponse = { trackId: '456' };
      mockSiiService.emitirFactura.mockResolvedValue(mockResponse);

      const result = await controller.emitirFactura(mockDto, {
        certificado: [mockCertFile],
        caf: [mockCafFile],
      });

      expect(result).toEqual(mockResponse);
      expect(service.emitirFactura).toHaveBeenCalledWith(mockDto, mockCertFile, mockCafFile);
    });

    it('debería lanzar BadRequestException si falta un archivo', async () => {
      const mockDto = {} as EmitirFacturaDto;
      await expect(
        controller.emitirFactura(mockDto, { certificado: [mockCertFile] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debería lanzar BadRequestException si el certificado tiene extensión inválida', async () => {
      const badFile = {
        buffer: Buffer.from('mock'),
        originalname: 'cert.txt',
      } as Express.Multer.File;
      const mockDto = {} as EmitirFacturaDto;

      await expect(
        controller.emitirFactura(mockDto, {
          certificado: [badFile],
          caf: [mockCafFile],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('emitirNotaCredito', () => {
    it('debería emitir una nota de crédito con DTO validado por ParseJsonPipe', async () => {
      const mockDto = {
        IdentificacionDTE: { Folio: 200, TipoDTE: 61, FechaEmision: '2023-01-01' },
      } as EmitirNotaCreditoDto;
      const mockResponse = { trackId: '789' };
      mockSiiService.emitirNotaCredito.mockResolvedValue(mockResponse);

      const result = await controller.emitirNotaCredito(mockDto, {
        certificado: [mockCertFile],
        caf: [mockCafFile],
      });

      expect(result).toEqual(mockResponse);
      expect(service.emitirNotaCredito).toHaveBeenCalledWith(mockDto, mockCertFile, mockCafFile);
    });

    it('debería lanzar BadRequestException si falta certificado', async () => {
      const mockDto = {} as EmitirNotaCreditoDto;
      await expect(
        controller.emitirNotaCredito(mockDto, { caf: [mockCafFile] }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
