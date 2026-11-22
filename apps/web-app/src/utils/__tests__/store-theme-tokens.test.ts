import { describe, expect, it } from 'vitest';

const STANDALONE_TEXT_PRIMARY_REGEX = /(?<![A-Za-z0-9_-])text-primary(?!-foreground|[A-Za-z0-9_-])/g;

const SOURCE_FILES = import.meta.glob<string>(
  ['../../**/*.ts', '../../**/*.tsx', '!../../**/__tests__/**', '!../../**/*.test.ts', '!../../**/*.test.tsx'],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
);

describe('theme color token separation regression (AC-15.5)', () => {
  it('contains zero standalone text-primary classes in runtime web-app source files (excluding text-primary-foreground)', () => {
    const entries = Object.entries(SOURCE_FILES);
    expect(entries.length).toBeGreaterThan(30);

    const violations: string[] = [];

    for (const [relativePath, content] of entries) {
      const lines = content.split(/\r?\n/);
      lines.forEach((line: string, index: number) => {
        STANDALONE_TEXT_PRIMARY_REGEX.lastIndex = 0;
        if (STANDALONE_TEXT_PRIMARY_REGEX.test(line)) {
          violations.push(`${relativePath}:${index + 1}: ${line.trim()}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });
});
