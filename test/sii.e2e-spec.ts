import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SiiService } from '../src/sii/sii.service';

describe('SiiController (e2e)', () => {
  let app: INestApplication;
  
  const mockSiiService = {
    emitirBoleta: jest.fn().mockResolvedValue({ trackId: '12345', folio: 12 }),
  };

  beforeAll(async () => {
    // Definimos variables de entorno para que pase env.validation.ts
    process.env.API_KEY = 'test-api-key';
    process.env.API_KEY_FRONTEND = 'MiSuperClavePOS2024';
    process.env.SIMPLE_API_URL = 'http://localhost';
    process.env.SIMPLEAPI_BASE_URL = 'http://localhost';
    process.env.SIMPLEAPI_KEY = 'simple-api-key';
    process.env.NODE_ENV = 'test';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SiiService)
      .useValue(mockSiiService)
      .compile();

    app = moduleFixture.createNestApplication();
    
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /sii/boletas/emitir', () => {
    it('Debe retornar 401 si no hay API Key', () => {
      return request(app.getHttpServer())
        .post('/sii/boletas/emitir')
        .expect(401);
    });

    it('Debe retornar 400 si faltan archivos o datos', () => {
      return request(app.getHttpServer())
        .post('/sii/boletas/emitir')
        .set('x-api-key', 'MiSuperClavePOS2024')
        .expect(400);
    });

    it('Debe emitir boleta exitosamente si los datos son correctos', () => {
      const dummyPfx = Buffer.from('dummy-pfx');
      const dummyXml = Buffer.from('dummy-xml');
      const validDatos = {
        IdentificacionDTE: { TipoDTE: 39, Folio: 12, FechaEmision: '2023-10-25' },
        Emisor: { Rut: '76123456-7', RazonSocialBoleta: 'Empresa', GiroBoleta: 'Giro', DireccionOrigen: 'Dir', ComunaOrigen: 'Comuna' },
        Receptor: { Rut: '66.666.666-6' },
        Totales: { MontoTotal: 1000 },
        Detalles: [{ Nombre: 'Producto', Cantidad: 1, Precio: 1000, MontoItem: 1000 }],
        Certificado: { Rut: '12345678-9', Password: 'pass' }
      };

      return request(app.getHttpServer())
        .post('/sii/boletas/emitir')
        .set('x-api-key', 'MiSuperClavePOS2024')
        .attach('certificado', dummyPfx, 'cert.pfx')
        .attach('caf', dummyXml, 'folios.xml')
        .field('datos', JSON.stringify(validDatos))
        .expect(201)
        .expect({ trackId: '12345', folio: 12 });
    });

    it('Debe retornar 400 si el JSON no es válido', () => {
      const dummyPfx = Buffer.from('dummy-pfx');
      const dummyXml = Buffer.from('dummy-xml');
      return request(app.getHttpServer())
        .post('/sii/boletas/emitir')
        .set('x-api-key', 'MiSuperClavePOS2024')
        .attach('certificado', dummyPfx, 'cert.pfx')
        .attach('caf', dummyXml, 'folios.xml')
        .field('datos', 'not-a-json')
        .expect(400)
        .expect(res => {
          expect(res.body.message).toContain('no es un JSON válido');
        });
    });

    it('Debe retornar 400 si el JSON no cumple con la validación de DTO (class-validator)', () => {
      const dummyPfx = Buffer.from('dummy-pfx');
      const dummyXml = Buffer.from('dummy-xml');
      const invalidDatos = {
        IdentificacionDTE: { TipoDTE: 39 }, // Faltan campos requeridos
      };
      return request(app.getHttpServer())
        .post('/sii/boletas/emitir')
        .set('x-api-key', 'MiSuperClavePOS2024')
        .attach('certificado', dummyPfx, 'cert.pfx')
        .attach('caf', dummyXml, 'folios.xml')
        .field('datos', JSON.stringify(invalidDatos))
        .expect(400)
        .expect(res => {
          expect(res.body.message).toBe('Validación fallida en los datos JSON');
          expect(res.body.errors).toBeDefined();
        });
    });
  });
});
