import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';

export interface AppFunctionProps {
  entry: string;
  environment?: Record<string, string>;
  timeout?: Duration;
  memorySize?: number;
  nodeModules?: string[];
}

const REQUIRE_SHIM =
  "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);";

export const backendPath = (relative: string) =>
  fileURLToPath(new URL(`../../backend/${relative}`, import.meta.url));

export function logGroup(scope: Construct, id: string): logs.LogGroup {
  return new logs.LogGroup(scope, id, {
    retention: logs.RetentionDays.ONE_WEEK,
    removalPolicy: RemovalPolicy.DESTROY,
  });
}

export function appFunction(scope: Construct, id: string, props: AppFunctionProps) {
  return new NodejsFunction(scope, id, {
    entry: backendPath(props.entry),
    depsLockFilePath: backendPath('package-lock.json'),
    runtime: lambda.Runtime.NODEJS_24_X,
    architecture: lambda.Architecture.ARM_64,
    memorySize: props.memorySize ?? 256,
    timeout: props.timeout ?? Duration.seconds(10),
    environment: props.environment,
    bundling: {
      format: OutputFormat.ESM,
      minify: true,
      keepNames: true,
      banner: REQUIRE_SHIM,
      nodeModules: props.nodeModules,
    },
    logGroup: logGroup(scope, `${id}Logs`),
  });
}
