import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import zlib from 'node:zlib';

export const USER_AGENT =
  'AnswerShareBot/1.0 (+reads pages cited by AI answers; respects robots.txt)';
export const ROBOTS_AGENT = 'answersharebot';
export const MAX_BYTES = 2 * 1024 * 1024;
export const TIMEOUT_MS = 10_000;
export const MAX_REDIRECTS = 3;
const DEFAULT_PORTS = ['', '80', '443'];
const ROBOTS_CACHE_MS = 60 * 60 * 1000;

export type RefusalReason =
  | 'scheme'
  | 'credentials'
  | 'port'
  | 'private_address'
  | 'too_many_redirects'
  | 'too_large'
  | 'timeout'
  | 'robots';

export class FetchRefused extends Error {
  constructor(
    public reason: RefusalReason,
    message: string,
  ) {
    super(`${reason}: ${message}`);
    this.name = 'FetchRefused';
  }
}

const blocked = new net.BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv6');
}

export function isPublicAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '').toLowerCase();
  const family = net.isIP(ip);
  if (family === 4) {
    return !blocked.check(ip, 'ipv4');
  }
  if (family !== 6) {
    return false;
  }
  const embedded = ip.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (embedded) {
    return isPublicAddress(embedded);
  }
  if (/^(::ffff:|64:ff9b::)/.test(ip)) {
    return false;
  }
  return !blocked.check(ip, 'ipv6');
}

export interface FetchOptions {
  isAllowedAddress?: (address: string) => boolean;
  allowedPorts?: string[];
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  respectRobots?: boolean;
}

export interface FetchedPage {
  url: string;
  status: number;
  contentType: string;
  body: string;
  redirects: string[];
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number,
) => void;

function guardedLookup(isAllowed: (address: string) => boolean) {
  return (hostname: string, options: dns.LookupOptions, callback: LookupCallback) => {
    dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) {
        callback(error, '');
        return;
      }
      const refused = addresses.find((entry) => !isAllowed(entry.address));
      if (refused || !addresses.length) {
        callback(
          new FetchRefused(
            'private_address',
            `${hostname} resolves to ${refused?.address ?? 'nothing'}`,
          ),
          '',
        );
        return;
      }
      if (options.all) {
        callback(null, addresses);
      } else {
        callback(null, addresses[0].address, addresses[0].family);
      }
    });
  };
}

function checkUrl(url: URL, options: Required<FetchOptions>): void {
  const isAllowed = options.isAllowedAddress;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FetchRefused('scheme', url.protocol);
  }
  if (url.username || url.password) {
    throw new FetchRefused('credentials', 'urls with credentials are not fetched');
  }
  if (!options.allowedPorts.includes(url.port)) {
    throw new FetchRefused('port', url.port);
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && !isAllowed(host)) {
    throw new FetchRefused('private_address', host);
  }
}

interface RawResponse {
  status: number;
  location?: string;
  contentType: string;
  body: string;
}

interface RequestInit {
  method: string;
  headers?: Record<string, string>;
  body?: string;
}

function requestOnce(
  url: URL,
  options: Required<FetchOptions>,
  init: RequestInit = { method: 'GET' },
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    let settled = false;
    const finish = (error: Error | null, value?: RawResponse) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (error) {
        request.destroy();
        reject(error);
      } else {
        resolve(value!);
      }
    };
    const request = client.request(
      url,
      {
        method: init.method,
        agent: false,
        lookup: guardedLookup(options.isAllowedAddress) as never,
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.5',
          'accept-encoding': 'gzip, deflate, br',
          ...(init.body !== undefined
            ? { 'content-length': String(Buffer.byteLength(init.body)) }
            : {}),
          ...init.headers,
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          finish(null, { status, location: response.headers.location, contentType: '', body: '' });
          return;
        }
        const declared = Number(response.headers['content-length'] ?? 0);
        if (declared > options.maxBytes) {
          finish(new FetchRefused('too_large', `${declared} bytes`));
          return;
        }
        const encoding = String(response.headers['content-encoding'] ?? '').toLowerCase();
        const stream =
          encoding === 'gzip'
            ? response.pipe(zlib.createGunzip())
            : encoding === 'deflate'
              ? response.pipe(zlib.createInflate())
              : encoding === 'br'
                ? response.pipe(zlib.createBrotliDecompress())
                : response;
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) {
            finish(new FetchRefused('too_large', `over ${options.maxBytes} bytes`));
            return;
          }
          chunks.push(chunk);
        });
        stream.on('end', () =>
          finish(null, {
            status,
            contentType: String(response.headers['content-type'] ?? ''),
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
        stream.on('error', (error) => finish(error));
      },
    );
    const timer = setTimeout(
      () => finish(new FetchRefused('timeout', `no complete response in ${options.timeoutMs} ms`)),
      options.timeoutMs,
    );
    request.on('error', (error) => finish(error));
    request.end(init.body);
  });
}

