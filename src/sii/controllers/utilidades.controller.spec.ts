import { Test, TestingModule } from '@nestjs/testing';
import { UtilidadesController } from './utilidades.controller';
import { SiiService } from '../sii.service';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

describe('UtilidadesController', () => {
  let controller: UtilidadesController;
  let service: SiiService;

  const mockSiiService = {
    generarSobreEnvio: jest.fn(),
    generarRvd: jest.fn(),
    obtenerTimbre: jest.fn(),
    obtenerMuestraImpresa: jest.fn(),
    validarDte: jest.fn(),
    obtenerFolios: jest.fn(),
  };

  const mockFile = { buffer: Buffer.from('mock') } as Express.Multer.File;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UtilidadesController],
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

    controller = module.get<UtilidadesController>(UtilidadesController);
    service = module.get<SiiService>(SiiService);
  });

  it('debería estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('validarDte', () => {
    it('debería validar xml', async () => {
      mockSiiService.validarDte.mockResolvedValue({ valid: true });
      const result = await controller.validarDte('base64');
      expect(result).toEqual({ valid: true });
    });

    it('error si falta xml', async () => {
      await expect(controller.validarDte('')).rejects.toThrow(BadRequestException);
    });
  });
});
