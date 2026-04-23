import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { SiiService } from './sii.service';
import axios from 'axios';

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
            get: jest.fn((key: string, defaultValue: any) => {
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

    it('debe lanzar HttpException si la API de SimpleAPI falla', async () => {
      const rut = 'error-rut';
      const mockError = {
        response: { status: 404, data: 'Contribuyente no encontrado' }
      };
      
      // Simulamos un error en el GET
      mockAxiosInstance.get.mockRejectedValue(mockError);

      await expect(service.obtenerDatosEmpresa(rut)).rejects.toThrow(HttpException);
      await expect(service.obtenerDatosEmpresa(rut)).rejects.toThrow('Error al comunicarse con SimpleAPI');
    });
  });
});
