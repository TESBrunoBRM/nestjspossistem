import { Injectable, Logger } from '@nestjs/common';
import { SiiService } from '../../sii.service';

@Injectable()
export class SimpleApiHealthService {
  private readonly logger = new Logger(SimpleApiHealthService.name);

  constructor(private readonly siiService: SiiService) {}

  async health(): Promise<{ status: string; url: string; ambiente: string }> {
    this.logger.log('Verificando la conexión con SimpleAPI');

    try {
      await this.siiService.get('/');

      return {
        status: 'ok',
        url: this.siiService.getBaseUrl(),
        ambiente: this.siiService.getAmbienteLabel(),
      };
    } catch {
      return {
        status: 'unreachable',
        url: this.siiService.getBaseUrl(),
        ambiente: this.siiService.getAmbienteLabel(),
      };
    }
  }
}