import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type ServerSideEncryption,
} from '@aws-sdk/client-s3';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { instanceToPlain } from 'class-transformer';
import { DteDocument } from 'sii-engine';
export type FiscalPdfFormat = 'a4' | 'thermal';

export interface FiscalPdfArtifact {
  objectKey: string;
  sha256: string;
  generatedAt: string;
}

export type FiscalPdfArtifacts = Partial<
  Record<FiscalPdfFormat, FiscalPdfArtifact>
>;

export interface FiscalDocumentRecord {
  internalId: string;
  tenantId?: string;
  environment?: string;
  rutEmisor: string;
  tipoDTE: number;
  folio: number;
  trackId?: string;
  status: string;
  dteStatus?: string;
  sourceInternalId?: string;
  noteOperation?: string;
  nextPollAt?: Date;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
  document: DteDocument;
  tedXml: string;
  signedDteXml?: string;
  signedEnvelopeXml?: string;
  pdfArtifacts?: FiscalPdfArtifacts;
}

type CreateFiscalDocumentRecord = Omit<
  FiscalDocumentRecord,
  'createdAt' | 'updatedAt'
>;

type UpdateFiscalDocumentRecord = Partial<
  Omit<FiscalDocumentRecord, 'internalId' | 'createdAt' | 'updatedAt'>
>;

interface FiscalDocumentItem {
  pk: string;
  sk: 'METADATA';
  entityType: 'fiscal_document';
  internalId: string;
  tenantId?: string;
  environment?: string;
  rutEmisor: string;
  tipoDTE: number;
  folio: number;
  trackId?: string;
  status: string;
  dteStatus?: string;
  sourceInternalId?: string;
  noteOperation?: string;
  nextPollAt?: string;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  document: DteDocument;
  tedObjectKey: string;
  signedDteObjectKey?: string;
  signedEnvelopeObjectKey?: string;
  pdfArtifacts?: FiscalPdfArtifacts;
}

interface FiscalTrackItem {
  pk: string;
  sk: 'DOCUMENT';
  entityType: 'fiscal_document_track';
  internalId: string;
  updatedAt: string;
}

@Injectable()
export class FiscalDocumentRepository implements OnModuleInit {
  private readonly logger = new Logger(FiscalDocumentRepository.name);
  private readonly records = new Map<string, FiscalDocumentRecord>();
  private readonly tableName: string | undefined;
  private readonly bucketName: string | undefined;
  private readonly s3Prefix: string;
  private readonly s3KmsKeyId: string | undefined;
  private readonly dynamo: DynamoDBDocumentClient | undefined;
  private readonly s3: S3Client | undefined;

  constructor(@Optional() configService?: ConfigService) {
    const region = configService?.get<string>('AWS_REGION');
    const globalEndpoint = trimToUndefined(
      configService?.get<string>('AWS_ENDPOINT_URL'),
    );
    const dynamoEndpoint =
      trimToUndefined(configService?.get<string>('AWS_FISCAL_DDB_ENDPOINT')) ??
      globalEndpoint;
    const s3Endpoint =
      trimToUndefined(configService?.get<string>('AWS_FISCAL_S3_ENDPOINT')) ??
      globalEndpoint;

    this.tableName = configService?.get<string>('AWS_FISCAL_DDB_TABLE');
    this.bucketName = configService?.get<string>('AWS_FISCAL_S3_BUCKET');
    this.s3Prefix =
      configService?.get<string>('AWS_FISCAL_S3_PREFIX')?.trim() ||
      'fiscal-custody';
    this.s3KmsKeyId = configService?.get<string>('AWS_FISCAL_S3_KMS_KEY_ID');

    if (this.tableName && this.bucketName) {
      this.dynamo = DynamoDBDocumentClient.from(
        new DynamoDBClient({ region, endpoint: dynamoEndpoint }),
        { marshallOptions: { removeUndefinedValues: true } },
      );
      this.s3 = new S3Client({
        region,
        endpoint: s3Endpoint,
        forcePathStyle: parseBoolean(
          configService?.get<boolean | string>(
            'AWS_FISCAL_S3_FORCE_PATH_STYLE',
          ),
        ),
      });
      return;
    }

    this.dynamo = undefined;
    this.s3 = undefined;
  }

  onModuleInit(): void {
    if (Boolean(this.tableName) !== Boolean(this.bucketName)) {
      throw new Error(
        'AWS_FISCAL_DDB_TABLE y AWS_FISCAL_S3_BUCKET deben configurarse juntos para persistir documentos fiscales.',
      );
    }
    this.logger.log(
      `Repositorio de documentos fiscales inicializado en modo ${this.mode()}`,
    );
  }

  mode(): 'aws' | 'memory' {
    return this.backendEnabled() ? 'aws' : 'memory';
  }

