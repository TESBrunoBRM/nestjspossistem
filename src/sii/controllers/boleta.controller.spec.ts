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

  const mockFile = {
    buffer: Buffer.from('mock'),
    originalname: 'cert.pfx',
  } as Express.Multer.File;

  const mockCafFile = {
    buffer: Buffer.from('mock'),
    originalname: 'folios.xml',
  } as Express.Multer.File;

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
    it('debería emitir una boleta con datos validados', async () => {
      const mockDto = {
        IdentificacionDTE: { Folio: 123, TipoDTE: 39, FechaEmision: '2023-01-01' },
      } as EmitirBoletaDto;
      const mockResponse = { trackId: '123' };
      mockSiiService.emitirBoleta.mockResolvedValue(mockResponse);

      // ParseJsonPipe ya habrá transformado el string → dto cuando llega al controller
      const result = await controller.emitirBoleta(mockDto, {
        certificado: [mockFile],
        caf: [mockCafFile],
      });

      expect(result).toEqual(mockResponse);
      expect(service.emitirBoleta).toHaveBeenCalledWith(mockDto, mockFile, mockCafFile);
    });

    it('debería lanzar BadRequestException si falta el archivo certificado', async () => {
      const mockDto = {} as EmitirBoletaDto;
      await expect(
        controller.emitirBoleta(mockDto, { caf: [mockCafFile] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debería lanzar BadRequestException si falta el archivo caf', async () => {
      const mockDto = {} as EmitirBoletaDto;
      await expect(
        controller.emitirBoleta(mockDto, { certificado: [mockFile] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debería lanzar BadRequestException si el certificado tiene extensión inválida', async () => {
      const badFile = {
        buffer: Buffer.from('mock'),
        originalname: 'cert.txt',
      } as Express.Multer.File;
      const mockDto = {} as EmitirBoletaDto;

      await expect(
        controller.emitirBoleta(mockDto, {
          certificado: [badFile],
          caf: [mockCafFile],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
