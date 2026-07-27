import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatDateOnly } from '../utils/dateOnly';

const helperUrl = pathToFileURL(resolve(process.cwd(), 'src/utils/dateOnly.js')).href;

function formatInTimeZone(timeZone, value = '2026-07-22') {
  const script = [
    `import { formatDateOnly } from ${JSON.stringify(helperUrl)};`,
    `process.stdout.write(formatDateOnly(${JSON.stringify(value)}));`,
  ].join('\n');

  return execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
    encoding: 'utf8',
    env: { ...process.env, TZ: timeZone },
  });
}

describe('formatDateOnly', () => {
  it.each([
    'America/Chicago',
    'America/Los_Angeles',
    'UTC',
  ])('keeps a calendar date stable in %s', timeZone => {
    expect(formatInTimeZone(timeZone)).toBe('Jul 22, 2026');
  });

  it('rejects missing, malformed, impossible, and timestamp values', () => {
    expect(formatDateOnly()).toBe('');
    expect(formatDateOnly('not-a-date')).toBe('');
    expect(formatDateOnly('2026-02-30')).toBe('');
    expect(formatDateOnly('2026-07-22T18:00:00.000Z')).toBe('');
  });
});
