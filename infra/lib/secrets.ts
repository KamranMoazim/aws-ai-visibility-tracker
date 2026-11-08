import { Stack } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

export const OPENAI_KEY_PARAMETER = '/answershare/openai-api-key';
export const PERPLEXITY_KEY_PARAMETER = '/answershare/perplexity-api-key';

export function parameterArn(scope: Construct, name: string): string {
  const stack = Stack.of(scope);
  return `arn:${stack.partition}:ssm:${stack.region}:${stack.account}:parameter${name}`;
}

export function grantReadKeys(scope: Construct, grantee: iam.IGrantable, names: string[]): void {
  grantee.grantPrincipal.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: names.map((name) => parameterArn(scope, name)),
    }),
  );
}
