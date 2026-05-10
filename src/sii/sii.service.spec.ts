import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { SiiService } from './sii.service';
import axios from 'axios';
import FormData from 'form-data';

// Mockeamos la librería axios completa
jest.mock('axios');

describe('SiiService', () => {
  let service: SiiService;

  const mockAxiosInstance = {
    get: jest.fn(),
    post: jest.fn(),
  };

  beforeEach(async () => {
    (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SiiService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              if (key === 'SIMPLEAPI_BASE_URL') return 'https://api.test.cl';
              if (key === 'SIMPLEAPI_FOLIOS_BASE_URL') {
                return 'https://servicios.simpleapi.cl';
              }
              if (key === 'SIMPLEAPI_KEY') return 'test-key';
              if (key === 'SIMPLEAPI_AMBIENTE') return 0;
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SiiService>(SiiService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
    expect(service.getBaseUrl()).toBe('https://api.test.cl');
    expect(service.getFoliosBaseUrl()).toBe('https://servicios.simpleapi.cl');
    expect(service.getAmbiente()).toBe(0);
    expect(service.getAmbienteLabel()).toBe('certificación');
  });

  describe('get', () => {
    it('debe llamar a axios GET y retornar los datos solicitados', async () => {
      const rut = '12345678-9';
      const mockResponse = { data: { razonSocial: 'Empresa Test SpA', rut } };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await service.get(`/api/v1/sii/datos_empresa/${rut}`);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(`/api/v1/sii/datos_empresa/${rut}`, {
        params: undefined,
        headers: { Authorization: 'test-key' },
      });

      expect(result).toEqual(mockResponse.data);
    });

    it('debe lanzar HttpException con mensaje sanitizado si la API falla', async () => {
      const rut = 'error-rut';
      const mockError = {
        response: { status: 404, data: 'Contribuyente no encontrado' },
      };

      mockAxiosInstance.get.mockRejectedValue(mockError);

      await expect(
        service.get(`/api/v1/sii/datos_empresa/${rut}`),
      ).rejects.toThrow(HttpException);

      try {
        await service.get(`/api/v1/sii/datos_empresa/${rut}`);
      } catch (e) {
        const exception = e as HttpException;
        const response = exception.getResponse() as Record<string, unknown>;
        expect(response.message).toBe('Error al procesar la solicitud con SimpleAPI.');
        expect(response.errorId).toBeDefined();
        expect(typeof response.errorId).toBe('string');
      }
    });
  });

  describe('postForm', () => {
    it('debe llamar a axios POST con headers multipart y configuración adicional', async () => {
      const form = new FormData();
      form.append('xml', 'abc');
      mockAxiosInstance.post.mockResolvedValue({ data: { ok: true } });

      const result = await service.postForm('/api/folios/get/33/1', form, {
        baseURL: 'https://servicios.simpleapi.cl',
        responseType: 'text',
        timeout: 120000,
      });

      expect(result).toEqual({ ok: true });
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);

      const [endpoint, body, config] = mockAxiosInstance.post.mock.calls[0] as [
        string,
        FormData,
        Record<string, unknown>,
      ];

      expect(endpoint).toBe('/api/folios/get/33/1');
      expect(body).toBe(form);
      expect(config.baseURL).toBe('https://servicios.simpleapi.cl');
      expect(config.timeout).toBe(120000);
      expect(config.responseType).toBe('text');
      expect(config.headers).toMatchObject({ Authorization: 'test-key' });
    });
  });
});
