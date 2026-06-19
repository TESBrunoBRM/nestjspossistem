import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import forge from 'node-forge';
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type ServerSideEncryption,
} from '@aws-sdk/client-s3';
import {
  GetParameterCommand,
  PutParameterCommand,
  SSMClient,
} from '@aws-sdk/client-ssm';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import {
  getCertificateFingerprintSha256,
  isCafExpired,
  isCafExpiringSoon,
  normalizeRut,
  parseCaf,
  SiiEnvironment,
  type CafMaterial,
  type CafWithStatus,
  type CertificateMaterial,
  type FolioAssignment,
  type IssuerContext,
  type TipoDTE,
} from 'sii-engine';
import { loadCertificateMaterialFromP12 } from '../fiscal/fiscal-certificate.util';
import type { FiscalIssuerConfig } from '../fiscal/fiscal-issuer.store';
import {
  type FiscalIssuerLookup,
  type SaveCafInput,
  type StoredFiscalCafRecord,
  type StoredFiscalIssuerCertificate,
  type StoredFiscalIssuerProfile,
  type UpsertFiscalIssuerInput,
} from './fiscal-custody.types';

type EntityType = 'issuer_profile' | 'caf_record';

interface IssuerProfileItem extends StoredFiscalIssuerProfile {
  pk: string;
  sk: string;
  entityType: EntityType;
}

interface CafRecordItem extends StoredFiscalCafRecord {
  pk: string;
  sk: string;
  entityType: EntityType;
}

@Injectable()
export class FiscalCustodyService implements OnModuleInit {
  private readonly logger = new Logger(FiscalCustodyService.name);
  private readonly memoryProfiles = new Map<
    string,
    StoredFiscalIssuerProfile
  >();
  private readonly memoryCertificates = new Map<
    string,
    { pfxBuffer: Buffer; password: string; material: CertificateMaterial }
  >();
  private readonly memoryCafs = new Map<string, StoredFiscalCafRecord>();
  private readonly cafMaterialCache = new Map<string, CafMaterial>();
  private readonly certificateCache = new Map<string, CertificateMaterial>();
  private memoryQueue: Promise<unknown> = Promise.resolve();

  private readonly region: string | undefined;
  private readonly globalEndpoint: string | undefined;
  private readonly tableName: string | undefined;
  private readonly dynamoEndpoint: string | undefined;
  private readonly bucketName: string | undefined;
  private readonly s3Endpoint: string | undefined;
  private readonly s3Prefix: string;
  private readonly s3ForcePathStyle: boolean;
  private readonly ssmEndpoint: string | undefined;
  private readonly parameterPrefix: string;
  private readonly s3KmsKeyId: string | undefined;
  private readonly ssmKmsKeyId: string | undefined;

  private readonly dynamo: DynamoDBDocumentClient | undefined;
  private readonly s3: S3Client | undefined;
  private readonly ssm: SSMClient | undefined;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get<string>('AWS_REGION');
    this.globalEndpoint = trimToUndefined(
      this.configService.get<string>('AWS_ENDPOINT_URL'),
    );
    this.tableName = this.configService.get<string>('AWS_FISCAL_DDB_TABLE');
    this.dynamoEndpoint =
      trimToUndefined(
        this.configService.get<string>('AWS_FISCAL_DDB_ENDPOINT'),
      ) ?? this.globalEndpoint;
    this.bucketName = this.configService.get<string>('AWS_FISCAL_S3_BUCKET');
    this.s3Endpoint =
      trimToUndefined(
        this.configService.get<string>('AWS_FISCAL_S3_ENDPOINT'),
      ) ?? this.globalEndpoint;
    this.s3Prefix =
      this.configService.get<string>('AWS_FISCAL_S3_PREFIX')?.trim() ||
      'fiscal-custody';
    this.s3ForcePathStyle = parseBoolean(
      this.configService.get<boolean | string>(
        'AWS_FISCAL_S3_FORCE_PATH_STYLE',
      ),
    );
    this.ssmEndpoint =
      trimToUndefined(
        this.configService.get<string>('AWS_FISCAL_SSM_ENDPOINT'),
      ) ?? this.globalEndpoint;
    this.parameterPrefix =
      this.configService.get<string>('AWS_FISCAL_SSM_PREFIX')?.trim() ||
      '/business-app-sii/fiscal';
    this.s3KmsKeyId = this.configService.get<string>(
      'AWS_FISCAL_S3_KMS_KEY_ID',
    );
    this.ssmKmsKeyId = this.configService.get<string>(
      'AWS_FISCAL_SSM_KMS_KEY_ID',
    );

