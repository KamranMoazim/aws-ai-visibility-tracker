import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { randomBytes } from 'node:crypto';
import { loadOutputs } from '../scripts/outputs.js';
import { DEMO_PROMPTS, DEMO_SETTINGS } from '../scripts/demo-data.js';
import { check, deletePartitions, finish } from './helpers.js';

const outputs = loadOutputs();
const { workspacePk } = await import('../src/core/keys.js');
const { putGap } = await import('../src/data/gaps.js');
const { TABLE_NAME } = await import('../src/core/table.js');
const cognito = new CognitoIdentityProviderClient({ region: outputs.Region });

const email = `publish-test-${randomBytes(4).toString('hex')}@example.com`;
const password = `Pw-${randomBytes(12).toString('hex')}`;
await cognito.send(
  new AdminCreateUserCommand({
    UserPoolId: outputs.UserPoolId,
    Username: email,
    MessageAction: 'SUPPRESS',
    UserAttributes: [{ Name: 'email', Value: email }],
  }),
);
await cognito.send(
  new AdminSetUserPasswordCommand({
    UserPoolId: outputs.UserPoolId,
    Username: email,
    Password: password,
    Permanent: true,
  }),
);
const token = (
  await cognito.send(
    new InitiateAuthCommand({
      ClientId: outputs.UserPoolClientId,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }),
  )
).AuthenticationResult!.IdToken!;

async function call(method: string, path: string, body?: unknown) {
  const response = await fetch(outputs.ApiUrl + path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: (await response.json().catch(() => ({}))) as any };
}

async function eventually<T>(
  probe: () => Promise<T | undefined>,
  attempts = 40,
  delayMs = 3000,
): Promise<T | undefined> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const value = await probe();
    if (value !== undefined) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return undefined;
}