async function followRedirects(
  start: string,
  options: Required<FetchOptions>,
  robotsCheck: boolean,
): Promise<FetchedPage> {
  const redirects: string[] = [];
  let current = new URL(start);
  for (;;) {
    checkUrl(current, options);
    if (robotsCheck && options.respectRobots && !(await allowedByRobots(current, options))) {
      throw new FetchRefused('robots', current.toString());
    }
    const response = await requestOnce(current, options);
    if (response.location) {
      if (redirects.length >= options.maxRedirects) {
        throw new FetchRefused('too_many_redirects', `more than ${options.maxRedirects}`);
      }
      redirects.push(current.toString());
      current = new URL(response.location, current);
      continue;
    }
    return {
      url: current.toString(),
      status: response.status,
      contentType: response.contentType,
      body: response.body,
      redirects,
    };
  }
}

const withDefaults = (options: FetchOptions = {}): Required<FetchOptions> => ({
  isAllowedAddress: options.isAllowedAddress ?? isPublicAddress,
  allowedPorts: options.allowedPorts ?? DEFAULT_PORTS,
  maxBytes: options.maxBytes ?? MAX_BYTES,
  timeoutMs: options.timeoutMs ?? TIMEOUT_MS,
  maxRedirects: options.maxRedirects ?? MAX_REDIRECTS,
  respectRobots: options.respectRobots ?? true,
});

export function fetchPage(url: string, options?: FetchOptions): Promise<FetchedPage> {
  return followRedirects(url, withDefaults(options), true);
}

export interface JsonResponse {
  status: number;
  body: unknown;
}

export async function sendJson(
  url: string,
  method: 'POST' | 'PUT' | 'DELETE',
  headers: Record<string, string>,
  payload: unknown,
  options?: FetchOptions,
): Promise<JsonResponse> {
  const settings = withDefaults(options);
  const target = new URL(url);
  checkUrl(target, settings);
  if (target.protocol !== 'https:') {
    throw new FetchRefused('scheme', 'credentials are only sent over https');
  }
  const response = await requestOnce(target, settings, {
    method,
    headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  let body: unknown = response.body;
  try {
    body = JSON.parse(response.body);
  } catch {
    body = response.body;
  }
  return { status: response.status, body };
}

export interface RobotsRule {
  allow: boolean;
  path: string;
}

export function parseRobots(text: string, agent: string): RobotsRule[] {
  const groups: { agents: string[]; rules: RobotsRule[] }[] = [];
  let current: { agents: string[]; rules: RobotsRule[] } | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const separator = line.indexOf(':');
    if (separator < 0) {
      continue;
    }
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === 'user-agent') {
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if ((field === 'allow' || field === 'disallow') && current) {
      if (value) {
        current.rules.push({ allow: field === 'allow', path: value });
      }
    }
  }
  const wanted = agent.toLowerCase();
  const specific = groups.filter((group) =>
    group.agents.some((name) => name !== '*' && wanted.includes(name)),
  );
  const chosen = specific.length ? specific : groups.filter((group) => group.agents.includes('*'));
  return chosen.flatMap((group) => group.rules);
}

function ruleMatches(rule: string, path: string): boolean {
  const anchored = rule.endsWith('$');
  const pattern = (anchored ? rule.slice(0, -1) : rule)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${pattern}${anchored ? '$' : ''}`).test(path);
}

export function isPathAllowed(rules: RobotsRule[], path: string): boolean {
  let best: RobotsRule | undefined;
  for (const rule of rules) {
    if (!ruleMatches(rule.path, path)) {
      continue;
    }
    if (
      !best ||
      rule.path.length > best.path.length ||
      (rule.path.length === best.path.length && rule.allow)
    ) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

const robotsCache = new Map<string, { at: number; text: string | undefined }>();

export async function fetchRobots(
  origin: string,
  options?: FetchOptions,
): Promise<string | undefined> {
  const cached = robotsCache.get(origin);
  if (cached && Date.now() - cached.at < ROBOTS_CACHE_MS) {
    return cached.text;
  }
  let text: string | undefined;
  try {
    const response = await followRedirects(`${origin}/robots.txt`, withDefaults(options), false);
    text = response.status >= 200 && response.status < 300 ? response.body : undefined;
  } catch (error) {
    if (error instanceof FetchRefused && error.reason === 'private_address') {
      throw error;
    }
    text = undefined;
  }
  robotsCache.set(origin, { at: Date.now(), text });
  return text;
}

async function allowedByRobots(url: URL, options: Required<FetchOptions>): Promise<boolean> {
  if (url.pathname === '/robots.txt') {
    return true;
  }
  const text = await fetchRobots(url.origin, options);
  return (
    text === undefined || isPathAllowed(parseRobots(text, ROBOTS_AGENT), url.pathname + url.search)
  );
}

export interface PageText {
  title: string;
  description: string;
  text: string;
  links: string[];
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1].toLowerCase() === 'x'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : ' ';
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export const MAX_TEXT_CHARS = 100_000;

export function htmlToText(html: string, baseUrl?: string): PageText {
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim();
  const description = decodeEntities(
    html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i)?.[1] ??
      '',
  ).trim();
  const links: string[] = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    try {
      const link = new URL(decodeEntities(match[1]), baseUrl).toString();
      if (/^https?:/.test(link) && !links.includes(link)) {
        links.push(link);
      }
    } catch {
      continue;
    }
  }
  const text = decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .slice(0, MAX_TEXT_CHARS);
  return { title, description, text, links: links.slice(0, 500) };
}
