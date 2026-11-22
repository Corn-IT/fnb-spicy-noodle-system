import { describe, expect, it } from 'vitest';

const featureSources = import.meta.glob<string>('../../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('AC-17.9: Store message catalog source-scan guard', () => {
  it('bans direct toast() calls and toast UI imports inside src/features/**', () => {
    const violations: string[] = [];

    for (const [filePath, source] of Object.entries(featureSources)) {
      if (
        filePath.includes('/__tests__/') ||
        /\.(test|spec)\.(ts|tsx)$/.test(filePath)
      ) {
        continue;
      }

      if (/(?<![\w.])toast\s*\(/.test(source)) {
        violations.push(`${filePath}: contains direct toast(...) call`);
      }
      if (/from\s+['"]@\/components\/ui\/toast['"]/.test(source)) {
        violations.push(`${filePath}: imports directly from @/components/ui/toast`);
      }
    }

    expect(violations).toEqual([]);
  });
});
