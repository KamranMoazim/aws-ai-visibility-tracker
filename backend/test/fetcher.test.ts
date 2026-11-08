import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  fetchPage,
  FetchRefused,
  htmlToText,
  isPathAllowed,
  isPublicAddress,
  parseRobots,
  type FetchOptions,
} from '../src/core/fetcher.js';
import { check, finish } from './helpers.js';

for (const address of [
  '127.0.0.1',
  '10.1.2.3',
  '172.20.0.1',
  '192.168.1.1',
  '169.254.169.254',
  '100.64.0.1',
  '0.0.0.0',
  '::1',
  '::',
  'fe80::1',
  'fd00::1',
  '::ffff:127.0.0.1',
  '::ffff:169.254.169.254',
  '64:ff9b::a9fe:a9fe',
  'not-an-ip',
]) {
  check(`refuses ${address}`, !isPublicAddress(address));
}
for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
  check(`allows ${address}`, isPublicAddress(address));
}

async function refusal(url: string, options?: FetchOptions): Promise<string | undefined> {
  try {
    await fetchPage(url, options);
    return undefined;
  } catch (error) {
    return error instanceof FetchRefused ? error.reason : `other:${(error as Error).message}`;
  }
}

check('file scheme refused', (await refusal('file:///etc/passwd')) === 'scheme');
check('ftp scheme refused', (await refusal('ftp://example.com/')) === 'scheme');
check(
  'metadata ip refused',
  (await refusal('http://169.254.169.254/latest/meta-data/')) === 'private_address',
);
check('loopback refused', (await refusal('http://127.0.0.1/')) === 'private_address');
check('ipv6 loopback refused', (await refusal('http://[::1]/')) === 'private_address');
check('decimal ip form refused', (await refusal('http://2130706433/')) === 'private_address');
check('hex ip form refused', (await refusal('http://0x7f000001/')) === 'private_address');
check('localhost refused after dns', (await refusal('http://localhost/')) === 'private_address');
check('credentials refused', (await refusal('http://user:pass@example.com/')) === 'credentials');
check('odd port refused', (await refusal('http://example.com:22/')) === 'port');

const server = http.createServer((request, response) => {
  const path = request.url ?? '/';
  if (path === '/robots.txt') {
    response.end('User-agent: *\nDisallow: /private\n\nUser-agent: GPTBot\nDisallow: /\n');
  } else if (path === '/page') {
    response.setHeader('content-type', 'text/html');
    response.end(
      '<html><head><title>Fees &amp; FX</title><meta name="description" content="Compare fees">' +
        '<script>steal()</script></head><body><h1>Fee table</h1><p>Wise&nbsp;0.4%</p>' +
        '<a href="/guide">Guide</a></body></html>',
    );
  } else if (path === '/to-metadata') {
    response.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
    response.end();
  } else if (path === '/to-file') {
    response.writeHead(302, { location: 'file:///etc/passwd' });
    response.end();
  } else if (path.startsWith('/hop/')) {
    const hop = Number(path.split('/')[2]);
    response.writeHead(302, { location: hop >= 2 ? '/page' : `/hop/${hop + 1}` });
    response.end();
  } else if (path.startsWith('/loop/')) {
    const hop = Number(path.split('/')[2]);
    response.writeHead(302, { location: `/loop/${hop + 1}` });
    response.end();
  } else if (path === '/big') {
    response.write('x'.repeat(1024 * 1024));
    response.end('x'.repeat(1024 * 1024 + 10));
  } else if (path === '/big-declared') {
    response.writeHead(200, { 'content-length': String(5 * 1024 * 1024) });
    response.end();
  } else if (path === '/slow') {
    response.write('start');
    setTimeout(() => response.end('end'), 1500);
  } else if (path === '/private') {
    response.end('secret');
  } else {
    response.statusCode = 404;
    response.end('nope');
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = String((server.address() as AddressInfo).port);
const base = `http://127.0.0.1:${port}`;
const local: FetchOptions = {
  isAllowedAddress: (address) => address === '127.0.0.1',
  allowedPorts: ['', port],
};

try {
  check(
    'default options refuse the local server',
    (await refusal(`${base}/page`, { allowedPorts: [port] })) === 'private_address',
  );
  const page = await fetchPage(`${base}/page`, local);
  const text = htmlToText(page.body, page.url);
  check('page fetched', page.status === 200 && page.redirects.length === 0, page);
  check(
    'title and description decoded',
    text.title === 'Fees & FX' && text.description === 'Compare fees',
    text,
  );
  check(
    'scripts stripped from text',
    !text.text.includes('steal') && text.text.includes('Wise 0.4%'),
    text.text,
  );
  check('links resolved against the page', text.links.includes(`${base}/guide`), text.links);
  check(
    'redirect to metadata ip refused on the hop',
    (await refusal(`${base}/to-metadata`, local)) === 'private_address',
  );
  check('redirect to file scheme refused', (await refusal(`${base}/to-file`, local)) === 'scheme');
  const hopped = await fetchPage(`${base}/hop/0`, local);
  check(
    'three redirects allowed',
    hopped.redirects.length === 3 && hopped.status === 200,
    hopped.redirects,
  );
  check(
    'fourth redirect refused',
    (await refusal(`${base}/loop/0`, local)) === 'too_many_redirects',
  );
  check('oversize body refused', (await refusal(`${base}/big`, local)) === 'too_large');
  check(
    'oversize content-length refused',
    (await refusal(`${base}/big-declared`, local)) === 'too_large',
  );
  check(
    'slow page times out',
    (await refusal(`${base}/slow`, { ...local, timeoutMs: 300 })) === 'timeout',
  );
  check('robots disallow respected', (await refusal(`${base}/private`, local)) === 'robots');
  const ignored = await fetchPage(`${base}/private`, { ...local, respectRobots: false });
  check('robots can be skipped for own-site checks', ignored.body === 'secret');
} finally {
  server.close();
}

const robots =
  'User-agent: *\nDisallow: /admin\nAllow: /admin/public\n\nUser-agent: OAI-SearchBot\nDisallow: /\n';
const generic = parseRobots(robots, 'answersharebot');
check(
  'generic group used for unknown bots',
  !isPathAllowed(generic, '/admin/x') && isPathAllowed(generic, '/blog'),
);
check('longest match wins', isPathAllowed(generic, '/admin/public/page'));
check('specific group overrides', !isPathAllowed(parseRobots(robots, 'OAI-SearchBot'), '/blog'));
check('empty robots allows all', isPathAllowed(parseRobots('', 'x'), '/anything'));
check(
  'wildcards and end anchors',
  !isPathAllowed([{ allow: false, path: '/*.pdf$' }], '/files/a.pdf') &&
    isPathAllowed([{ allow: false, path: '/*.pdf$' }], '/files/a.pdf.html'),
);
finish();
