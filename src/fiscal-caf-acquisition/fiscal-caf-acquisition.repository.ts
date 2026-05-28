import { Injectable } from '@nestjs/common';
import {
  normalizeRut,
  type CafAcquisitionResult,
  type SiiEnvironment,
} from 'sii-engine';

export interface CafAcquisitionRepository {
  findByIdempotencyKey(
    scope: CafAcquisitionIdempotencyScope,
  ): CafAcquisitionResult | undefined;
  save(
    result: CafAcquisitionResult,
    scope?: CafAcquisitionIdempotencyScope,
  ): CafAcquisitionResult;
}

export interface CafAcquisitionIdempotencyScope {
  environment: SiiEnvironment;
  rutEmisor: string;
  tipoDTE: number;
  idempotencyKey?: string;
}

@Injectable()
export class InMemoryCafAcquisitionRepository implements CafAcquisitionRepository {
  private readonly byIdempotencyKey = new Map<string, CafAcquisitionResult>();

  findByIdempotencyKey(
    scope: CafAcquisitionIdempotencyScope,
  ): CafAcquisitionResult | undefined {
    if (!scope.idempotencyKey) return undefined;
    return this.byIdempotencyKey.get(this.key(scope));
  }

  save(
    result: CafAcquisitionResult,
    scope?: CafAcquisitionIdempotencyScope,
  ): CafAcquisitionResult {
    if (!scope?.idempotencyKey) return result;

    this.byIdempotencyKey.set(this.key(scope), result);
    return result;
  }

  private key(scope: CafAcquisitionIdempotencyScope): string {
    return [
      scope.environment,
      normalizeRut(scope.rutEmisor),
      scope.tipoDTE,
      scope.idempotencyKey,
    ].join(':');
  }
}
