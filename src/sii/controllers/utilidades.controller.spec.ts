import { Test, TestingModule } from '@nestjs/testing';
import { UtilidadesController } from './utilidades.controller';
import { SiiService } from '../sii.service';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TimbreRequestDto } from '../dto/utilidades-timbre.dto';
import { MuestraImpresaRequestDto } from '../dto/utilidades-muestra-impresa.dto';
import { RvdRequestDto } from '../dto/utilidades-rvd.dto';
import { FoliosRequestDto } from '../dto/utilidades-folios.dto';
import { SobreEnvioRequestDto } from '../dto/utilidades-sobre-envio.dto';

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

  const mockCertFile = {
    buffer: Buffer.from('mock'),
    originalname: 'cert.pfx',
  } as Express.Multer.File;

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

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debería estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('validarDte', () => {
    it('debería validar xml', async () => {
      mockSiiService.validarDte.mockResolvedValue({ valid: true });
      const result = await controller.validarDte('base64data');
      expect(result).toEqual({ valid: true });
    });

    it('error si falta xml', async () => {
      await expect(controller.validarDte('')).rejects.toThrow(BadRequestException);
    });

    it('error si xml es solo espacios', async () => {
      await expect(controller.validarDte('   ')).rejects.toThrow(BadRequestException);
    });
  });

  describe('obtenerTimbre', () => {
    it('debería obtener timbre con DTO validado', async () => {
      const dto: TimbreRequestDto = { xmlBase64: 'PD94bWw...' };
      mockSiiService.obtenerTimbre.mockResolvedValue({ timbreBase64: 'abc' });

      const result = await controller.obtenerTimbre(dto);
      expect(result).toEqual({ timbreBase64: 'abc' });
      expect(service.obtenerTimbre).toHaveBeenCalledWith(dto);
    });
  });

  describe('obtenerMuestraImpresa', () => {
    it('debería obtener muestra impresa con DTO validado', async () => {
      const dto: MuestraImpresaRequestDto = { xmlBase64: 'PD94bWw...' };
      mockSiiService.obtenerMuestraImpresa.mockResolvedValue({ pdfBase64: 'abc' });

      const result = await controller.obtenerMuestraImpresa(dto);
      expect(result).toEqual({ pdfBase64: 'abc' });
      expect(service.obtenerMuestraImpresa).toHaveBeenCalledWith(dto);
    });
  });

  describe('generarRvd', () => {
    it('debería generar RVD con DTO validado y archivo .pfx', async () => {
      const dto = {
        RutEmpresa: '76123456-7',
        FechaResumen: '2023-10-25',
        Ambiente: 0,
        Certificado: { Rut: '12345678-9', Password: 'pass' },
      } as RvdRequestDto;
      mockSiiService.generarRvd.mockResolvedValue({ success: true });

      const result = await controller.generarRvd(dto, { certificado: [mockCertFile] });
      expect(result).toEqual({ success: true });
      expect(service.generarRvd).toHaveBeenCalledWith(dto, mockCertFile);
    });

    it('debería lanzar error si falta certificado', async () => {
      const dto = {} as RvdRequestDto;
      await expect(
        controller.generarRvd(dto, {}),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('obtenerFolios', () => {
    it('debería obtener folios con DTO validado', async () => {
      const dto = {
        RutEmpresa: '76123456-7',
        TipoDTE: 33,
        Cantidad: 10,
        Ambiente: 0,
        Certificado: { Rut: '12345678-9', Password: 'pass' },
      } as FoliosRequestDto;
      mockSiiService.obtenerFolios.mockResolvedValue({ cafBase64: 'abc' });

      const result = await controller.obtenerFolios(dto, { certificado: [mockCertFile] });
      expect(result).toEqual({ cafBase64: 'abc' });
      expect(service.obtenerFolios).toHaveBeenCalledWith(dto, mockCertFile);
    });
  });

  describe('generarSobreEnvio', () => {
    it('debería generar sobre de envío con DTO validado', async () => {
      const dto = {
        RutEmpresa: '76123456-7',
        RutReceptor: '60803000-K',
        Ambiente: 0,
        Certificado: { Rut: '12345678-9', Password: 'pass' },
      } as SobreEnvioRequestDto;
      mockSiiService.generarSobreEnvio.mockResolvedValue({ xmlSobre: 'abc' });

      const result = await controller.generarSobreEnvio(dto, { certificado: [mockCertFile] });
      expect(result).toEqual({ xmlSobre: 'abc' });
      expect(service.generarSobreEnvio).toHaveBeenCalledWith(dto, mockCertFile);
    });
  });
});
