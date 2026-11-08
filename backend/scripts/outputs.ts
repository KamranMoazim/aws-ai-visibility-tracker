import { readFileSync } from 'node:fs';

export interface StackOutputs {
  Region: string;
  TableName: string;
  RawBucketName: string;
  StateMachineArn: string;
  SchedulerRoleArn: string;
  AskFunctionName: string;
  StartRunFunctionName: string;
  UserPoolId: string;
  UserPoolClientId: string;
  ApiUrl: string;
  SiteUrl: string;
}

export function loadOutputs(): StackOutputs {
  let outputs: StackOutputs;
  try {
    outputs = JSON.parse(
      readFileSync(new URL('../../infra/cdk-outputs.json', import.meta.url), 'utf8'),
    ).AnswerShareStack;
  } catch {
    throw new Error('infra/cdk-outputs.json not found; run npm run infra:deploy first');
  }
  process.env.AWS_REGION ??= outputs.Region;
  process.env.TABLE_NAME ??= outputs.TableName;
  process.env.RAW_BUCKET_NAME ??= outputs.RawBucketName;
  process.env.STATE_MACHINE_ARN ??= outputs.StateMachineArn;
  process.env.SCHEDULER_ROLE_ARN ??= outputs.SchedulerRoleArn;
  return outputs;
}
