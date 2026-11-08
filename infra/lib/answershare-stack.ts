import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { Storage } from './storage.js';

export interface AnswerShareStackProps extends StackProps {
  alertEmail: string;
}

export class AnswerShareStack extends Stack {
  readonly storage: Storage;

  constructor(scope: Construct, id: string, props: AnswerShareStackProps) {
    super(scope, id, props);

    this.storage = new Storage(this, 'Storage');

    new CfnOutput(this, 'Region', { value: this.region });
    new CfnOutput(this, 'TableName', { value: this.storage.table.tableName });
    new CfnOutput(this, 'RawBucketName', { value: this.storage.rawBucket.bucketName });
  }
}
