import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import { grantNovaInvoke } from './bedrock.js';
import { appFunction, logGroup } from './function.js';
import type { Run } from './run.js';
import { SCHEDULE_GROUP } from './run.js';

export const LOCAL_ORIGIN = 'http://localhost:5173';
export const GUIDES_PREFIX = 'guides/';

export interface WebProps {
  table: dynamodb.ITableV2;
  run: Run;
  clientDistPath: string;
}

export class Web extends Construct {
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
  readonly api: NodejsFunction;
  readonly httpApi: apigwv2.HttpApi;
  readonly siteBucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: WebProps) {
    super(scope, id);
    const stack = Stack.of(this);

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'answershare-users',
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      passwordPolicy: { minLength: 12 },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    this.userPoolClient = this.userPool.addClient('WebClient', {
      authFlows: { userPassword: true },
      generateSecret: false,
      preventUserExistenceErrors: true,
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
    });

    this.siteBucket = new s3.Bucket(this, 'SiteBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    this.api = appFunction(this, 'Api', {
      entry: 'src/api/lambda.ts',
      environment: {
        TABLE_NAME: props.table.tableName,
        STATE_MACHINE_ARN: props.run.stateMachine.stateMachineArn,
        SCHEDULER_ROLE_ARN: props.run.schedulerRole.roleArn,
        USER_POOL_ID: this.userPool.userPoolId,
        USER_POOL_CLIENT_ID: this.userPoolClient.userPoolClientId,
      },
      timeout: Duration.seconds(29),
      memorySize: 512,
    });
    props.table.grantReadWriteData(this.api);
    props.run.stateMachine.grantStartExecution(this.api);
    grantNovaInvoke(this, this.api);
    this.api.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'scheduler:CreateSchedule',
          'scheduler:UpdateSchedule',
          'scheduler:DeleteSchedule',
        ],
        resources: [
          `arn:${stack.partition}:scheduler:${stack.region}:${stack.account}:schedule/${SCHEDULE_GROUP}/*`,
        ],
      }),
    );
    props.run.schedulerRole.grantPassRole(this.api.grantPrincipal);

    const headers = new cloudfront.ResponseHeadersPolicy(this, 'SiteHeaders', {
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          contentSecurityPolicy: [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self'",
            "img-src 'self' data:",
            `connect-src 'self' https://cognito-idp.${stack.region}.amazonaws.com https://*.execute-api.${stack.region}.amazonaws.com`,
            "frame-ancestors 'none'",
            "base-uri 'none'",
            "form-action 'self'",
          ].join('; '),
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          override: true,
        },
      },
    });
    const spaFallback = (httpStatus: number): cloudfront.ErrorResponse => ({
      httpStatus,
      responseHttpStatus: 200,
      responsePagePath: '/index.html',
      ttl: Duration.seconds(0),
    });
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: headers,
      },
      defaultRootObject: 'index.html',
      errorResponses: [spaFallback(403), spaFallback(404)],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: 'answershare-api',
      corsPreflight: {
        allowOrigins: [LOCAL_ORIGIN, `https://${this.distribution.distributionDomainName}`],
        allowHeaders: ['authorization', 'content-type'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.DELETE,
        ],
        maxAge: Duration.hours(1),
      },
    });
    const integration = new HttpLambdaIntegration('ApiIntegration', this.api);
    const authorizer = new HttpJwtAuthorizer(
      'CognitoAuthorizer',
      `https://cognito-idp.${stack.region}.amazonaws.com/${this.userPool.userPoolId}`,
      { jwtAudience: [this.userPoolClient.userPoolClientId] },
    );
    this.httpApi.addRoutes({ path: '/health', methods: [apigwv2.HttpMethod.GET], integration });
    this.httpApi.addRoutes({
      path: '/{proxy+}',
      // ANY would route OPTIONS through the authorizer and break CORS preflight.
      methods: [
        apigwv2.HttpMethod.GET,
        apigwv2.HttpMethod.POST,
        apigwv2.HttpMethod.PUT,
        apigwv2.HttpMethod.DELETE,
      ],
      integration,
      authorizer,
    });

    new s3deploy.BucketDeployment(this, 'SiteDeployment', {
      destinationBucket: this.siteBucket,
      sources: [
        s3deploy.Source.asset(props.clientDistPath),
        s3deploy.Source.jsonData('config.json', {
          region: stack.region,
          apiUrl: this.httpApi.apiEndpoint,
          userPoolId: this.userPool.userPoolId,
          userPoolClientId: this.userPoolClient.userPoolClientId,
        }),
      ],
      exclude: [`${GUIDES_PREFIX}*`],
      distribution: this.distribution,
      distributionPaths: ['/*'],
      logGroup: logGroup(this, 'SiteDeploymentLogs'),
    });
  }
}
