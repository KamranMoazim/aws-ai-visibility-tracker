import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';
import { grantNovaGrounding, grantNovaInvoke } from './bedrock.js';
import { appFunction } from './function.js';
import { grantReadKeys, OPENAI_KEY_PARAMETER, PERPLEXITY_KEY_PARAMETER } from './secrets.js';

export const SCHEDULE_GROUP = 'answershare';
export const ENGINE_CONCURRENCY = { openai: 5, nova: 5, sonar: 3, fake: 10 } as const;
const RETRYABLE_ERROR = 'EngineRetryableError';

export interface RunProps {
  table: dynamodb.ITableV2;
  rawBucket: s3.IBucket;
  maxCallsPerRun: number;
  openAiModel: string;
}

export class Run extends Construct {
  readonly startRun: NodejsFunction;
  readonly ask: NodejsFunction;
  readonly extract: NodejsFunction;
  readonly recordFailure: NodejsFunction;
  readonly aggregate: NodejsFunction;
  readonly stateMachine: sfn.StateMachine;
  readonly schedulerRole: iam.Role;

  constructor(scope: Construct, id: string, props: RunProps) {
    super(scope, id);

    const environment = { TABLE_NAME: props.table.tableName };
    const keys = [OPENAI_KEY_PARAMETER, PERPLEXITY_KEY_PARAMETER];

    this.startRun = appFunction(this, 'StartRun', {
      entry: 'src/run-start/handler.ts',
      environment: {
        ...environment,
        MAX_CALLS_PER_RUN: String(props.maxCallsPerRun),
        OPENAI_MODEL: props.openAiModel,
      },
      timeout: Duration.seconds(30),
    });
    this.ask = appFunction(this, 'Ask', {
      entry: 'src/run-ask/handler.ts',
      environment: {
        ...environment,
        RAW_BUCKET_NAME: props.rawBucket.bucketName,
        OPENAI_MODEL: props.openAiModel,
      },
      timeout: Duration.minutes(3),
      memorySize: 512,
    });
    this.extract = appFunction(this, 'Extract', {
      entry: 'src/run-extract/handler.ts',
      environment,
      timeout: Duration.minutes(2),
    });
    this.recordFailure = appFunction(this, 'RecordFailure', {
      entry: 'src/run-failure/handler.ts',
      environment,
    });
    this.aggregate = appFunction(this, 'Aggregate', {
      entry: 'src/run-aggregate/handler.ts',
      environment,
      timeout: Duration.minutes(5),
      memorySize: 1024,
    });

    for (const fn of [this.startRun, this.ask, this.extract, this.recordFailure, this.aggregate]) {
      props.table.grantReadWriteData(fn);
    }
    props.rawBucket.grantPut(this.ask, 'raw/*');
    grantReadKeys(this, this.startRun, keys);
    grantReadKeys(this, this.ask, keys);
    grantNovaInvoke(this, this.ask);
    grantNovaGrounding(this, this.ask);
    grantNovaInvoke(this, this.extract);

    this.stateMachine = new sfn.StateMachine(this, 'StateMachine', {
      definitionBody: sfn.DefinitionBody.fromChainable(this.definition()),
      timeout: Duration.hours(3),
      logs: {
        destination: new logs.LogGroup(this, 'StateMachineLogs', {
          retention: logs.RetentionDays.ONE_WEEK,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
        level: sfn.LogLevel.ERROR,
      },
    });

    new scheduler.CfnScheduleGroup(this, 'ScheduleGroup', { name: SCHEDULE_GROUP });
    this.schedulerRole = new iam.Role(this, 'SchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    });
    this.stateMachine.grantStartExecution(this.schedulerRole);
  }

  private invoke(id: string, fn: NodejsFunction, payload?: sfn.TaskInput) {
    return new tasks.LambdaInvoke(this, id, {
      lambdaFunction: fn,
      payloadResponseOnly: true,
      retryOnServiceExceptions: true,
      payload,
    });
  }

  private engineMap(engine: keyof typeof ENGINE_CONCURRENCY, label: string): sfn.Map {
    const recordFailure = (stage: string) =>
      this.invoke(
        `Record${label}${stage}Failure`,
        this.recordFailure,
        sfn.TaskInput.fromObject({
          kind: 'item',
          item: sfn.JsonPath.objectAt('$'),
          error: sfn.JsonPath.objectAt('$.error'),
        }),
      ).addCatch(new sfn.Pass(this, `Ignore${label}${stage}Failure`), {
        resultPath: sfn.JsonPath.DISCARD,
      });

    const ask = this.invoke(`Ask${label}`, this.ask)
      .addRetry({
        errors: [RETRYABLE_ERROR],
        interval: Duration.seconds(5),
        maxAttempts: 4,
        backoffRate: 2,
        jitterStrategy: sfn.JitterType.FULL,
      })
      .addCatch(recordFailure('Ask'), { resultPath: '$.error' });
    const extract = this.invoke(`Extract${label}`, this.extract).addCatch(
      recordFailure('Extract'),
      { resultPath: '$.error' },
    );

    return new sfn.Map(this, `Map${label}`, {
      itemsPath: `$.work.${engine}`,
      maxConcurrency: ENGINE_CONCURRENCY[engine],
      resultPath: sfn.JsonPath.DISCARD,
    }).itemProcessor(ask.next(extract));
  }

  private definition(): sfn.IChainable {
    const start = this.invoke(
      'StartRunTask',
      this.startRun,
      sfn.TaskInput.fromObject({
        input: sfn.JsonPath.objectAt('$'),
        executionArn: sfn.JsonPath.executionId,
      }),
    );
    const failRun = this.invoke(
      'MarkRunFailed',
      this.recordFailure,
      sfn.TaskInput.fromObject({
        kind: 'run',
        runId: sfn.JsonPath.stringAt('$.runId'),
        workspaceId: sfn.JsonPath.stringAt('$.workspaceId'),
        error: sfn.JsonPath.objectAt('$.error'),
      }),
    ).next(new sfn.Fail(this, 'RunFailed'));

    const engines = new sfn.Parallel(this, 'AskEngines', { resultPath: sfn.JsonPath.DISCARD })
      .branch(this.engineMap('openai', 'OpenAi'))
      .branch(this.engineMap('nova', 'Nova'))
      .branch(this.engineMap('sonar', 'Sonar'))
      .branch(this.engineMap('fake', 'Fake'))
      .addCatch(failRun, { resultPath: '$.error' });
    const aggregate = this.invoke(
      'AggregateTask',
      this.aggregate,
      sfn.TaskInput.fromObject({
        runId: sfn.JsonPath.stringAt('$.runId'),
        workspaceId: sfn.JsonPath.stringAt('$.workspaceId'),
      }),
    ).addCatch(failRun, { resultPath: '$.error' });

    return start.next(
      new sfn.Choice(this, 'Refused')
        .when(sfn.Condition.booleanEquals('$.refused', true), new sfn.Succeed(this, 'RunRefused'))
        .otherwise(engines.next(aggregate)),
    );
  }
}
