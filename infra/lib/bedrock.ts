import { Stack } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

export const NOVA_PROFILE_ID = 'us.amazon.nova-2-lite-v1:0';
export const NOVA_MODEL_ID = 'amazon.nova-2-lite-v1:0';
export const NOVA_GROUNDING_TOOL = 'amazon.nova_grounding';

export function grantNovaInvoke(scope: Construct, grantee: iam.IGrantable): void {
  const stack = Stack.of(scope);
  grantee.grantPrincipal.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: [
        `arn:${stack.partition}:bedrock:${stack.region}:${stack.account}:inference-profile/${NOVA_PROFILE_ID}`,
        `arn:${stack.partition}:bedrock:us-*::foundation-model/${NOVA_MODEL_ID}`,
      ],
    }),
  );
}

export function grantNovaGrounding(scope: Construct, grantee: iam.IGrantable): void {
  const stack = Stack.of(scope);
  grantee.grantPrincipal.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['bedrock:InvokeTool'],
      resources: [
        `arn:${stack.partition}:bedrock::${stack.account}:system-tool/${NOVA_GROUNDING_TOOL}`,
      ],
    }),
  );
}