  create(data: CreateFiscalDocumentRecord): FiscalDocumentRecord {
    const now = new Date();
    const record: FiscalDocumentRecord = {
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(record.internalId, record);
    return record;
  }

  async createDurable(
    data: CreateFiscalDocumentRecord,
  ): Promise<FiscalDocumentRecord> {
    const record = this.create(data);
    if (this.backendEnabled()) {
      await this.persistArtifacts(record);
      await this.persistMetadata(record);
    }
    return record;
  }

  findById(internalId: string): FiscalDocumentRecord | undefined {
    return this.records.get(internalId);
  }

  async findByIdDurable(
    internalId: string,
  ): Promise<FiscalDocumentRecord | undefined> {
    const cached = this.findById(internalId);
    if (cached || !this.backendEnabled()) return cached;

    const response = await this.dynamo!.send(
      new GetCommand({
        TableName: this.tableName!,
        Key: {
          pk: documentPk(internalId),
          sk: 'METADATA',
        },
        ConsistentRead: true,
      }),
    );
    if (!response.Item) return undefined;

    const record = await this.hydrateRecord(
      response.Item as FiscalDocumentItem,
    );
    this.records.set(record.internalId, record);
    return record;
  }

  findByTrackId(trackId: string): FiscalDocumentRecord | undefined {
    return Array.from(this.records.values()).find((r) => r.trackId === trackId);
  }

  async findByTrackIdDurable(
    trackId: string,
  ): Promise<FiscalDocumentRecord | undefined> {
    const cached = this.findByTrackId(trackId);
    if (cached || !this.backendEnabled()) return cached;

    const response = await this.dynamo!.send(
      new GetCommand({
        TableName: this.tableName!,
        Key: {
          pk: trackPk(trackId),
          sk: 'DOCUMENT',
        },
        ConsistentRead: true,
      }),
    );
    const item = response.Item as FiscalTrackItem | undefined;
    return item?.internalId ? this.findByIdDurable(item.internalId) : undefined;
  }

  update(
    internalId: string,
    updates: UpdateFiscalDocumentRecord,
  ): FiscalDocumentRecord | undefined {
    const record = this.records.get(internalId);
    if (!record) return undefined;
    Object.assign(record, updates);
    record.updatedAt = new Date();
    return record;
  }

  async updateDurable(
    internalId: string,
    updates: UpdateFiscalDocumentRecord,
  ): Promise<FiscalDocumentRecord | undefined> {
    const existing = await this.findByIdDurable(internalId);
    if (!existing) return undefined;

    const record = this.update(internalId, updates);
    if (record && this.backendEnabled()) {
      const artifactsChanged =
        updates.tedXml !== undefined ||
        updates.signedDteXml !== undefined ||
        updates.signedEnvelopeXml !== undefined;
      if (artifactsChanged) await this.persistArtifacts(record);
      await this.persistMetadata(record);
    }
    return record;
  }

  async readPdfArtifact(
    record: FiscalDocumentRecord,
    format: FiscalPdfFormat,
  ): Promise<Buffer | undefined> {
    const artifact = record.pdfArtifacts?.[format];
    if (!artifact || !this.backendEnabled()) return undefined;

    const response = await this.s3!.send(
      new GetObjectCommand({
        Bucket: this.bucketName!,
        Key: artifact.objectKey,
      }),
    );
    if (!response.Body) return undefined;
    return Buffer.from(await response.Body.transformToByteArray());
  }

  async savePdfArtifact(
    internalId: string,
    format: FiscalPdfFormat,
    buffer: Buffer,
    sha256: string,
  ): Promise<FiscalPdfArtifact> {
    const record = await this.findByIdDurable(internalId);
    if (!record) {
      throw new Error(`Documento fiscal inexistente: ${internalId}`);
    }

    const artifact: FiscalPdfArtifact = {
      objectKey: `${this.artifactRoot(record)}/document-${format}.pdf`,
      sha256,
      generatedAt: new Date().toISOString(),
    };
    if (this.backendEnabled()) {
      await this.s3!.send(
        new PutObjectCommand({
          Bucket: this.bucketName!,
          Key: artifact.objectKey,
          Body: buffer,
          ContentType: 'application/pdf',
          ServerSideEncryption: this.serverSideEncryption(),
          SSEKMSKeyId: this.s3KmsKeyId,
        }),
      );
    }

    record.pdfArtifacts = {
      ...record.pdfArtifacts,
      [format]: artifact,
    };
    record.updatedAt = new Date();
    if (this.backendEnabled()) await this.persistMetadata(record);
    return artifact;
  }
  findAll(): FiscalDocumentRecord[] {
    return Array.from(this.records.values());
  }

  clear(): void {
    this.records.clear();
  }

  private async persistArtifacts(record: FiscalDocumentRecord): Promise<void> {
    const keys = this.artifactKeys(record);
    await this.putXml(keys.tedObjectKey, record.tedXml);
    if (record.signedDteXml && keys.signedDteObjectKey) {
      await this.putXml(keys.signedDteObjectKey, record.signedDteXml);
    }
    if (record.signedEnvelopeXml && keys.signedEnvelopeObjectKey) {
      await this.putXml(keys.signedEnvelopeObjectKey, record.signedEnvelopeXml);
    }
  }

  private async persistMetadata(record: FiscalDocumentRecord): Promise<void> {
    const keys = this.artifactKeys(record);
    const item: FiscalDocumentItem = {
      pk: documentPk(record.internalId),
      sk: 'METADATA',
      entityType: 'fiscal_document',
      internalId: record.internalId,
      tenantId: record.tenantId,
      environment: record.environment,
      rutEmisor: record.rutEmisor,
      tipoDTE: record.tipoDTE,
      folio: record.folio,
      trackId: record.trackId,
      status: record.status,
      dteStatus: record.dteStatus,
      sourceInternalId: record.sourceInternalId,
      noteOperation: record.noteOperation,
      nextPollAt: record.nextPollAt?.toISOString(),
      attempts: record.attempts,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      document: instanceToPlain(record.document, {
        exposeUnsetFields: false,
      }) as DteDocument,
      pdfArtifacts: record.pdfArtifacts,
      ...keys,
    };

    await this.dynamo!.send(
      new PutCommand({
        TableName: this.tableName!,
        Item: item,
      }),
    );

    if (record.trackId) {
      const trackItem: FiscalTrackItem = {
        pk: trackPk(record.trackId),
        sk: 'DOCUMENT',
        entityType: 'fiscal_document_track',
        internalId: record.internalId,
        updatedAt: record.updatedAt.toISOString(),
      };
      await this.dynamo!.send(
        new PutCommand({
          TableName: this.tableName!,
          Item: trackItem,
        }),
      );
    }
  }

  private async hydrateRecord(
    item: FiscalDocumentItem,
  ): Promise<FiscalDocumentRecord> {
    return {
      internalId: item.internalId,
      tenantId: item.tenantId,
      environment: item.environment,
      rutEmisor: item.rutEmisor,
      tipoDTE: item.tipoDTE,
      folio: item.folio,
      trackId: item.trackId,
      status: item.status,
      dteStatus: item.dteStatus,
      sourceInternalId: item.sourceInternalId,
      noteOperation: item.noteOperation,
      nextPollAt: item.nextPollAt ? new Date(item.nextPollAt) : undefined,
      attempts: item.attempts,
      createdAt: new Date(item.createdAt),
      updatedAt: new Date(item.updatedAt),
      document: item.document,
      tedXml: await this.getXml(item.tedObjectKey),
      signedDteXml: item.signedDteObjectKey
        ? await this.getXml(item.signedDteObjectKey)
        : undefined,
      signedEnvelopeXml: item.signedEnvelopeObjectKey
        ? await this.getXml(item.signedEnvelopeObjectKey)
        : undefined,
      pdfArtifacts: item.pdfArtifacts,
    };
  }

  private artifactKeys(record: FiscalDocumentRecord) {
    const root = [
      this.s3Prefix.replace(/\/$/, ''),
      'documents',
      safeSegment(record.tenantId || 'default-tenant'),
      safeSegment(record.rutEmisor),
      String(record.tipoDTE),
      String(record.folio),
      safeSegment(record.internalId),
    ].join('/');

    return {
      tedObjectKey: `${root}/ted.xml`,
      signedDteObjectKey: record.signedDteXml
        ? `${root}/signed-dte.xml`
        : undefined,
      signedEnvelopeObjectKey: record.signedEnvelopeXml
        ? `${root}/signed-envelope.xml`
        : undefined,
    };
  }

  private artifactRoot(record: FiscalDocumentRecord): string {
    return [
      this.s3Prefix.replace(/\/$/, ''),
      'documents',
      safeSegment(record.tenantId || 'default-tenant'),
      safeSegment(record.rutEmisor),
      String(record.tipoDTE),
      String(record.folio),
      safeSegment(record.internalId),
    ].join('/');
  }
  private async putXml(key: string, xml: string): Promise<void> {
    await this.s3!.send(
      new PutObjectCommand({
        Bucket: this.bucketName!,
        Key: key,
        Body: Buffer.from(xml, 'utf8'),
        ContentType: 'application/xml',
        ServerSideEncryption: this.serverSideEncryption(),
        SSEKMSKeyId: this.s3KmsKeyId,
      }),
    );
  }

  private async getXml(key: string): Promise<string> {
    const response = await this.s3!.send(
      new GetObjectCommand({
        Bucket: this.bucketName!,
        Key: key,
      }),
    );
    if (!response.Body) {
      throw new Error(`Artefacto fiscal sin contenido en S3: ${key}`);
    }
    return response.Body.transformToString('utf-8');
  }

  private serverSideEncryption(): ServerSideEncryption {
    return this.s3KmsKeyId ? 'aws:kms' : 'AES256';
  }

  private backendEnabled(): boolean {
    return Boolean(this.tableName && this.bucketName && this.dynamo && this.s3);
  }
}

function documentPk(internalId: string): string {
  return `FISCAL_DOCUMENT#${internalId}`;
}

function trackPk(trackId: string): string {
  return `FISCAL_TRACK#${trackId}`;
}

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
}

function trimToUndefined(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function parseBoolean(value?: boolean | string): boolean {
  if (typeof value === 'boolean') return value;
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}
