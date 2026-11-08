import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { Run } from './run.js';
import { Storage } from './storage.js';

export interface AnswerShareStackProps extends StackProps {
  alertEmail: string;
  maxCallsPerRun: number;
  openAiModel: string;
}

export class AnswerShareStack extends Stack {
  readonly storage: Storage;
  readonly run: Run;

  constructor(scope: Construct, id: string, props: AnswerShareStackProps) {
    super(scope, id, props);

    this.storage = new Storage(this, 'Storage');
    this.run = new Run(this, 'Run', {
      table: this.storage.table,
      rawBucket: this.storage.rawBucket,
      maxCallsPerRun: props.maxCallsPerRun,
      openAiModel: props.openAiModel,
    });

    new CfnOutput(this, 'Region', { value: this.region });
    new CfnOutput(this, 'TableName', { value: this.storage.table.tableName });
    new CfnOutput(this, 'RawBucketName', { value: this.storage.rawBucket.bucketName });
    new CfnOutput(this, 'StateMachineArn', { value: this.run.stateMachine.stateMachineArn });
    new CfnOutput(this, 'SchedulerRoleArn', { value: this.run.schedulerRole.roleArn });
    new CfnOutput(this, 'AskFunctionName', { value: this.run.ask.functionName });
    new CfnOutput(this, 'StartRunFunctionName', { value: this.run.startRun.functionName });
  }
}
