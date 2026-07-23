/* global process */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzePhotos } from '../services/aiService';

const srcRoot = resolve(process.cwd(), 'src');
const forbiddenKeyName = ['VITE', 'ANTHROPIC', 'API', 'KEY'].join('_');
const providerHost = ['api', 'anthropic', 'com'].join('.');
const providerKeyHeader = ['x', 'api', 'key'].join('-');

function sourceFiles(dir = srcRoot) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (path.includes(`${join('src', '__tests__')}`)) return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(jsx?|tsx?)$/.test(name) ? [path] : [];
  });
}

describe('browser AI release gate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps photo analysis unavailable without making a provider request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(analyzePhotos([])).rejects.toThrow('AI photo analysis is unavailable in this release');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('contains no browser Anthropic endpoint, secret variable, or key header construction', () => {
    const offenders = sourceFiles()
      .map(path => ({ path: relative(srcRoot, path), text: readFileSync(path, 'utf8') }))
      .filter(file => {
        const lower = file.text.toLowerCase();
        const readsBrowserSecret = lower.includes(`import.meta.env.${forbiddenKeyName.toLowerCase()}`);
        return readsBrowserSecret
          || lower.includes(providerHost)
          || lower.includes(providerKeyHeader);
      });

    expect(offenders).toEqual([]);
  });

  it('does not advertise an AI provider secret in client environment or deploy examples', () => {
    const files = [
      resolve(process.cwd(), '.env.example'),
      resolve(process.cwd(), '..', 'netlify.toml'),
      resolve(process.cwd(), '..', 'docs', 'servicesos-beta', 'NETLIFY_DEPLOYMENT.md'),
    ];

    files.forEach(path => {
      expect(readFileSync(path, 'utf8')).not.toContain(forbiddenKeyName);
    });
  });
});
