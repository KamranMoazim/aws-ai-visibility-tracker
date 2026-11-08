import { App, Tags } from 'aws-cdk-lib';
import { fileURLToPath } from 'node:url';
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

const maxCallsPerRun = Number(process.env.MAX_CALLS_PER_RUN ?? 300);
if (!Number.isInteger(maxCallsPerRun) || maxCallsPerRun < 1) {
  throw new Error('MAX_CALLS_PER_RUN in infra/.env must be a positive integer');
}

const app = new App();
Tags.of(app).add('project', 'answershare');
new AnswerShareStack(app, 'AnswerShareStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
  alertEmail,
  maxCallsPerRun,
  openAiModel: process.env.OPENAI_MODEL || 'gpt-5-mini',
  clientDistPath: fileURLToPath(new URL('../../client/dist', import.meta.url)),
  siteName: process.env.GUIDES_SITE_NAME || 'Guides',
});