    if (this.backendEnabled()) {
      const ddbClient = new DynamoDBClient({
        region: this.region,
        endpoint: this.dynamoEndpoint,
      });
      this.dynamo = DynamoDBDocumentClient.from(ddbClient, {
        marshallOptions: { removeUndefinedValues: true },
      });
      this.s3 = new S3Client({
        region: this.region,
        endpoint: this.s3Endpoint,
        forcePathStyle: this.s3ForcePathStyle,
      });
      this.ssm = new SSMClient({
        region: this.region,
        endpoint: this.ssmEndpoint,
      });
      return;
    }

    this.dynamo = undefined;
    this.s3 = undefined;
    this.ssm = undefined;
  }

  onModuleInit(): void {
    const configured = [
      this.tableName ? 'AWS_FISCAL_DDB_TABLE' : undefined,
      this.bucketName ? 'AWS_FISCAL_S3_BUCKET' : undefined,
    ].filter(Boolean);
    if (configured.length === 1) {
      throw new Error(
        'AWS_FISCAL_DDB_TABLE y AWS_FISCAL_S3_BUCKET deben configurarse juntos para habilitar custodia fiscal en AWS',
      );
    }
    this.logger.log(`Custodia fiscal inicializada en modo ${this.mode()}`);
  }

  mode(): 'aws' | 'memory' {
    return this.backendEnabled() ? 'aws' : 'memory';
  }

  async upsertIssuerCertificate(
    input: UpsertFiscalIssuerInput,
  ): Promise<StoredFiscalIssuerCertificate> {
    const material = loadCertificateMaterialFromP12(
      input.pfxBuffer,
      input.pfxPassword,
      input.rutFirmante,
    );
    const certificateFingerprint =
      material.fingerprintSha256 ??
      getCertificateFingerprintSha256(material.certificatePem);
    const now = new Date().toISOString();
    const profile: StoredFiscalIssuerProfile = {
      tenantId: input.tenantId,
      merchantId: input.merchantId,
      branchId: input.branchId,
      environment: input.environment,
      rutEmisor: normalizeRut(input.rutEmisor),
      rutFirmante: material.rutFirmante,
      fechaResolucion: input.fechaResolucion,
      nroResolucion: input.nroResolucion,
      certificateRef: buildCertificateRef(input),
      certificateFingerprint: certificateFingerprint,
      certificateExpiresAt: material.expiresAt.toISOString(),
      certificateObjectKey: this.certificateObjectKey(input),
      certificatePasswordParameterName:
        this.certificatePasswordParameterName(input),
      updatedAt: now,
      createdAt: now,
    };

    if (this.backendEnabled()) {
      await this.saveIssuerCertificateToAws(
        profile,
        input.pfxBuffer,
        input.pfxPassword,
      );
    } else {
      const existing = this.memoryProfiles.get(profileKey(profile));
      this.memoryProfiles.set(profileKey(profile), {
        ...profile,
        createdAt: existing?.createdAt ?? now,
      });
      this.memoryCertificates.set(profile.certificateRef, {
        pfxBuffer: Buffer.from(input.pfxBuffer),
        password: input.pfxPassword,
        material,
      });
    }

    this.certificateCache.set(profile.certificateRef, material);
    return { profile, material };
  }

  async findIssuer(
    lookup: FiscalIssuerLookup,
  ): Promise<FiscalIssuerConfig | undefined> {
    if (!lookup.tenantId || !lookup.rutEmisor) return undefined;

    const profile = this.backendEnabled()
      ? await this.findIssuerInAws(lookup)
      : this.findIssuerInMemory(lookup);

    if (!profile) return undefined;

    return {
      tenantId: profile.tenantId,
      merchantId: profile.merchantId,
      branchId: profile.branchId,
      environment: profile.environment,
      rutEmisor: profile.rutEmisor,
      fechaResolucion: profile.fechaResolucion,
      nroResolucion: profile.nroResolucion,
      certificateRef: profile.certificateRef,
      certificateFingerprint: profile.certificateFingerprint,
    };
  }

  async getIssuerProfile(
    lookup: FiscalIssuerLookup,
  ): Promise<StoredFiscalIssuerProfile | undefined> {
    if (!lookup.tenantId || !lookup.rutEmisor) return undefined;
    return this.backendEnabled()
      ? this.findIssuerInAws(lookup)
      : this.findIssuerInMemory(lookup);
  }

  async getSigningMaterialByRef(
    certificateRef: string,
  ): Promise<CertificateMaterial | undefined> {
    const cached = this.certificateCache.get(certificateRef);
    if (cached) return cached;

    const ref = parseCertificateRef(certificateRef);
    if (!ref) return undefined;

    const profile = await this.getIssuerProfile({
      tenantId: ref.tenantId,
      rutEmisor: ref.rutEmisor,
      environment: ref.environment,
    });
    if (!profile) return undefined;

    if (!this.backendEnabled()) {
      const stored = this.memoryCertificates.get(certificateRef);
      const material = stored?.material;
      if (material) {
        this.certificateCache.set(certificateRef, material);
      }
      return material;
    }

    const pfxBuffer = await this.readS3ObjectBuffer(
      profile.certificateObjectKey,
    );
    const password = await this.readSecureString(
      profile.certificatePasswordParameterName,
    );
    const material = loadCertificateMaterialFromP12(
      pfxBuffer,
      password,
      profile.rutFirmante,
    );
    this.certificateCache.set(certificateRef, material);
    return material;
  }

  async saveCaf({ context, caf }: SaveCafInput): Promise<void> {
    const issuerTenantId = context.tenantId;
    if (!issuerTenantId) {
      throw new BadRequestException(
        'tenantId es requerido para guardar CAF por emisor',
      );
    }

    const normalizedRut = normalizeRut(context.rutEmisor);
    const normalized = {
      ...caf,
      rsask: normalizeCafPrivateKey(caf.rsask),
    };
    const now = new Date().toISOString();
    const record: StoredFiscalCafRecord = {
      tenantId: issuerTenantId,
      environment: context.environment,
      rutEmisor: normalizedRut,
      razonSocial: normalized.da.razonSocial,
      tipoDTE: normalized.da.tipoDTE,
      rangeStart: normalized.da.rangeStart,
      rangeEnd: normalized.da.rangeEnd,
      idk: normalized.da.idk,
      nextFolio: normalized.da.rangeStart,
      fechaAutorizacion: normalized.da.fechaAutorizacion,
      cafObjectKey: this.cafObjectKey(context, normalized),
      updatedAt: now,
      createdAt: now,
    };

    if (this.backendEnabled()) {
      await this.writeS3Object(
        record.cafObjectKey,
        Buffer.from(normalized.rawXml, 'utf8'),
        'application/xml',
      );

      await this.dynamo!.send(
        new UpdateCommand({
          TableName: this.tableName!,
          Key: this.cafKey(record),
          UpdateExpression:
            'SET entityType = :entityType, tenantId = :tenantId, environment = :environment, rutEmisor = :rutEmisor, razonSocial = :razonSocial, tipoDTE = :tipoDTE, rangeStart = :rangeStart, rangeEnd = :rangeEnd, idk = :idk, fechaAutorizacion = :fechaAutorizacion, cafObjectKey = :cafObjectKey, updatedAt = :updatedAt, createdAt = if_not_exists(createdAt, :createdAt), nextFolio = if_not_exists(nextFolio, :nextFolio)',
          ExpressionAttributeValues: {
            ':entityType': 'caf_record',
            ':tenantId': record.tenantId,
            ':environment': record.environment,
            ':rutEmisor': record.rutEmisor,
            ':tipoDTE': record.tipoDTE,
            ':rangeStart': record.rangeStart,
            ':rangeEnd': record.rangeEnd,
            ':razonSocial': record.razonSocial,
            ':idk': record.idk,
            ':fechaAutorizacion': record.fechaAutorizacion,
            ':cafObjectKey': record.cafObjectKey,
            ':updatedAt': record.updatedAt,
            ':createdAt': record.createdAt,
            ':nextFolio': record.nextFolio,
          },
        }),
      );
    } else {
      await this.enqueueMemory(() => {
        const key = cafStorageKey(record);
        const existing = this.memoryCafs.get(key);
        this.memoryCafs.set(key, {
          ...record,
          nextFolio: existing?.nextFolio ?? record.nextFolio,
          createdAt: existing?.createdAt ?? record.createdAt,
        });
      });
    }

    this.cafMaterialCache.set(record.cafObjectKey, normalized);
  }

  async getCafStatus(
    context: IssuerContext,
    tipoDTE?: TipoDTE,
  ): Promise<CafWithStatus[]> {
    const records = await this.listCafRecords(context, tipoDTE);
    const statuses = records.map((record) => {
      const remaining = Math.max(0, record.rangeEnd - record.nextFolio + 1);
      const cafData = {
        da: {
          rutEmisor: record.rutEmisor,
          razonSocial: record.razonSocial,
          tipoDTE: record.tipoDTE,
          rangeStart: record.rangeStart,
          rangeEnd: record.rangeEnd,
          fechaAutorizacion: record.fechaAutorizacion,
          rsaPk: {
            modulus: '',
            exponent: '',
          },
          idk: record.idk,
        },
        frma: '',
        rsapubk: '',
      };

      const parsed = this.cafMaterialCache.get(record.cafObjectKey);
      return {
        caf: parsed
          ? {
              da: parsed.da,
              frma: parsed.frma,
              rsapubk: parsed.rsapubk,
            }
          : cafData,
        status: this.resolveCafStatus(record, remaining),
        remaining,
      } satisfies CafWithStatus;
    });

    return statuses.sort(
      (left, right) =>
        left.caf.da.tipoDTE - right.caf.da.tipoDTE ||
        left.caf.da.rangeStart - right.caf.da.rangeStart,
    );
  }

  async getNextFolio(
    context: IssuerContext,
    tipoDTE: TipoDTE,
  ): Promise<FolioAssignment> {
    const records = await this.listCafRecords(context, tipoDTE);

    for (const record of records) {
      if (
        this.resolveCafStatus(record, this.remainingFolios(record)) ===
        'expired'
      ) {
        continue;
      }
      if (record.nextFolio > record.rangeEnd) {
        continue;
      }

      if (!this.backendEnabled()) {
        return this.enqueueMemory(async () => {
          const latest = this.memoryCafs.get(cafStorageKey(record));
          if (!latest || latest.nextFolio > latest.rangeEnd) {
            throw new BadRequestException(
              `Folios agotados para DTE ${tipoDTE}`,
            );
          }
          const folio = latest.nextFolio;
          latest.nextFolio += 1;
          latest.updatedAt = new Date().toISOString();
          this.memoryCafs.set(cafStorageKey(latest), latest);
          const caf = await this.loadCafMaterial(latest);
          return { folio, caf, assignedAt: new Date() };
        });
      }

      try {
        const updated = await this.dynamo!.send(
          new UpdateCommand({
            TableName: this.tableName!,
            Key: this.cafKey(record),
            UpdateExpression:
              'SET nextFolio = nextFolio + :one, updatedAt = :updatedAt',
            ConditionExpression: 'nextFolio <= :rangeEnd',
            ExpressionAttributeValues: {
              ':one': 1,
              ':updatedAt': new Date().toISOString(),
              ':rangeEnd': record.rangeEnd,
            },
            ReturnValues: 'ALL_NEW',
          }),
        );
        const attributes = updated?.Attributes as CafRecordItem | undefined;
        if (!attributes) continue;
        const assignedFolio = Number(attributes.nextFolio) - 1;
        const caf = await this.loadCafMaterial(attributes);
        return {
          folio: assignedFolio,
          caf,
          assignedAt: new Date(),
        };
      } catch (error) {
        if (error instanceof ConditionalCheckFailedException) {
          continue;
        }
        throw error;
      }
    }

    throw new BadRequestException(`Folios agotados para DTE ${tipoDTE}`);
  }

  async reserveFolio(
    context: IssuerContext,
    tipoDTE: TipoDTE,
    folio: number,
  ): Promise<FolioAssignment> {
    const records = await this.listCafRecords(context, tipoDTE);
    const record = records.find(
      (item) => folio >= item.rangeStart && folio <= item.rangeEnd,
    );
    if (!record) {
      throw new BadRequestException(
        `El folio ${folio} no esta autorizado para el RUT ${context.rutEmisor} y DTE ${tipoDTE}`,
      );
    }

    if (isCafExpired(await this.loadCafMaterial(record))) {
      throw new BadRequestException(
        `El CAF para el folio ${folio} esta expirado`,
      );
    }

    if (!this.backendEnabled()) {
      return this.enqueueMemory(async () => {
        const latest = this.memoryCafs.get(cafStorageKey(record));
        if (!latest) {
          throw new BadRequestException(
            `El folio ${folio} no esta autorizado para el RUT ${context.rutEmisor} y DTE ${tipoDTE}`,
          );
        }
        if (folio < latest.nextFolio) {
          throw new BadRequestException(
            `El folio ${folio} ya fue reservado para DTE ${tipoDTE}`,
          );
        }
        latest.nextFolio = folio + 1;
        latest.updatedAt = new Date().toISOString();
        this.memoryCafs.set(cafStorageKey(latest), latest);
        const caf = await this.loadCafMaterial(latest);
        return { folio, caf, assignedAt: new Date() };
      });
    }

    try {
      const updated = await this.dynamo!.send(
        new UpdateCommand({
          TableName: this.tableName!,
          Key: this.cafKey(record),
          UpdateExpression:
            'SET nextFolio = :nextFolio, updatedAt = :updatedAt',
          ConditionExpression: 'nextFolio <= :folio AND :folio <= :rangeEnd',
          ExpressionAttributeValues: {
            ':nextFolio': folio + 1,
            ':updatedAt': new Date().toISOString(),
            ':folio': folio,
            ':rangeEnd': record.rangeEnd,
          },
          ReturnValues: 'ALL_NEW',
        }),
      );
      const attributes = updated?.Attributes as CafRecordItem | undefined;
      if (!attributes) {
        throw new BadRequestException(`El folio ${folio} ya fue reservado`);
      }
      const caf = await this.loadCafMaterial(attributes);
      return { folio, caf, assignedAt: new Date() };
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new BadRequestException(
          `El folio ${folio} ya fue reservado para DTE ${tipoDTE}`,
        );
      }
      throw error;
    }
  }

  private backendEnabled(): boolean {
    return Boolean(this.tableName && this.bucketName);
  }

  private async saveIssuerCertificateToAws(
    profile: StoredFiscalIssuerProfile,
    pfxBuffer: Buffer,
    password: string,
  ): Promise<void> {
    await this.writeS3Object(
      profile.certificateObjectKey,
      pfxBuffer,
      'application/x-pkcs12',
    );
    await this.ssm!.send(
      new PutParameterCommand({
        Name: profile.certificatePasswordParameterName,
        Type: 'SecureString',
        Value: password,
        Overwrite: true,
        KeyId: this.ssmKmsKeyId,
      }),
    );
    await this.dynamo!.send(
      new PutCommand({
        TableName: this.tableName!,
        Item: {
          ...this.profileKey(profile),
          ...profile,
          entityType: 'issuer_profile',
        } satisfies IssuerProfileItem,
      }),
    );
  }

  private async findIssuerInAws(
    lookup: FiscalIssuerLookup,
  ): Promise<StoredFiscalIssuerProfile | undefined> {
    const pk = issuerPartitionKey(lookup.tenantId!, lookup.rutEmisor!);
    if (lookup.environment) {
      const profile = await this.dynamo!.send(
        new GetCommand({
          TableName: this.tableName!,
          Key: {
            pk,
            sk: profileSortKey(lookup.environment),
          },
        }),
      );
      return profile?.Item
        ? stripProfileItem(profile.Item as IssuerProfileItem)
        : undefined;
    }

    const result = await this.dynamo!.send(
      new QueryCommand({
        TableName: this.tableName!,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': pk,
          ':skPrefix': 'PROFILE#',
        },
      }),
    );
    const items = (result?.Items ?? []) as IssuerProfileItem[];
    if (items.length === 1) {
      return stripProfileItem(items[0]);
    }
    if (items.length > 1) {
      throw new BadRequestException(
        'El emisor tiene mas de un ambiente configurado; envie environment para resolverlo',
      );
    }
    return undefined;
  }

  private findIssuerInMemory(
    lookup: FiscalIssuerLookup,
  ): StoredFiscalIssuerProfile | undefined {
    const normalizedRut = normalizeRut(lookup.rutEmisor!);
    const entries = [...this.memoryProfiles.values()].filter(
      (item) =>
        item.tenantId === lookup.tenantId &&
        item.rutEmisor === normalizedRut &&
        (!lookup.environment || item.environment === lookup.environment),
    );
    if (entries.length === 1) return entries[0];
    if (entries.length > 1 && !lookup.environment) {
      throw new BadRequestException(
        'El emisor tiene mas de un ambiente configurado; envie environment para resolverlo',
      );
    }
    return entries[0];
  }

  private async listCafRecords(
    context: IssuerContext,
    tipoDTE?: TipoDTE,
  ): Promise<StoredFiscalCafRecord[]> {
    if (!context.tenantId) {
      throw new BadRequestException(
        'tenantId es requerido para resolver CAF persistido por emisor',
      );
    }

    if (!this.backendEnabled()) {
      return [...this.memoryCafs.values()]
        .filter(
          (item) =>
            item.tenantId === context.tenantId &&
            item.environment === context.environment &&
            item.rutEmisor === normalizeRut(context.rutEmisor) &&
            (tipoDTE === undefined || item.tipoDTE === tipoDTE),
        )
        .sort(compareCafRecords);
    }

    const input: QueryCommandInput = {
      TableName: this.tableName!,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': issuerPartitionKey(context.tenantId, context.rutEmisor),
        ':skPrefix':
          tipoDTE === undefined
            ? `CAF#${context.environment}#`
            : `CAF#${context.environment}#${padDte(tipoDTE)}#`,
      },
    };
    const response = await this.dynamo!.send(new QueryCommand(input));
    return ((response?.Items ?? []) as CafRecordItem[])
      .map(stripCafItem)
      .sort(compareCafRecords);
  }

  private async loadCafMaterial(
    record: StoredFiscalCafRecord,
  ): Promise<CafMaterial> {
    const cached = this.cafMaterialCache.get(record.cafObjectKey);
    if (cached) return cached;

    if (!this.backendEnabled()) {
      throw new NotFoundException(
        `No existe material CAF cargado para ${record.cafObjectKey}`,
      );
    }

    const xmlBuffer = await this.readS3ObjectBuffer(record.cafObjectKey);
    const caf = parseCaf(xmlBuffer.toString('utf8'));
    caf.rsask = normalizeCafPrivateKey(caf.rsask);
    this.cafMaterialCache.set(record.cafObjectKey, caf);
    return caf;
  }

  private async writeS3Object(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.s3!.send(
      new PutObjectCommand({
        Bucket: this.bucketName!,
        Key: key,
        Body: body,
        ContentType: contentType,
        ServerSideEncryption: this.serverSideEncryption(),
        SSEKMSKeyId: this.s3KmsKeyId,
      }),
    );
  }

  private async readS3ObjectBuffer(key: string): Promise<Buffer> {
    const response = await this.s3!.send(
      new GetObjectCommand({
        Bucket: this.bucketName!,
        Key: key,
      }),
    );
    const body = response?.Body as
      | { transformToByteArray?: () => Promise<Uint8Array> }
      | undefined;
    if (!body) {
      throw new NotFoundException(`No se encontro objeto fiscal ${key}`);
    }
    if (!body.transformToByteArray) {
      throw new Error('No se pudo leer el stream S3 del objeto fiscal');
    }

    const byteArray = await body.transformToByteArray();
    return Buffer.from(byteArray);
  }

  private async readSecureString(name: string): Promise<string> {
    const response = await this.ssm!.send(
      new GetParameterCommand({
        Name: name,
        WithDecryption: true,
      }),
    );
    if (!response?.Parameter?.Value) {
      throw new NotFoundException(`No existe secreto fiscal ${name}`);
    }
    return response.Parameter.Value;
  }

  private serverSideEncryption(): ServerSideEncryption {
    return this.s3KmsKeyId ? 'aws:kms' : 'AES256';
  }

  private profileKey(
    profile: Pick<
      StoredFiscalIssuerProfile,
      'tenantId' | 'rutEmisor' | 'environment'
    >,
  ) {
    return {
      pk: issuerPartitionKey(profile.tenantId, profile.rutEmisor),
      sk: profileSortKey(profile.environment),
    };
  }

  private cafKey(
    record: Pick<
      StoredFiscalCafRecord,
      | 'tenantId'
      | 'rutEmisor'
      | 'environment'
      | 'tipoDTE'
      | 'rangeStart'
      | 'rangeEnd'
    >,
  ) {
    return {
      pk: issuerPartitionKey(record.tenantId, record.rutEmisor),
      sk: cafSortKey(
        record.environment,
        record.tipoDTE,
        record.rangeStart,
        record.rangeEnd,
      ),
    };
  }

  private certificateObjectKey(
    input: Pick<
      UpsertFiscalIssuerInput,
      'tenantId' | 'rutEmisor' | 'environment'
    >,
  ): string {
    return [
      this.s3Prefix,
      'issuers',
      sanitizeKeySegment(input.tenantId),
      sanitizeKeySegment(normalizeRut(input.rutEmisor)),
      sanitizeKeySegment(input.environment),
      'certificate',
      'current.pfx',
    ].join('/');
  }

  private certificatePasswordParameterName(
    input: Pick<
      UpsertFiscalIssuerInput,
      'tenantId' | 'rutEmisor' | 'environment'
    >,
  ): string {
    return [
      this.parameterPrefix,
      'issuers',
      sanitizeParameterSegment(input.tenantId),
      sanitizeParameterSegment(normalizeRut(input.rutEmisor)),
      sanitizeParameterSegment(input.environment),
      'certificate-password',
    ].join('/');
  }

  private cafObjectKey(context: IssuerContext, caf: CafMaterial): string {
    if (!context.tenantId) {
      throw new BadRequestException(
        'tenantId es requerido para construir clave S3 del CAF',
      );
    }
    return [
      this.s3Prefix,
      'issuers',
      sanitizeKeySegment(context.tenantId),
      sanitizeKeySegment(normalizeRut(context.rutEmisor)),
      sanitizeKeySegment(context.environment),
      'caf',
      padDte(caf.da.tipoDTE),
      `${padRange(caf.da.rangeStart)}-${padRange(caf.da.rangeEnd)}.xml`,
    ].join('/');
  }

  private resolveCafStatus(
    record: StoredFiscalCafRecord,
    remaining: number,
  ): CafWithStatus['status'] {
    const cached = this.cafMaterialCache.get(record.cafObjectKey);
    const cafData = cached ?? {
      da: {
        rutEmisor: record.rutEmisor,
        razonSocial: '',
        tipoDTE: record.tipoDTE,
        rangeStart: record.rangeStart,
        rangeEnd: record.rangeEnd,
        fechaAutorizacion: record.fechaAutorizacion,
        rsaPk: {
          modulus: '',
          exponent: '',
        },
        idk: '',
      },
      frma: '',
      rsapubk: '',
    };

    if (isCafExpired(cafData)) return 'expired';
    if (remaining <= 0) return 'exhausted';
    if (isCafExpiringSoon(cafData)) return 'expiring_soon';
    return 'active';
  }

  private remainingFolios(record: StoredFiscalCafRecord): number {
    return Math.max(0, record.rangeEnd - record.nextFolio + 1);
  }

  private enqueueMemory<T>(task: () => Promise<T> | T): Promise<T> {
    const result = this.memoryQueue.then(task);
    this.memoryQueue = result.catch(() => undefined);
    return result;
  }
}

