import { Duration, Stack } from 'aws-cdk-lib';
import * as agentcore from 'aws-cdk-lib/aws-bedrockagentcore';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { readFileSync } from 'node:fs';
import { appFunction, backendPath } from './function.js';

export interface McpProps {
  table: dynamodb.ITableV2;
  gapQueue: sqs.IQueue;
  userPool: cognito.UserPool;
  siteUrl: string;
}

export const TARGET_NAME = 'answershare';
export const RESOURCE_SERVER = 'answershare';
const GATEWAY_NAME = 'answershare';
export const MCP_CALLBACK_URL = 'http://localhost:8976/callback';
export const SCOPE_TOOLS: Record<string, string[]> = {
  read: ['list_workspaces', 'get_visibility', 'list_gaps', 'get_gap'],
  draft: ['draft_from_gap'],
};

export class Mcp extends Construct {
  readonly gateway: agentcore.CfnGateway;
  readonly mcpClient: cognito.UserPoolClient;
  readonly domain: cognito.UserPoolDomain;
  readonly tools: NodejsFunction;

  constructor(scope: Construct, id: string, props: McpProps) {
    super(scope, id);
    const stack = Stack.of(this);

    const scopes = Object.keys(SCOPE_TOOLS).map(
      (scopeName) =>
        new cognito.ResourceServerScope({
          scopeName,
          scopeDescription: `${scopeName} AnswerShare data through MCP`,
        }),
    );
    const resourceServer = props.userPool.addResourceServer('ResourceServer', {
      identifier: RESOURCE_SERVER,
      scopes,
    });
    this.domain = props.userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: `answershare-${stack.account}` },
    });
    this.mcpClient = props.userPool.addClient('McpClient', {
      userPoolClientName: 'answershare-mcp',
      generateSecret: false,
      authFlows: {},
      preventUserExistenceErrors: true,
      accessTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      oAuth: {
        flows: { authorizationCodeGrant: true },
        callbackUrls: [MCP_CALLBACK_URL],
        scopes: scopes.map((resourceScope) =>
          cognito.OAuthScope.resourceServer(resourceServer, resourceScope),
        ),
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
    });

    this.tools = appFunction(this, 'Tools', {
      entry: 'src/mcp-tools/handler.ts',
      environment: {
        TABLE_NAME: props.table.tableName,
        GAP_QUEUE_URL: props.gapQueue.queueUrl,
        SITE_URL: props.siteUrl,
      },
      timeout: Duration.seconds(30),
      memorySize: 512,
    });
    props.table.grantReadWriteData(this.tools);
    props.gapQueue.grantSendMessages(this.tools);

    const interceptor = appFunction(this, 'Interceptor', {
      entry: 'src/mcp-interceptor/handler.ts',
      environment: {
        USER_POOL_ID: props.userPool.userPoolId,
        MCP_CLIENT_ID: this.mcpClient.userPoolClientId,
      },
    });

    const policyEngine = new agentcore.CfnPolicyEngine(this, 'PolicyEngine', {
      name: 'answershare_policies',
      description: 'Scope-based permits for AnswerShare tools; anything not permitted is denied',
    });
    const gatewayRole = new iam.Role(this, 'GatewayRole', {
      assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com', {
        conditions: { StringEquals: { 'aws:SourceAccount': stack.account } },
      }),
    });
    this.tools.grantInvoke(gatewayRole);
    interceptor.grantInvoke(gatewayRole);
    gatewayRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'bedrock-agentcore:AuthorizeAction',
          'bedrock-agentcore:PartiallyAuthorizeActions',
          'bedrock-agentcore:GetPolicyEngine',
        ],
        resources: [
          policyEngine.attrPolicyEngineArn,
          `${policyEngine.attrPolicyEngineArn}/*`,
          stack.formatArn({
            service: 'bedrock-agentcore',
            resource: 'gateway',
            resourceName: `${GATEWAY_NAME}-*`,
          }),
        ],
      }),
    );

    this.gateway = new agentcore.CfnGateway(this, 'Gateway', {
      name: GATEWAY_NAME,
      description: 'AnswerShare visibility and gap tools',
      protocolType: 'MCP',
      roleArn: gatewayRole.roleArn,
      authorizerType: 'CUSTOM_JWT',
      authorizerConfiguration: {
        customJwtAuthorizer: {
          discoveryUrl: `https://cognito-idp.${stack.region}.amazonaws.com/${props.userPool.userPoolId}/.well-known/openid-configuration`,
          allowedClients: [this.mcpClient.userPoolClientId],
        },
      },
      interceptorConfigurations: [
        {
          interceptor: { lambda: { arn: interceptor.functionArn } },
          interceptionPoints: ['REQUEST'],
          inputConfiguration: { passRequestHeaders: true },
        },
      ],
      policyEngineConfiguration: { arn: policyEngine.attrPolicyEngineArn, mode: 'ENFORCE' },
    });
    this.gateway.node.addDependency(gatewayRole);

    const toolSchema = JSON.parse(
      readFileSync(backendPath('src/mcp-tools/tool-schema.json'), 'utf8'),
    );
    const target = new agentcore.CfnGatewayTarget(this, 'Target', {
      name: TARGET_NAME,
      gatewayIdentifier: this.gateway.attrGatewayIdentifier,
      targetConfiguration: {
        mcp: {
          lambda: {
            lambdaArn: this.tools.functionArn,
            toolSchema: { inlinePayload: gatewayToolSchema(toolSchema) },
          },
        },
      },
      credentialProviderConfigurations: [{ credentialProviderType: 'GATEWAY_IAM_ROLE' }],
    });

    for (const [scopeName, tools] of Object.entries(SCOPE_TOOLS)) {
      const actions = tools
        .map((tool) => `AgentCore::Action::"${TARGET_NAME}___${tool}"`)
        .join(', ');
      const policy = new agentcore.CfnPolicy(this, `Permit${scopeName}`, {
        policyEngineId: policyEngine.attrPolicyEngineId,
        name: `permit_${scopeName}`,
        description: `Tools that need the ${RESOURCE_SERVER}/${scopeName} scope`,
        definition: {
          cedar: {
            statement: [
              'permit(principal is AgentCore::OAuthUser,',
              `  action in [${actions}],`,
              `  resource == AgentCore::Gateway::"${this.gateway.attrGatewayArn}")`,
              `when { principal.hasTag("scope") && principal.getTag("scope") like "*${RESOURCE_SERVER}/${scopeName}*" };`,
            ].join('\n'),
          },
        },
      });
      policy.node.addDependency(target);
    }
  }
}

function gatewayToolSchema(
  tools: Record<string, unknown>[],
): agentcore.CfnGatewayTarget.ToolDefinitionProperty[] {
  const convert = (
    schema: Record<string, unknown>,
  ): agentcore.CfnGatewayTarget.SchemaDefinitionProperty => ({
    type: schema.type as string,
    ...(schema.description ? { description: schema.description as string } : {}),
    ...(schema.required ? { required: schema.required as string[] } : {}),
    ...(schema.items ? { items: convert(schema.items as Record<string, unknown>) } : {}),
    ...(schema.properties
      ? {
          properties: Object.fromEntries(
            Object.entries(schema.properties as Record<string, Record<string, unknown>>).map(
              ([name, property]) => [name, convert(property)],
            ),
          ),
        }
      : {}),
  });
  return tools.map((tool) => ({
    name: tool.name as string,
    description: tool.description as string,
    inputSchema: convert(tool.inputSchema as Record<string, unknown>),
  }));
}
