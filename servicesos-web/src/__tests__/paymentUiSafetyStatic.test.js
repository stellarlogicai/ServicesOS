/* global process */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const srcRoot = join(process.cwd(), 'src');

function sourceFiles(dir = srcRoot) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (path.includes(`${join('src', '__tests__')}`)) return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(jsx?|tsx?)$/.test(name) ? [path] : [];
  });
}

describe('payment UI safety guardrails', () => {
  it('does not restore old PaymentForm or PaymentLinks components', () => {
    expect(existsSync(join(srcRoot, 'components', 'PaymentForm.jsx'))).toBe(false);
    expect(existsSync(join(srcRoot, 'components', 'PaymentLinks.jsx'))).toBe(false);
  });

  it('does not import old unsafe payment UI or fake payment success copy', () => {
    const offenders = sourceFiles()
      .map(path => ({
        path: relative(srcRoot, path),
        text: readFileSync(path, 'utf8'),
      }))
      .filter(file => /from ['"][^'"]*PaymentForm|from ['"][^'"]*PaymentLinks|<PaymentForm|<PaymentLinks|payment successful|payment completed|checkout complete/i.test(file.text));

    expect(offenders).toEqual([]);
  });
});
