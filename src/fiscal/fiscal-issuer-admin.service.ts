import { Injectable, NotFoundException } from '@nestjs/common';
import { normalizeRut } from 'sii-engine';
import { FiscalCustodyService } from '../fiscal-storage/fiscal-custody.service';
import { FiscalIssuerQueryDto } from './dto/fiscal-issuer-query.dto';
import { UpsertFiscalIssuerDto } from './dto/upsert-fiscal-issuer.dto';

@Injectable()
export class FiscalIssuerAdminService {
  constructor(private readonly custodyService: FiscalCustodyService) {}

  async upsertIssuer(dto: UpsertFiscalIssuerDto) {
    const stored = await this.custodyService.upsertIssuerCertificate({
      tenantId: dto.tenantId,
      merchantId: dto.merchantId,
      branchId: dto.branchId,
      environment: dto.environment,
      rutEmisor: dto.rutEmisor,
      fechaResolucion: dto.fechaResolucion,
      nroResolucion: dto.nroResolucion,
      pfxBuffer: Buffer.from(dto.pfxBase64, 'base64'),
      pfxPassword: dto.pfxPassword,
      rutFirmante: dto.rutFirmante,
    });

    return {
      tenantId: stored.profile.tenantId,
      merchantId: stored.profile.merchantId,
      branchId: stored.profile.branchId,
      environment: stored.profile.environment,
      rutEmisor: stored.profile.rutEmisor,
      rutFirmante: stored.profile.rutFirmante,
      fechaResolucion: stored.profile.fechaResolucion,
      nroResolucion: stored.profile.nroResolucion,
      certificateRef: stored.profile.certificateRef,
      certificateFingerprint: stored.profile.certificateFingerprint,
      certificateExpiresAt: stored.profile.certificateExpiresAt,
      custodyMode: this.custodyService.mode(),
      updatedAt: stored.profile.updatedAt,
    };
  }

  async getIssuer(query: FiscalIssuerQueryDto) {
    const profile = await this.custodyService.getIssuerProfile({
      tenantId: query.tenantId,
      rutEmisor: normalizeRut(query.rutEmisor),
      environment: query.environment,
    });
    if (!profile) {
      throw new NotFoundException(
        'No existe emisor fiscal almacenado para la llave solicitada',
      );
    }

    return {
      tenantId: profile.tenantId,
      merchantId: profile.merchantId,
      branchId: profile.branchId,
      environment: profile.environment,
      rutEmisor: profile.rutEmisor,
      rutFirmante: profile.rutFirmante,
      fechaResolucion: profile.fechaResolucion,
      nroResolucion: profile.nroResolucion,
      certificateRef: profile.certificateRef,
      certificateFingerprint: profile.certificateFingerprint,
      certificateExpiresAt: profile.certificateExpiresAt,
      custodyMode: this.custodyService.mode(),
      updatedAt: profile.updatedAt,
      createdAt: profile.createdAt,
    };
  }
}
