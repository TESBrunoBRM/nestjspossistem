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
    it('debería retornar datos del contribuyente con RUT válido (sin puntos)', async () => {
      const mockRut = '76123456-7';
      const mockResponse = { razonSocial: 'Empresa Test' };
      mockSiiService.obtenerDatosEmpresa.mockResolvedValue(mockResponse);

      const result = await controller.obtenerDatosEmpresa(mockRut);

      expect(result).toEqual(mockResponse);
      expect(service.obtenerDatosEmpresa).toHaveBeenCalledWith(mockRut);
    });

    it('debería aceptar RUT con puntos', async () => {
      const mockRut = '76.123.456-7';
      const mockResponse = { razonSocial: 'Empresa Test' };
      mockSiiService.obtenerDatosEmpresa.mockResolvedValue(mockResponse);

      const result = await controller.obtenerDatosEmpresa(mockRut);
      expect(result).toEqual(mockResponse);
    });

    it('debería aceptar RUT con verificador K', async () => {
      const mockRut = '76123456-K';
      const mockResponse = { razonSocial: 'Empresa Test' };
      mockSiiService.obtenerDatosEmpresa.mockResolvedValue(mockResponse);

      const result = await controller.obtenerDatosEmpresa(mockRut);
      expect(result).toEqual(mockResponse);
    });

    it('debería lanzar BadRequestException si RUT está vacío', async () => {
      await expect(controller.obtenerDatosEmpresa('')).rejects.toThrow(BadRequestException);
    });

    it('debería lanzar BadRequestException si RUT tiene formato inválido', async () => {
      await expect(controller.obtenerDatosEmpresa('abc123')).rejects.toThrow(BadRequestException);
    });

    it('debería lanzar BadRequestException si RUT no tiene guión', async () => {
      await expect(controller.obtenerDatosEmpresa('76123456')).rejects.toThrow(BadRequestException);
    });
  });
});
