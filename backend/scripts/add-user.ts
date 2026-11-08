import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import { createInterface } from 'node:readline/promises';
import { loadOutputs } from './outputs.js';

const outputs = loadOutputs();
const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes('@')) {
  console.error('usage: npm run add-user -- <email>');
  process.exit(1);
}

async function askPassword(): Promise<string> {
  if (process.env.ANSWERSHARE_PASSWORD) {
    return process.env.ANSWERSHARE_PASSWORD;
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const password = await prompt.question('Password (12+ characters): ');
  prompt.close();
  return password;
}

const cognito = new CognitoIdentityProviderClient({ region: outputs.Region });
const password = await askPassword();
if (password.length < 12) {
  console.error('password must be at least 12 characters');
  process.exit(1);
}
try {
  await cognito.send(
    new AdminCreateUserCommand({
      UserPoolId: outputs.UserPoolId,
      Username: email,
      MessageAction: 'SUPPRESS',
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
      ],
    }),
  );
  console.log(`created ${email}`);
} catch (error) {
  if (!(error instanceof UsernameExistsException)) {
    throw error;
  }
  console.log(`${email} exists; updating password`);
}
await cognito.send(
  new AdminSetUserPasswordCommand({
    UserPoolId: outputs.UserPoolId,
    Username: email,
    Password: password,
    Permanent: true,
  }),
);
console.log(`sign in at ${outputs.SiteUrl}`);