function buildCertificateRef(
  input: Pick<
    UpsertFiscalIssuerInput,
    'tenantId' | 'rutEmisor' | 'environment'
  >,
): string {
  return [
    'issuer',
    encodeURIComponent(input.tenantId),
    encodeURIComponent(normalizeRut(input.rutEmisor)),
    encodeURIComponent(input.environment),
  ].join(':');
}

function parseCertificateRef(
  certificateRef: string,
):
  | { tenantId: string; rutEmisor: string; environment: SiiEnvironment }
  | undefined {
  const [prefix, tenantId, rutEmisor, environment] = certificateRef.split(':');
  if (
    prefix !== 'issuer' ||
    !tenantId ||
    !rutEmisor ||
    !environment ||
    !Object.values(SiiEnvironment).includes(environment as SiiEnvironment)
  ) {
    return undefined;
  }

  return {
    tenantId: decodeURIComponent(tenantId),
    rutEmisor: decodeURIComponent(rutEmisor),
    environment: decodeURIComponent(environment) as SiiEnvironment,
  };
}

function issuerPartitionKey(tenantId: string, rutEmisor: string): string {
  return `TENANT#${tenantId}#ISSUER#${normalizeRut(rutEmisor)}`;
}

function profileSortKey(environment: SiiEnvironment): string {
  return `PROFILE#${environment}`;
}

