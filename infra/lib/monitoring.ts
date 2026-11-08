import { Duration, Stack } from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import type * as cognito from 'aws-cdk-lib/aws-cognito';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import type * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { appFunction } from './function.js';

export const MONTHLY_BUDGET_USD = 30;

export interface MonitoringProps {
  alertEmail: string;
  digestFrom: string;
  siteUrl: string;
  table: dynamodb.ITableV2;
  userPool: cognito.IUserPool;
  stateMachine: sfn.IStateMachine;
  deadLetterQueue: sqs.IQueue;
  erroringFunctions: Record<string, NodejsFunction>;
}

export class Monitoring extends Construct {
  readonly topic: sns.Topic;
  readonly digest: NodejsFunction;

  constructor(scope: Construct, id: string, props: MonitoringProps) {
    super(scope, id);
    const stack = Stack.of(this);

    this.topic = new sns.Topic(this, 'Alerts', { enforceSSL: true });
    this.topic.addSubscription(new subscriptions.EmailSubscription(props.alertEmail));
    const notify = new actions.SnsAction(this.topic);

    new cloudwatch.Alarm(this, 'GapDlqAlarm', {
      alarmDescription: 'Gap, sitemap or draft jobs failed three times and are in the DLQ',
      metric: props.deadLetterQueue.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(notify);

    new cloudwatch.Alarm(this, 'RunFailedAlarm', {
      alarmDescription: 'A run state machine execution failed, timed out or was aborted',
      metric: new cloudwatch.MathExpression({
        expression: 'failed + timedOut + aborted',
        usingMetrics: {
          failed: props.stateMachine.metricFailed({ period: Duration.minutes(5) }),
          timedOut: props.stateMachine.metricTimedOut({ period: Duration.minutes(5) }),
          aborted: props.stateMachine.metricAborted({ period: Duration.minutes(5) }),
        },
        period: Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(notify);

    for (const [name, fn] of Object.entries(props.erroringFunctions)) {
      new cloudwatch.Alarm(this, `${name}ErrorsAlarm`, {
        alarmDescription: `${name} Lambda is throwing errors`,
        metric: fn.metricErrors({ period: Duration.minutes(5) }),
        threshold: 3,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(notify);
    }

    new budgets.CfnBudget(this, 'Budget', {
      budget: {
        budgetName: 'answershare-monthly',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: MONTHLY_BUDGET_USD, unit: 'USD' },
        costFilters: { TagKeyValue: ['user:project$answershare'] },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [{ subscriptionType: 'EMAIL', address: props.alertEmail }],
        },
        {
          notification: {
            notificationType: 'FORECASTED',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [{ subscriptionType: 'EMAIL', address: props.alertEmail }],
        },
      ],
    });

    this.digest = appFunction(this, 'Digest', {
      entry: 'src/digest/handler.ts',
      environment: {
        TABLE_NAME: props.table.tableName,
        USER_POOL_ID: props.userPool.userPoolId,
        SITE_URL: props.siteUrl,
        DIGEST_FROM: props.digestFrom,
        ALERT_EMAIL: props.alertEmail,
      },
      timeout: Duration.seconds(30),
    });
    props.table.grantReadData(this.digest);
    this.digest.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cognito-idp:ListUsers'],
        resources: [props.userPool.userPoolArn],
      }),
    );
    this.digest.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail'],
        resources: [
          `arn:${stack.partition}:ses:${stack.region}:${stack.account}:identity/${props.digestFrom}`,
        ],
      }),
    );
    new events.Rule(this, 'RunFinished', {
      description: 'Send the digest when a run finishes',
      eventPattern: {
        source: ['aws.states'],
        detailType: ['Step Functions Execution Status Change'],
        detail: { stateMachineArn: [props.stateMachine.stateMachineArn], status: ['SUCCEEDED'] },
      },
      targets: [new targets.LambdaFunction(this.digest, { retryAttempts: 2 })],
    });
  }
}
