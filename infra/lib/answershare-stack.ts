import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { Gaps } from './gaps.js';
import { Mcp } from './mcp.js';
import { Monitoring } from './monitoring.js';
import { Publish } from './publish.js';
import { Run } from './run.js';
import { Storage } from './storage.js';
import { Web } from './web.js';

export interface AnswerShareStackProps extends StackProps {
  alertEmail: string;
  digestFrom: string;
  maxCallsPerRun: number;
  openAiModel: string;
  clientDistPath: string;
  siteName: string;
}

export class AnswerShareStack extends Stack {
  readonly storage: Storage;
  readonly gaps: Gaps;
  readonly run: Run;
  readonly web: Web;
  readonly publish: Publish;
  readonly monitoring: Monitoring;
  readonly mcp: Mcp;

  constructor(scope: Construct, id: string, props: AnswerShareStackProps) {
    super(scope, id, props);

    this.storage = new Storage(this, 'Storage');
    this.gaps = new Gaps(this, 'Gaps', {
      table: this.storage.table,
      rawBucket: this.storage.rawBucket,
    });
    this.run = new Run(this, 'Run', {
      table: this.storage.table,
      rawBucket: this.storage.rawBucket,
      gapQueue: this.gaps.queue,
      maxCallsPerRun: props.maxCallsPerRun,
      openAiModel: props.openAiModel,
    });
    this.web = new Web(this, 'Web', {
      table: this.storage.table,
      run: this.run,
      gapQueue: this.gaps.queue,
      clientDistPath: props.clientDistPath,
    });
    this.publish = new Publish(this, 'Publish', {
      table: this.storage.table,
      rawBucket: this.storage.rawBucket,
      siteBucket: this.web.siteBucket,
      distribution: this.web.distribution,
      siteName: props.siteName,
    });
    this.publish.publisher.grantInvoke(this.web.api);
    this.web.api.addEnvironment('PUBLISH_FUNCTION_NAME', this.publish.publisher.functionName);
    const siteUrl = `https://${this.web.distribution.distributionDomainName}`;
    this.web.api.addEnvironment('SITE_URL', siteUrl);
    this.mcp = new Mcp(this, 'Mcp', {
      table: this.storage.table,
      gapQueue: this.gaps.queue,
      userPool: this.web.userPool,
      siteUrl,
    });
    this.monitoring = new Monitoring(this, 'Monitoring', {
      alertEmail: props.alertEmail,
      digestFrom: props.digestFrom,
      siteUrl,
      table: this.storage.table,
      userPool: this.web.userPool,
      stateMachine: this.run.stateMachine,
      deadLetterQueue: this.gaps.deadLetterQueue,
      erroringFunctions: {
        Api: this.web.api,
        Publisher: this.publish.publisher,
        McpTools: this.mcp.tools,
      },
    });

    new CfnOutput(this, 'Region', { value: this.region });
    new CfnOutput(this, 'TableName', { value: this.storage.table.tableName });
    new CfnOutput(this, 'RawBucketName', { value: this.storage.rawBucket.bucketName });
    new CfnOutput(this, 'StateMachineArn', { value: this.run.stateMachine.stateMachineArn });
    new CfnOutput(this, 'SchedulerRoleArn', { value: this.run.schedulerRole.roleArn });
    new CfnOutput(this, 'AskFunctionName', { value: this.run.ask.functionName });
    new CfnOutput(this, 'StartRunFunctionName', { value: this.run.startRun.functionName });
    new CfnOutput(this, 'GapQueueUrl', { value: this.gaps.queue.queueUrl });
    new CfnOutput(this, 'GapDlqUrl', { value: this.gaps.deadLetterQueue.queueUrl });
    new CfnOutput(this, 'GapWorkerFunctionName', { value: this.gaps.worker.functionName });
    new CfnOutput(this, 'PublishFunctionName', { value: this.publish.publisher.functionName });
    new CfnOutput(this, 'AlertTopicArn', { value: this.monitoring.topic.topicArn });
    new CfnOutput(this, 'DigestFunctionName', { value: this.monitoring.digest.functionName });
    new CfnOutput(this, 'GatewayUrl', { value: this.mcp.gateway.attrGatewayUrl });
    new CfnOutput(this, 'McpClientId', { value: this.mcp.mcpClient.userPoolClientId });
    new CfnOutput(this, 'CognitoDomain', { value: this.mcp.domain.baseUrl() });
    new CfnOutput(this, 'McpToolsFunctionName', { value: this.mcp.tools.functionName });
    new CfnOutput(this, 'UserPoolId', { value: this.web.userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: this.web.userPoolClient.userPoolClientId });
    new CfnOutput(this, 'ApiUrl', { value: this.web.httpApi.apiEndpoint });
    new CfnOutput(this, 'ApiFunctionName', { value: this.web.api.functionName });
    new CfnOutput(this, 'SiteBucketName', { value: this.web.siteBucket.bucketName });
    new CfnOutput(this, 'SiteUrl', {
      value: `https://${this.web.distribution.distributionDomainName}`,
    });
  }
}