let workspaceId = '';
let postId = '';
try {
  const created = await call('POST', '/workspaces', {
    ...DEMO_SETTINGS,
    name: `Publish test ${randomBytes(2).toString('hex')}`,
    engines: ['fake'],
    samples: 1,
    schedule: 'off',
    digest: false,
    competitors: [],
  });
  workspaceId = created.body.workspace.workspaceId;
  const prompt = (await call('POST', `/workspaces/${workspaceId}/prompts`, DEMO_PROMPTS[0])).body
    .prompt;
  const now = new Date().toISOString();
  await putGap({
    gapId: prompt.promptId,
    workspaceId,
    promptId: prompt.promptId,
    promptText: prompt.text,
    stage: prompt.stage,
    status: 'open',
    score: 2,
    missingEngines: ['openai'],
    missingRate: 1,
    neverCited: true,
    brief: {
      sourcesCover: ['A fee table for several providers'],
      missingPoints: ['No page compares FX fees and payout times'],
      action: 'new',
      pageType: 'comparison guide',
      title: 'How to invoice international clients without losing money on FX',
      outline: [
        { heading: 'What international invoicing costs', points: ['FX margin', 'transfer fees'] },
        { heading: 'How long payouts take', points: ['by currency'] },
      ],
      questions: ["What's the easiest way to invoice international clients?"],
      facts: ['Our FX margin: [fill in]', 'Currencies supported: [fill in]'],
      phrases: ['lowest fees', 'multi-currency'],
    },
    createdAt: now,
    updatedAt: now,
  });

  const drafted = await call('POST', `/workspaces/${workspaceId}/gaps/${prompt.promptId}/draft`);
  postId = drafted.body.postId;
  check('draft requested', drafted.status === 202 && Boolean(postId), drafted.body);
  const post = await eventually(async () => {
    const response = await call('GET', `/workspaces/${workspaceId}/posts/${postId}`);
    return response.body.post?.status === 'draft' || response.body.post?.status === 'failed'
      ? response.body
      : undefined;
  });
  check(
    'draft generated',
    post?.post.status === 'draft' && post.post.markdown.length > 200,
    post?.post?.status,
  );
  const gap = await call('GET', `/workspaces/${workspaceId}/gaps/${prompt.promptId}`);
  check('gap marked drafted', gap.body.gap.status === 'drafted');

  const withPlaceholder = {
    title: post.post.title,
    slug: `test-guide-${randomBytes(3).toString('hex')}`,
    description: post.post.description,
    markdown: `${post.post.markdown}\n\nOur FX margin is [fill in].`,
    faq: post.post.faq,
  };
  await call('PUT', `/workspaces/${workspaceId}/posts/${postId}`, withPlaceholder);
  const blocked = await call('POST', `/workspaces/${workspaceId}/posts/${postId}/publish`, {
    target: 'hosted',
  });
  check(
    'publishing blocked while placeholders remain',
    blocked.status === 400 && blocked.body.error === 'placeholders',
    blocked.body,
  );

  const clean = (text: string) => text.replace(/\[fill in[^\]]*\]/gi, '0.5%');
  const edited = await call('PUT', `/workspaces/${workspaceId}/posts/${postId}`, {
    ...withPlaceholder,
    title: clean(withPlaceholder.title),
    description: clean(withPlaceholder.description),
    markdown: clean(withPlaceholder.markdown),
    faq: withPlaceholder.faq.map((pair: { question: string; answer: string }) => ({
      question: clean(pair.question),
      answer: clean(pair.answer),
    })),
  });
  check(
    'edited post has no placeholders',
    edited.status === 200 && edited.body.placeholders.length === 0,
    edited.body,
  );

  const crawler = await call('GET', `/workspaces/${workspaceId}/crawler-check?target=hosted`);
  check(
    'crawler check runs',
    crawler.status === 200 && crawler.body.crawlers.length === 3,
    crawler.body,
  );

  const published = await call('POST', `/workspaces/${workspaceId}/posts/${postId}/publish`, {
    target: 'hosted',
  });
  check(
    'published to the hosted site',
    published.status === 200 && published.body.url?.includes('/guides/'),
    published.body,
  );
  const url = published.body.url as string;
  const page = await eventually(
    async () => {
      const response = await fetch(url);
      const text = await response.text();
      return response.status === 200 && text.includes('application/ld+json')
        ? { text, csp: response.headers.get('content-security-policy') ?? '' }
        : undefined;
    },
    20,
    3000,
  );
  check('guide served by cloudfront', Boolean(page), url);
  const jsonLd = [
    ...(page?.text ?? '').matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
  ].map((match) => JSON.parse(match[1]));
  check('guide has valid article json-ld', jsonLd[0]?.['@type'] === 'Article', jsonLd);
  check(
    'guide csp blocks scripts',
    page?.csp.includes("default-src 'none'") === true && !page?.csp.includes('script-src'),
    page?.csp,
  );
  const sitemap = await (await fetch(`${outputs.SiteUrl}/sitemap.xml`)).text();
  check('sitemap lists the guide', sitemap.includes(url), sitemap.slice(0, 300));
  const llms = await (await fetch(`${outputs.SiteUrl}/llms.txt`)).text();
  check('llms.txt lists the guide', llms.includes(url), llms.slice(0, 300));

  const trend = await call('GET', `/workspaces/${workspaceId}/prompts/${prompt.promptId}/trend`);
  check(
    'prompt trend carries the publish link',
    trend.body.links?.[0]?.postId === postId,
    trend.body,
  );
  const visibility = await call('GET', `/workspaces/${workspaceId}/visibility?engine=*`);
  check(
    'dashboard gets a publish marker',
    visibility.body.markers?.some((marker: any) => marker.postId === postId),
    visibility.body.markers,
  );

  const unpublished = await call('POST', `/workspaces/${workspaceId}/posts/${postId}/unpublish`);
  check('unpublished', unpublished.status === 200, unpublished.body);
  const gone = await eventually(
    async () => {
      const text = await (await fetch(`${url}?check=${Date.now()}`)).text();
      return text.includes('application/ld+json') ? undefined : true;
    },
    20,
    3000,
  );
  check('guide removed from the site', gone === true);
  const sitemapCleared = await eventually(
    async () => {
      const text = await (await fetch(`${outputs.SiteUrl}/sitemap.xml?check=${Date.now()}`)).text();
      return text.includes(url) ? undefined : true;
    },
    20,
    3000,
  );
  check('sitemap no longer lists it', sitemapCleared === true);
} finally {
  if (workspaceId) {
    await deletePartitions(outputs.Region, TABLE_NAME, [workspacePk(workspaceId)]);
  }
  await cognito.send(
    new AdminDeleteUserCommand({ UserPoolId: outputs.UserPoolId, Username: email }),
  );
}
finish();
