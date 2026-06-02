import { Injectable } from '@nestjs/common';
import { DteDocument } from 'sii-engine';

export interface FiscalDocumentRecord {
  internalId: string;
  tenantId?: string;
  rutEmisor: string;
  tipoDTE: number;
  folio: number;
  trackId?: string;
  status: string;
  nextPollAt?: Date;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
  document: DteDocument;
  tedXml: string;
  signedDteXml?: string;
  signedEnvelopeXml?: string;
}

@Injectable()
export class FiscalDocumentRepository {
  private readonly records = new Map<string, FiscalDocumentRecord>();

  create(
    data: Omit<FiscalDocumentRecord, 'createdAt' | 'updatedAt'>,
  ): FiscalDocumentRecord {
    const record: FiscalDocumentRecord = {
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.records.set(record.internalId, record);
    return record;
  }

  findById(internalId: string): FiscalDocumentRecord | undefined {
    return this.records.get(internalId);
  }

  findByTrackId(trackId: string): FiscalDocumentRecord | undefined {
    return Array.from(this.records.values()).find((r) => r.trackId === trackId);
  }

  update(
    internalId: string,
    updates: Partial<
      Omit<FiscalDocumentRecord, 'internalId' | 'createdAt' | 'updatedAt'>
    >,
  ): FiscalDocumentRecord | undefined {
    const record = this.records.get(internalId);
    if (!record) return undefined;
    Object.assign(record, updates);
    record.updatedAt = new Date();
    return record;
  }

  findAll(): FiscalDocumentRecord[] {
    return Array.from(this.records.values());
  }

  clear(): void {
    this.records.clear();
  }
}
