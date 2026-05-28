import { Injectable } from '@nestjs/common';

export const FISCAL_RVD_TRACKING_REPOSITORY = Symbol(
  'FISCAL_RVD_TRACKING_REPOSITORY',
);

export interface FiscalRvdRecord {
  internalId: string;
  tenantId?: string;
  rutEmisor: string;
  fecha: string;
  secEnvio: number;
  trackId?: string;
  status: string;
  attempts: number;
  nextPollAt?: Date;
  publicStatus?: string;
  protectedRawResponse?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FiscalRvdTrackingRepository {
  create(
    data: Omit<FiscalRvdRecord, 'createdAt' | 'updatedAt'>,
  ): FiscalRvdRecord;
  findById(internalId: string): FiscalRvdRecord | undefined;
  findByTrackId(trackId: string): FiscalRvdRecord | undefined;
  update(
    internalId: string,
    updates: Partial<Omit<FiscalRvdRecord, 'internalId' | 'createdAt'>>,
  ): FiscalRvdRecord | undefined;
}

@Injectable()
export class InMemoryFiscalRvdRepository implements FiscalRvdTrackingRepository {
  private readonly records = new Map<string, FiscalRvdRecord>();

  create(
    data: Omit<FiscalRvdRecord, 'createdAt' | 'updatedAt'>,
  ): FiscalRvdRecord {
    const record = {
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.records.set(record.internalId, record);
    return record;
  }

  findById(internalId: string): FiscalRvdRecord | undefined {
    return this.records.get(internalId);
  }

  findByTrackId(trackId: string): FiscalRvdRecord | undefined {
    return Array.from(this.records.values()).find(
      (record) => record.trackId === trackId,
    );
  }

  update(
    internalId: string,
    updates: Partial<Omit<FiscalRvdRecord, 'internalId' | 'createdAt'>>,
  ): FiscalRvdRecord | undefined {
    const record = this.records.get(internalId);
    if (!record) return undefined;

    Object.assign(record, updates);
    record.updatedAt = new Date();
    return record;
  }
}
