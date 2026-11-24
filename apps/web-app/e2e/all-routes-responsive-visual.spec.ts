import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';

import { MOCK_QR_TOKEN, setupMockApi } from './fixtures/api-mock';
import { auditPageLayout, type LayoutViolation } from './utils/layout-assertions';

const ALL_ROUTES = [
  { path: '/login', slug: 'login' },
  { path: '/pos', slug: 'pos' },
  { path: '/pos/touch', slug: 'pos-touch' },
  { path: '/dashboard', slug: 'dashboard' },
  { path: '/invoices', slug: 'invoices' },
  { path: '/cashflow', slug: 'cashflow' },
  { path: '/inventory', slug: 'inventory' },
  { path: '/menu', slug: 'menu' },
  { path: '/discounts', slug: 'discounts' },
  { path: '/payment-qr', slug: 'payment-qr' },
  { path: '/employees', slug: 'employees' },
  { path: '/schedules', slug: 'schedules' },
  { path: '/payroll', slug: 'payroll' },
  { path: '/master-data', slug: 'master-data' },
  { path: '/rbac', slug: 'rbac' },
  { path: '/settings', slug: 'settings' },
  { path: '/profile', slug: 'profile' },
  { path: `/q/${MOCK_QR_TOKEN}`, slug: 'qr-guest' },
] as const;

const AUDIT_VIEWPORTS = [
  { name: 'mobile-320', width: 320, height: 568, isTouch: true },
  { name: 'fold-344', width: 344, height: 882, isTouch: true },
  { name: 'mobile-360', width: 360, height: 740, isTouch: true },
  { name: 'mobile-390', width: 390, height: 844, isTouch: true },
  { name: 'landscape-667', width: 667, height: 375, isTouch: true },
  { name: 'tablet-768', width: 768, height: 1024, isTouch: true },
  { name: 'tablet-820', width: 820, height: 1180, isTouch: true },
  { name: 'pos-1024x600', width: 1024, height: 600, isTouch: true },
  { name: 'tablet-1180', width: 1180, height: 820, isTouch: true },
] as const;

const SCREENSHOT_SLUGS = new Set(['pos', 'invoices', 'menu', 'dashboard', 'schedules', 'qr-guest', 'pos-touch']);
const SCREENSHOT_VPS = new Set(['mobile-320', 'mobile-360', 'tablet-820', 'pos-1024x600']);

test.describe('All 18 routes responsive & visual audit (Mobile + Tablet)', () => {
  test('zero critical layout, overflow, truncation, or touch-target violations across all routes', async ({ page }) => {
    test.setTimeout(300_000);
    await setupMockApi(page);

    const screenshotDir = process.env.E2E_SCREENSHOT_DIR ?? '';
    if (screenshotDir) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    const report: Array<{
      page: string;
      viewport: string;
      violations: LayoutViolation[];
    }> = [];

    for (const target of ALL_ROUTES) {
      for (const vp of AUDIT_VIEWPORTS) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(target.path, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(300);

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

        if (screenshotDir && SCREENSHOT_SLUGS.has(target.slug) && SCREENSHOT_VPS.has(vp.name)) {
          await page.screenshot({
            path: path.join(screenshotDir, `${target.slug}__${vp.name}.png`),
            fullPage: false,
          });
        }
      }
    }

    const outPath = path.resolve(process.cwd(), 'e2e/all-routes-audit-output.json');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

    const critical = report.filter((entry) =>
      entry.violations.some(
        (v) =>
          v.rule === 'HORIZONTAL_OVERFLOW' ||
          v.rule === 'DIALOG_OUT_OF_VIEWPORT' ||
          v.rule === 'UNREADABLE_MOBILE_TRUNCATION',
      ),
    );
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  });
});
