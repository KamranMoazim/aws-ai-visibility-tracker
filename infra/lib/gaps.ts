import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import type { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { grantNovaInvoke } from './bedrock.js';
import { appFunction } from './function.js';

const WORKER_TIMEOUT = Duration.minutes(5);

export interface GapsProps {
  table: dynamodb.ITableV2;
  rawBucket: s3.IBucket;
}

export class Gaps extends Construct {
  readonly queue: sqs.Queue;
  readonly deadLetterQueue: sqs.Queue;
  readonly worker: NodejsFunction;

  constructor(scope: Construct, id: string, props: GapsProps) {
    super(scope, id);

    this.deadLetterQueue = new sqs.Queue(this, 'DeadLetterQueue', {
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    this.queue = new sqs.Queue(this, 'Queue', {
      visibilityTimeout: Duration.seconds(WORKER_TIMEOUT.toSeconds() * 6),
      deadLetterQueue: { queue: this.deadLetterQueue, maxReceiveCount: 3 },
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.worker = appFunction(this, 'Worker', {
      entry: 'src/gap-worker/handler.ts',
      environment: {
        TABLE_NAME: props.table.tableName,
        RAW_BUCKET_NAME: props.rawBucket.bucketName,
      },
      timeout: WORKER_TIMEOUT,
      memorySize: 1024,
    });
    this.worker.addEventSource(
      new SqsEventSource(this.queue, {
        batchSize: 1,
        maxConcurrency: 5,
        reportBatchItemFailures: true,
      }),
    );
    props.table.grantReadWriteData(this.worker);
    props.rawBucket.grantReadWrite(this.worker, 'pages/*');
    props.rawBucket.grantRead(this.worker, 'raw/*');
    grantNovaInvoke(this, this.worker);
  }
}
