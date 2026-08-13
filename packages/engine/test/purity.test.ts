import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The product rule, enforced mechanically: "The engine is pure functions — no LLM calls,
 * no network, no randomness, no Date.now() inside calculations."
 *
 * A comment promising purity is not a guarantee. This test reads the source and fails if
 * anything ambient sneaks in. Tests themselves are exempt — only src/ is scanned.
 */
const SRC_DIR = join(__dirname, '..', 'src');

function sourceFiles(): { path: string; text: string }[] {
  return readdirSync(SRC_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ path: f, text: readFileSync(join(SRC_DIR, f), 'utf8') }));
}

const BANNED: { pattern: RegExp; why: string }[] = [
  { pattern: /Date\.now\s*\(/, why: 'Date.now() — effective dates are inputs, never ambient' },
  { pattern: /new Date\s*\(\s*\)/, why: 'new Date() with no argument reads the clock' },
  { pattern: /Math\.random\s*\(/, why: 'randomness makes an estimate unreproducible' },
  { pattern: /\bfetch\s*\(/, why: 'the engine makes no network calls' },
  { pattern: /require\s*\(\s*['"]node:(https?|net|dns)/, why: 'the engine makes no network calls' },
  { pattern: /from\s+['"]node:(fs|https?|net|dns|child_process)/, why: 'the engine touches no I/O' },
  { pattern: /process\.env/, why: 'ambient configuration is not an input' },
];

describe('the engine is pure', () => {
  const files = sourceFiles();

  it('has source files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const { pattern, why } of BANNED) {
    it(`contains no ${why}`, () => {
      const offenders = files.filter((f) => pattern.test(f.text)).map((f) => f.path);
      expect(offenders, `banned pattern ${pattern} found in: ${offenders.join(', ')}`).toEqual([]);
    });
  }

  it('uses Date only as a calendar lookup on an explicit string argument', () => {
    // isIsoDate parses a supplied YYYY-MM-DD. That is a pure function of its input.
    const ratebook = files.find((f) => f.path === 'ratebook.ts');
    expect(ratebook?.text).toContain('new Date(`${value}T00:00:00Z`)');
  });
});
