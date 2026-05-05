import { Test, TestingModule } from '@nestjs/testing';
import { ConsultaController } from './consulta.controller';
import { SiiService } from '../sii.service';
import { BadRequestException } from '@nestjs/common';
import { ConsultaEstadoEnvioDto } from '../dto/consulta-estado-envio.dto';
import { ConsultaEstadoDteDto } from '../dto/consulta-estado-dte.dto';
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
    it('debería retornar el estado del envío con DTO validado', async () => {
      const mockTrackId = '12345';
      const datos: ConsultaEstadoEnvioDto = {
        rutEmpresa: '76123456-7',
        rutCertificado: '11223344-5',
        passwordCertificado: 'password',
      };
      const mockResponse = { estado: 'RECIBIDO' };

      mockSiiService.consultarEstadoEnvio.mockResolvedValue(mockResponse);

      const result = await controller.consultarEstadoEnvio(
        mockTrackId,
        datos,
        { certificado: [mockCertificadoFile] },
      );

      expect(result).toEqual(mockResponse);
      expect(service.consultarEstadoEnvio).toHaveBeenCalledWith(
        datos.rutEmpresa,
        mockTrackId,
        mockCertificadoFile,
        datos.rutCertificado,
        datos.passwordCertificado,
      );
    });

    it('debería lanzar error si falta el certificado', async () => {
      const datos: ConsultaEstadoEnvioDto = {
        rutEmpresa: '76123456-7',
        rutCertificado: '11223344-5',
        passwordCertificado: 'password',
      };

      await expect(
        controller.consultarEstadoEnvio('123', datos, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('debería lanzar error si trackId está vacío', async () => {
      const datos: ConsultaEstadoEnvioDto = {
        rutEmpresa: '76123456-7',
        rutCertificado: '11223344-5',
        passwordCertificado: 'password',
      };

      await expect(
        controller.consultarEstadoEnvio('', datos, { certificado: [mockCertificadoFile] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('consultarEstadoDte', () => {
    it('debería retornar el estado de un DTE con DTO validado', async () => {
      const datos: ConsultaEstadoDteDto = {
        rutEmpresa: '76123456-7',
        rutReceptor: '11222333-4',
        folio: 100,
        tipoDte: 33,
        total: 5000,
        fechaDte: '2023-10-10',
        rutCertificado: '12345678-9',
        passwordCertificado: 'pass',
      };
      const mockResponse = { estado: 'ACEPTADO' };
      mockSiiService.consultarEstadoDte.mockResolvedValue(mockResponse);

      const result = await controller.consultarEstadoDte(
        datos,
        { certificado: [mockCertificadoFile] },
      );

      expect(result).toEqual(mockResponse);
      expect(service.consultarEstadoDte).toHaveBeenCalledWith(
        datos.rutEmpresa,
        datos.rutReceptor,
        100,
        33,
        5000,
        '2023-10-10',
        mockCertificadoFile,
        datos.rutCertificado,
        datos.passwordCertificado,
      );
    });

    it('debería lanzar error si falta el archivo certificado', async () => {
      const datos: ConsultaEstadoDteDto = {
        rutEmpresa: '76123456-7',
        rutReceptor: '11222333-4',
        folio: 100,
        tipoDte: 33,
        total: 5000,
        fechaDte: '2023-10-10',
        rutCertificado: '12345678-9',
        passwordCertificado: 'pass',
      };

      await expect(
        controller.consultarEstadoDte(datos, {}),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
