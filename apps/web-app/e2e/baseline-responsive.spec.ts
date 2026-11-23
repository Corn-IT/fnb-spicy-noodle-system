import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';

import { setupMockApi } from './fixtures/api-mock';
import { auditPageLayout, RESPONSIVE_VIEWPORTS, type LayoutViolation } from './utils/layout-assertions';

const PAGES_TO_AUDIT = [
  { path: '/login', label: 'Login', auth: false },
  { path: '/pos', label: 'POS Counter', auth: true },
  { path: '/settings', label: 'Store Settings', auth: true },
  { path: '/menu', label: 'Menu Management', auth: true },
  { path: '/invoices', label: 'Invoices', auth: true },
  { path: '/q/tbl-token-1', label: 'QR Guest Order', auth: false },
];

test.describe('Baseline responsive audit (100% scale)', () => {
  test('collect layout violations across key screens and viewports', async ({ page }) => {
    test.setTimeout(180_000);
    await setupMockApi(page);

    const report: Array<{
      page: string;
      viewport: string;
      violations: LayoutViolation[];
    }> = [];

    for (const target of PAGES_TO_AUDIT) {
      for (const vp of RESPONSIVE_VIEWPORTS) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(target.path, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(450);

        const violations = await auditPageLayout(page, {
          checkTouchTargets: vp.isTouch,
        });

        if (violations.length > 0) {
          report.push({
            page: target.path,
            viewport: `${vp.name} (${vp.width}x${vp.height})`,
            violations,
          });
        }
      }
    }

    const outPath = path.resolve(process.cwd(), 'e2e/baseline-audit-output.json');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
    // Baseline collector succeeds while outputting findings for report & hotfix tracking
    expect(fs.existsSync(outPath)).toBe(true);
  });
});
