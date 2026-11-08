import { App, Tags } from 'aws-cdk-lib';
import { AnswerShareStack } from '../lib/answershare-stack.js';

try {
  process.loadEnvFile('.env');
} catch {
  // Missing .env is reported below.
}
const alertEmail = process.env.ALERT_EMAIL;
if (!alertEmail) {
  throw new Error('Set ALERT_EMAIL in infra/.env (see infra/.env.example)');
}

const app = new App();
Tags.of(app).add('project', 'answershare');
new AnswerShareStack(app, 'AnswerShareStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
  alertEmail,
});
