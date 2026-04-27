import { Test, TestingModule } from '@nestjs/testing';
import { SesionController } from './sesion.controller';
import { SiiService } from '../sii.service';
import { ConfigService } from '@nestjs/config';

describe('SesionController', () => {
  let controller: SesionController;
  let service: SiiService;

  const mockSiiService = {
    healthCheck: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SesionController],
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

    controller = module.get<SesionController>(SesionController);
    service = module.get<SiiService>(SiiService);
  });

  it('debería estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('health', () => {
    it('debería retornar el resultado del health check', async () => {
      const mockResult = { status: 'ok', message: 'SimpleAPI operando' };
      mockSiiService.healthCheck.mockResolvedValue(mockResult);

      const result = await controller.health();

      expect(result).toEqual(mockResult);
      expect(service.healthCheck).toHaveBeenCalled();
    });
  });
});
