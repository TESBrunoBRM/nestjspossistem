const {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
} = require('@aws-sdk/client-dynamodb');
const {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} = require('@aws-sdk/client-s3');
const {
  DeleteParameterCommand,
  GetParameterCommand,
  PutParameterCommand,
  SSMClient,
} = require('@aws-sdk/client-ssm');
async function main() {
  const region = process.env.AWS_REGION || 'us-east-1';
  const globalEndpoint = trimToUndefined(process.env.AWS_ENDPOINT_URL);
  const ddbEndpoint =
    trimToUndefined(process.env.AWS_FISCAL_DDB_ENDPOINT) || globalEndpoint;
  const s3Endpoint =
    trimToUndefined(process.env.AWS_FISCAL_S3_ENDPOINT) || globalEndpoint;
  const ssmEndpoint =
    trimToUndefined(process.env.AWS_FISCAL_SSM_ENDPOINT) || globalEndpoint;
  const bucketName = requiredEnv('AWS_FISCAL_S3_BUCKET');
  const tableName = requiredEnv('AWS_FISCAL_DDB_TABLE');
  const ssmPrefix =
    trimToUndefined(process.env.AWS_FISCAL_SSM_PREFIX) ||
    '/business-app-sii/fiscal';
  const forcePathStyle = parseBoolean(
    process.env.AWS_FISCAL_S3_FORCE_PATH_STYLE,
  );

  await assertMinistackHealthy(globalEndpoint || 'http://127.0.0.1:4566');

  const credentials = resolveStaticCredentials();
  const dynamo = new DynamoDBClient({
    region,
    endpoint: ddbEndpoint,
    ...credentials,
  });
  const s3 = new S3Client({
    region,
    endpoint: s3Endpoint,
    forcePathStyle,
    ...credentials,
  });
  const ssm = new SSMClient({
    region,
    endpoint: ssmEndpoint,
    ...credentials,
  });

  await ensureBucket(s3, bucketName, region);
  await ensureTable(dynamo, tableName);
  await verifySecureStringSupport(ssm, ssmPrefix);

  console.log('');
  console.log('MiniStack listo para business-app-sii');
  console.log(`- S3 bucket: ${bucketName}`);
  console.log(`- DynamoDB table: ${tableName}`);
  console.log(`- SSM prefix: ${ssmPrefix}`);
}

async function assertMinistackHealthy(endpoint) {
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/_ministack/health`);
  if (!response.ok) {
    throw new Error(
      `MiniStack no responde saludablemente en ${endpoint} (HTTP ${response.status})`,
    );
  }
}

async function ensureBucket(s3, bucketName, region) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucketName }));
    console.log(`S3 bucket existente: ${bucketName}`);
    return;
  } catch (error) {
    if (!isAwsNotFound(error)) throw error;
  }

  const input = { Bucket: bucketName };
  if (region !== 'us-east-1') {
    input.CreateBucketConfiguration = { LocationConstraint: region };
  }
  await s3.send(new CreateBucketCommand(input));
  console.log(`S3 bucket creado: ${bucketName}`);
}

async function ensureTable(dynamo, tableName) {
  try {
    const existing = await dynamo.send(
      new DescribeTableCommand({ TableName: tableName }),
    );
    if (existing.Table?.TableStatus === 'ACTIVE') {
      console.log(`DynamoDB table existente: ${tableName}`);
      return;
    }
  } catch (error) {
    if (!isAwsNotFound(error)) {
      throw error;
    }
  }

  await dynamo.send(
    new CreateTableCommand({
      TableName: tableName,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'pk', AttributeType: 'S' },
        { AttributeName: 'sk', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
    }),
  );
  await waitForActiveTable(dynamo, tableName);
  console.log(`DynamoDB table creada: ${tableName}`);
}

async function waitForActiveTable(dynamo, tableName) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await dynamo.send(
      new DescribeTableCommand({ TableName: tableName }),
    );
    if (response.Table?.TableStatus === 'ACTIVE') {
      return;
    }
    await sleep(500);
  }

  throw new Error(`La tabla ${tableName} no quedo ACTIVE a tiempo`);
}

async function verifySecureStringSupport(ssm, ssmPrefix) {
  const name = `${ssmPrefix.replace(/\/$/, '')}/__bootstrap_probe__`;
  const value = `probe-${Date.now()}`;

  await ssm.send(
    new PutParameterCommand({
      Name: name,
      Type: 'SecureString',
      Value: value,
      Overwrite: true,
    }),
  );

  const response = await ssm.send(
    new GetParameterCommand({
      Name: name,
      WithDecryption: true,
    }),
  );
  if (response.Parameter?.Value !== value) {
    throw new Error(
      `SSM devolvio un valor inesperado para el probe ${name}`,
    );
  }

  try {
    await ssm.send(new DeleteParameterCommand({ Name: name }));
  } catch {
    // El probe es temporal; si el delete falla no bloquea el bootstrap.
  }

  console.log(`SSM SecureString verificado bajo ${ssmPrefix}`);
}

function resolveStaticCredentials() {
  const accessKeyId = trimToUndefined(process.env.AWS_ACCESS_KEY_ID);
  const secretAccessKey = trimToUndefined(process.env.AWS_SECRET_ACCESS_KEY);
  const sessionToken = trimToUndefined(process.env.AWS_SESSION_TOKEN);

  if (!accessKeyId || !secretAccessKey) {
    return {};
  }

  return {
    credentials: {
      accessKeyId,
      secretAccessKey,
      sessionToken,
    },
  };
}

function requiredEnv(name) {
  const value = trimToUndefined(process.env[name]);
  if (!value) {
    throw new Error(`Falta variable requerida: ${name}`);
  }
  return value;
}

function trimToUndefined(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseBoolean(value) {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function isAwsNotFound(error) {
  const status = error?.$metadata?.httpStatusCode;
  const name = error?.name;
  const code = error?.Code;
  return (
    status === 404 ||
    name === 'NotFoundException' ||
    name === 'ResourceNotFoundException' ||
    name === 'NoSuchBucket' ||
    code === 'NoSuchBucket'
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error('Bootstrap MiniStack fallido');
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
