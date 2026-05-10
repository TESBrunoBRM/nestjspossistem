import { Test, TestingModule } from '@nestjs/testing';
import { FoliosRequestDto } from '../../dto/utilidades-folios.dto';
import { SiiService } from '../../sii.service';
import { GetFoliosService } from './get-folios.service';

describe('GetFoliosService', () => {
  let service: GetFoliosService;

  const mockSiiService = {
    getFoliosBaseUrl: jest.fn().mockReturnValue('https://servicios.simpleapi.cl'),
    postForm: jest
      .fn()
      .mockResolvedValue('<?xml version="1.0"?><AUTORIZACION>...</AUTORIZACION>'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetFoliosService,
        {
          provide: SiiService,
          useValue: mockSiiService,
        },
      ],
    }).compile();

    service = module.get<GetFoliosService>(GetFoliosService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

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

    const result = await service.obtener(dto, certificadoFile);

    expect(result).toBe('<?xml version="1.0"?><AUTORIZACION>...</AUTORIZACION>');
    expect(mockSiiService.postForm).toHaveBeenCalledTimes(1);

    const [endpoint, form, config] = mockSiiService.postForm.mock.calls[0] as [
      string,
      { getBuffer: () => Buffer },
      Record<string, unknown>,
    ];
    const multipartBody = form.getBuffer().toString('utf8');

    expect(endpoint).toBe('/api/folios/get/33/1');
    expect(config).toEqual({
      baseURL: 'https://servicios.simpleapi.cl',
      responseType: 'text',
      timeout: 120000,
    });
    expect(multipartBody).toContain('name="input"');
    expect(multipartBody).toContain('name="files"');
    expect(multipartBody).toContain('"RutCertificado":"17096073-4"');
    expect(multipartBody).toContain('"RutEmpresa":"76269769-6"');
    expect(multipartBody).not.toContain('"TipoDTE"');
    expect(multipartBody).not.toContain('"Cantidad"');
  });
});