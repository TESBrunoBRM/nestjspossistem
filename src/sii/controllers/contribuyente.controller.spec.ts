import { Test, TestingModule } from '@nestjs/testing';
import { ContribuyenteController } from './contribuyente.controller';
import { SiiService } from '../sii.service';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

describe('ContribuyenteController', () => {
  let controller: ContribuyenteController;
  let service: SiiService;

  const mockSiiService = {
    obtenerDatosEmpresa: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContribuyenteController],
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

    controller = module.get<ContribuyenteController>(ContribuyenteController);
    service = module.get<SiiService>(SiiService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debería estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('obtenerDatosEmpresa', () => {
    it('debería retornar datos del contribuyente', async () => {
      const mockRut = '76123456-7';
      const mockResponse = { razonSocial: 'Empresa Test' };
      mockSiiService.obtenerDatosEmpresa.mockResolvedValue(mockResponse);

      const result = await controller.obtenerDatosEmpresa(mockRut);

      expect(result).toEqual(mockResponse);
      expect(service.obtenerDatosEmpresa).toHaveBeenCalledWith(mockRut);
    });

    it('debería lanzar BadRequestException si no se envía rut (aunque el param suele obligarlo)', async () => {
      await expect(controller.obtenerDatosEmpresa('')).rejects.toThrow(BadRequestException);
    });
  });
});
