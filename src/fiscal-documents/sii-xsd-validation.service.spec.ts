import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { SiiXsdValidationService } from './sii-xsd-validation.service';

describe('SiiXsdValidationService', () => {
  async function createService(enabled: boolean) {
    const module = await Test.createTestingModule({
      providers: [
        SiiXsdValidationService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'SII_XSD_VALIDATION_ENABLED' ? enabled : undefined,
          },
        },
      ],
    }).compile();

    return module.get(SiiXsdValidationService);
  }

  it('does nothing when validation is disabled', async () => {
    const service = await createService(false);

    expect(() =>
      service.validateSignedEnvelope('<invalid/>', 33),
    ).not.toThrow();
  });

  it('rejects an invalid DTE envelope when validation is enabled', async () => {
    const service = await createService(true);

    expect(() => service.validateSignedEnvelope('<EnvioDTE/>', 33)).toThrow(
      InternalServerErrorException,
    );
  });
});
