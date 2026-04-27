import { Test, TestingModule } from '@nestjs/testing';
import { ConsultaController } from './consulta.controller';
import { SiiService } from '../sii.service';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

describe('ConsultaController', () => {
  let controller: ConsultaController;
  let service: SiiService;

  const mockSiiService = {
    consultarEstadoEnvio: jest.fn(),
    consultarEstadoDte: jest.fn(),
  };

  const mockCertificadoFile = {
    buffer: Buffer.from('mockCertificado'),
    originalname: 'cert.pfx',
  } as Express.Multer.File;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConsultaController],
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

    controller = module.get<ConsultaController>(ConsultaController);
    service = module.get<SiiService>(SiiService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debería estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('consultarEstadoEnvio', () => {
    it('debería retornar el estado del envío', async () => {
      const mockTrackId = '12345';
      const mockRutEmpresa = '76123456-7';
      const mockRutCert = '11223344-5';
      const mockPass = 'password';
      const mockResponse = { estado: 'RECIBIDO' };

      mockSiiService.consultarEstadoEnvio.mockResolvedValue(mockResponse);

      const result = await controller.consultarEstadoEnvio(
        mockTrackId,
        mockRutEmpresa,
        mockRutCert,
        mockPass,
        { certificado: [mockCertificadoFile] },
      );

      expect(result).toEqual(mockResponse);
      expect(service.consultarEstadoEnvio).toHaveBeenCalledWith(
        mockRutEmpresa,
        mockTrackId,
        mockCertificadoFile,
        mockRutCert,
        mockPass,
      );
    });

    it('debería lanzar error si falta el certificado', async () => {
      await expect(
        controller.consultarEstadoEnvio('123', 'emp', 'cert', 'pass', {}),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('consultarEstadoDte', () => {
    it('debería retornar el estado de un DTE individual', async () => {
      const mockResponse = { estado: 'ACEPTADO' };
      mockSiiService.consultarEstadoDte.mockResolvedValue(mockResponse);

      const result = await controller.consultarEstadoDte(
        'emp',
        'rec',
        '100',
        '33',
        '5000',
        '2023-10-10',
        'rutCert',
        'pass',
        { certificado: [mockCertificadoFile] },
      );

      expect(result).toEqual(mockResponse);
      expect(service.consultarEstadoDte).toHaveBeenCalledWith(
        'emp',
        'rec',
        100,
        33,
        5000,
        '2023-10-10',
        mockCertificadoFile,
        'rutCert',
        'pass',
      );
    });
  });
});
