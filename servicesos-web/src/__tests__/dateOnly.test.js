import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatDateOnly, formatLocalDateInputValue } from '../utils/dateOnly';

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

function formatLocalInputInTimeZone(timeZone, instant) {
  const script = [
    `import { formatLocalDateInputValue } from ${JSON.stringify(helperUrl)};`,
    `process.stdout.write(formatLocalDateInputValue(new Date(${JSON.stringify(instant)})));`,
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

describe('formatLocalDateInputValue', () => {
  it('formats supplied local calendar components as YYYY-MM-DD', () => {
    expect(formatLocalDateInputValue(new Date(2026, 5, 9, 23, 45))).toBe('2026-06-09');
  });

  it('uses the local date at a UTC calendar boundary', () => {
    const instant = '2026-07-01T00:30:00.000Z';

    expect(formatLocalInputInTimeZone('America/Chicago', instant)).toBe('2026-06-30');
    expect(formatLocalInputInTimeZone('UTC', instant)).toBe('2026-07-01');
  });
});
