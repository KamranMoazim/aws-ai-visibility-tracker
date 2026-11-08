import { readFileSync } from 'node:fs';

export interface StackOutputs {
  Region: string;
  TableName: string;
  RawBucketName: string;
}

export function loadOutputs(): StackOutputs {
  const path = new URL('../../infra/cdk-outputs.json', import.meta.url);
  const all = JSON.parse(readFileSync(path, 'utf8')) as Record<string, StackOutputs>;
  return all.AnswerShareStack;
}

export function fixture(path: string): unknown {
  return JSON.parse(readFileSync(new URL(`fixtures/${path}`, import.meta.url), 'utf8'));
}

let passed = 0;
let failed = 0;

export function check(name: string, ok: boolean, extra?: unknown): void {
  if (ok) {
    passed++;
  } else {
    failed++;
  }
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + JSON.stringify(extra)}`);
}

export function finish(): never {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
