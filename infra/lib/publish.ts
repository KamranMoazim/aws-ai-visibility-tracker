import { Duration, Stack } from 'aws-cdk-lib';
import type * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { appFunction } from './function.js';
import { grantReadKeys } from './secrets.js';
import { GENERATED_ROOT_FILES, GUIDES_PREFIX } from './web.js';

export const WORDPRESS_PASSWORD_PARAMETER = '/answershare/wordpress-app-password';

export interface PublishProps {
  table: dynamodb.ITableV2;
  rawBucket: s3.IBucket;
  siteBucket: s3.IBucket;
  distribution: cloudfront.IDistribution;
  siteName: string;
}

export class Publish extends Construct {
  readonly publisher: NodejsFunction;

  constructor(scope: Construct, id: string, props: PublishProps) {
    super(scope, id);
    const stack = Stack.of(this);

    this.publisher = appFunction(this, 'Publisher', {
      entry: 'src/publish/handler.ts',
      environment: {
        TABLE_NAME: props.table.tableName,
        RAW_BUCKET_NAME: props.rawBucket.bucketName,
        SITE_BUCKET_NAME: props.siteBucket.bucketName,
        DISTRIBUTION_ID: props.distribution.distributionId,
        SITE_URL: `https://${props.distribution.distributionDomainName}`,
        GUIDES_SITE_NAME: props.siteName,
      },
      timeout: Duration.seconds(25),
      memorySize: 512,
    });
    props.table.grantReadWriteData(this.publisher);
    props.rawBucket.grantReadWrite(this.publisher, 'site/*');
    this.publisher.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:PutObject', 's3:DeleteObject'],
        resources: [
          props.siteBucket.arnForObjects(`${GUIDES_PREFIX}*`),
          ...GENERATED_ROOT_FILES.map((file) => props.siteBucket.arnForObjects(file)),
        ],
      }),
    );
    this.publisher.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cloudfront:CreateInvalidation'],
        resources: [
          `arn:${stack.partition}:cloudfront::${stack.account}:distribution/${props.distribution.distributionId}`,
        ],
      }),
    );
    grantReadKeys(this, this.publisher, [WORDPRESS_PASSWORD_PARAMETER]);
  }
}
