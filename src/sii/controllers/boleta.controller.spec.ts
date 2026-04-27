import { Test, TestingModule } from '@nestjs/testing';
import { BoletaController } from './boleta.controller';
import { SiiService } from '../sii.service';
import { BadRequestException } from '@nestjs/common';
import { EmitirBoletaDto } from '../dto/emitir-boleta.dto';
import { ConfigService } from '@nestjs/config';

describe('BoletaController', () => {
  let controller: BoletaController;
  let service: SiiService;

  const mockSiiService = {
    emitirBoleta: jest.fn(),
  };

  const mockFile = { buffer: Buffer.from('mock') } as Express.Multer.File;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BoletaController],
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

    controller = module.get<BoletaController>(BoletaController);
    service = module.get<SiiService>(SiiService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debería estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('emitirBoleta', () => {
    it('debería emitir una boleta', async () => {
      const mockDto: Partial<EmitirBoletaDto> = { IdentificacionDTE: { Folio: 123, TipoDTE: 39, FechaEmision: '2023-01-01' } };
      const mockResponse = { trackId: '123' };
      mockSiiService.emitirBoleta.mockResolvedValue(mockResponse);

      const result = await controller.emitirBoleta(JSON.stringify(mockDto), {
        certificado: [mockFile],
        caf: [mockFile],
      });

      expect(result).toEqual(mockResponse);
      expect(service.emitirBoleta).toHaveBeenCalledWith(mockDto, mockFile, mockFile);
    });

    it('debería lanzar BadRequestException si falta el archivo certificado', async () => {
      await expect(
        controller.emitirBoleta('{"datos":true}', { caf: [mockFile] })
      ).rejects.toThrow(BadRequestException);
    });

    it('debería lanzar BadRequestException si datos no es un JSON válido', async () => {
      await expect(
        controller.emitirBoleta('invalid_json', { certificado: [mockFile], caf: [mockFile] })
      ).rejects.toThrow(BadRequestException);
    });
  });
});