function cafSortKey(
  environment: SiiEnvironment,
  tipoDTE: number,
  rangeStart: number,
  rangeEnd: number,
): string {
  return `CAF#${environment}#${padDte(tipoDTE)}#${padRange(rangeStart)}#${padRange(rangeEnd)}`;
}

function padDte(tipoDTE: number): string {
  return String(tipoDTE).padStart(3, '0');
}

function padRange(value: number): string {
  return String(value).padStart(12, '0');
}

function sanitizeKeySegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9\-_.]/g, '_');
}

function sanitizeParameterSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9\-_.]/g, '_');
}

function profileKey(
  profile: Pick<
    StoredFiscalIssuerProfile,
    'tenantId' | 'rutEmisor' | 'environment'
  >,
): string {
  return `${profile.tenantId}:${normalizeRut(profile.rutEmisor)}:${profile.environment}`;
}

function cafStorageKey(
  record: Pick<
    StoredFiscalCafRecord,
    | 'tenantId'
    | 'rutEmisor'
    | 'environment'
    | 'tipoDTE'
    | 'rangeStart'
    | 'rangeEnd'
  >,
): string {
  return [
    record.tenantId,
    normalizeRut(record.rutEmisor),
    record.environment,
    record.tipoDTE,
    record.rangeStart,
    record.rangeEnd,
  ].join(':');
}

function compareCafRecords(
  left: StoredFiscalCafRecord,
  right: StoredFiscalCafRecord,
): number {
  return left.tipoDTE - right.tipoDTE || left.rangeStart - right.rangeStart;
}

function stripProfileItem(item: IssuerProfileItem): StoredFiscalIssuerProfile {
  const { pk, sk, entityType, ...rest } = item;
  void pk;
  void sk;
  void entityType;
  return rest;
}

function stripCafItem(item: CafRecordItem): StoredFiscalCafRecord {
  const { pk, sk, entityType, ...rest } = item;
  void pk;
  void sk;
  void entityType;
  return rest;
}

function trimToUndefined(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseBoolean(value?: string | boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function normalizeCafPrivateKey(rsask: string): string {
  if (!rsask.includes('-----BEGIN')) {
    return rsask.replace(/\s/g, '');
  }

  try {
    const privateKey = forge.pki.privateKeyFromPem(rsask);
    const privateKeyAsn1 = forge.pki.privateKeyToAsn1(privateKey);
    const der = forge.asn1.toDer(privateKeyAsn1).getBytes();
    return forge.util.encode64(der);
  } catch {
    throw new BadRequestException(
      'No se pudo normalizar la clave privada RSASK del CAF',
    );
  }
}
