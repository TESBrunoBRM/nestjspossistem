import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { SiiService } from './sii.service';
import axios from 'axios';
import { FoliosRequestDto } from './dto/utilidades-folios.dto';

// Mockeamos la librería axios completa
jest.mock('axios');

describe('SiiService', () => {
  let service: SiiService;
  let configService: ConfigService;

  // Creamos un mock de la instancia que devuelve axios.create()
  const mockAxiosInstance = {
    get: jest.fn(),
    post: jest.fn(),
  };

  beforeEach(async () => {
    // Cuando el servicio llame a axios.create, devolvemos nuestra instancia mockeada
    (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SiiService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              if (key === 'SIMPLEAPI_BASE_URL') return 'https://api.test.cl';
              if (key === 'SIMPLEAPI_KEY') return 'test-key';
              if (key === 'SIMPLEAPI_AMBIENTE') return 0;
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SiiService>(SiiService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('obtenerDatosEmpresa', () => {
    it('debe llamar a callSimpleApiGet y retornar los datos de la empresa', async () => {
      const rut = '12345678-9';
      const mockResponse = { data: { razonSocial: 'Empresa Test SpA', rut } };
      
      // Simulamos que el GET de axios responde correctamente
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await service.obtenerDatosEmpresa(rut);

      // Verificamos que se haya llamado con la URL y headers correctos
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(`/api/v1/sii/datos_empresa/${rut}`, {
        params: undefined,
        headers: { Authorization: 'test-key' }
      });
      
      // Verificamos que retorne el contenido de .data
      expect(result).toEqual(mockResponse.data);
    });

    it('debe lanzar HttpException con mensaje sanitizado si la API falla', async () => {
      const rut = 'error-rut';
      const mockError = {
        response: { status: 404, data: 'Contribuyente no encontrado' }
      };
      
      // Simulamos un error en el GET
      mockAxiosInstance.get.mockRejectedValue(mockError);

      await expect(service.obtenerDatosEmpresa(rut)).rejects.toThrow(HttpException);

      try {
        await service.obtenerDatosEmpresa(rut);
      } catch (e) {
        const exception = e as HttpException;
        const response = exception.getResponse() as Record<string, unknown>;
        // Verificar que NO se filtra el detalle de SimpleAPI
        expect(response.message).toBe('Error al procesar la solicitud con SimpleAPI.');
        // Verificar que incluye un errorId para trazabilidad
        expect(response.errorId).toBeDefined();
        expect(typeof response.errorId).toBe('string');
      }
    });
  });

  describe('healthCheck', () => {
    it('debe retornar status ok cuando SimpleAPI responde', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: {} });

      const result = await service.healthCheck();
      expect(result.status).toBe('ok');
      expect(result.ambiente).toBe('certificación');
    });

    it('debe retornar status unreachable cuando SimpleAPI no responde', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Connection refused'));

      const result = await service.healthCheck();
      expect(result.status).toBe('unreachable');
    });
  });

  describe('obtenerFolios', () => {
    it('debe usar el endpoint, campos multipart y timeout documentados por SimpleAPI', async () => {
      const dto: FoliosRequestDto = {
        RutEmpresa: '76269769-6',
        TipoDTE: 33,
        Cantidad: 1,
        Ambiente: 0,
        Certificado: {
          Rut: '17096073-4',
          Password: 'secreto',
        },
      };
      const certificadoFile = {
        buffer: Buffer.from('dummy-pfx'),
        originalname: 'certificado.pfx',
      } as Express.Multer.File;
      const xmlResponse = '<?xml version="1.0"?><AUTORIZACION>...</AUTORIZACION>';

      mockAxiosInstance.post.mockResolvedValue({ data: xmlResponse });

      const result = await service.obtenerFolios(dto, certificadoFile);

      expect(result).toBe(xmlResponse);
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);

      const [endpoint, form, config] = mockAxiosInstance.post.mock.calls[0] as [
        string,
        { getBuffer: () => Buffer },
        Record<string, unknown>,
      ];
      const multipartBody = form.getBuffer().toString('utf8');

      expect(endpoint).toBe('/api/folios/get/33/1');
      expect(config.baseURL).toBe('https://servicios.simpleapi.cl');
      expect(config.timeout).toBe(120000);
      expect(config.responseType).toBe('text');
      expect(config.headers).toMatchObject({ Authorization: 'test-key' });
      expect(multipartBody).toContain('name="input"');
      expect(multipartBody).toContain('name="files"');
      expect(multipartBody).toContain('"RutCertificado":"17096073-4"');
      expect(multipartBody).toContain('"RutEmpresa":"76269769-6"');
      expect(multipartBody).not.toContain('"TipoDTE"');
      expect(multipartBody).not.toContain('"Cantidad"');
    });
  });
});
