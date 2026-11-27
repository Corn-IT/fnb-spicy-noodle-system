import { expect, test } from '@playwright/test';

import { MOCK_QR_TOKEN, setupMockApi } from './fixtures/api-mock';
import { auditPageLayout, RESPONSIVE_VIEWPORTS, type LayoutViolation } from './utils/layout-assertions';

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
  ...['hub', 'stock-status', 'printer', 'dashboard', 'invoices', 'cashflow', 'inventory', 'menu', 'discounts', 'payment-qr', 'settings', 'profile'].map((part) => ({ path: `/pos/touch/${part}`, slug: `touch-${part}` })),
  { path: `/q/${MOCK_QR_TOKEN}`, slug: 'qr-guest' },
] as const;

const AUDIT_VIEWPORTS = RESPONSIVE_VIEWPORTS;

const SCREENSHOT_SLUGS = new Set(['pos', 'invoices', 'menu', 'dashboard', 'schedules', 'qr-guest', 'pos-touch']);
const SCREENSHOT_VPS = new Set(['mobile-320', 'mobile-360', 'tablet-820', 'pos-1024x600']);

test.describe('All routes responsive & visual audit (Mobile through large desktop)', () => {
  for (const vp of AUDIT_VIEWPORTS) {
    test(`all routes at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }, testInfo) => {
      test.setTimeout(180_000);
      await setupMockApi(page);
      await page.addInitScript(() => { if (location.pathname === '/login') localStorage.removeItem('fnb-auth'); });
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      const report: Array<{ page: string; violations: LayoutViolation[] }> = [];
      for (const target of ALL_ROUTES) {
        await page.goto(target.path, { waitUntil: 'domcontentloaded' });
        await expect(page.locator(target.slug === 'login' ? '#login-username' : target.slug === 'qr-guest' ? '[data-qr-order-root="true"]' : 'main').first()).toBeVisible();
        if (target.slug === 'login') await expect(page.locator('#login-username')).toBeVisible();
        await expect(page.locator('[data-testid^="page-skeleton-"]')).toHaveCount(0);
        await expect(page.getByRole('status', { name: /^Đang tải/ })).toHaveCount(0);
        if (target.slug === 'inventory' || target.slug === 'payroll') {
          await expect(page.getByTestId(`${target.slug}-footer-total`)).toBeVisible();
        }
        await expect(page.getByTestId('app-fatal-error-boundary')).toHaveCount(0);
        const violations = await auditPageLayout(page, { checkTouchTargets: vp.isTouch });
        if (violations.length) report.push({ page: target.path, violations });
        if (SCREENSHOT_SLUGS.has(target.slug) && SCREENSHOT_VPS.has(vp.name)) {
          await page.screenshot({ path: testInfo.outputPath(`${target.slug}.png`) });
        }
      }
      await testInfo.attach('layout-audit', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
      expect(pageErrors).toEqual([]);
      const critical = report.filter((entry) => entry.violations.some((v) => ['HORIZONTAL_OVERFLOW', 'DIALOG_OUT_OF_VIEWPORT', 'UNREADABLE_MOBILE_TRUNCATION'].includes(v.rule)));
      expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
    });
  }
});

test('inventory and payroll render mock summaries without an error boundary', async ({ page }) => {
  await setupMockApi(page);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  for (const [routePath, apiPath, footer] of [
    ['/inventory', '/api/v1/inventory-imports', 'inventory-footer-total'],
    ['/payroll', '/api/v1/payroll', 'payroll-footer-total'],
  ]) {
    const dataReady = page.waitForResponse((response) => new URL(response.url()).pathname === apiPath && response.status() === 200);
    await page.goto(routePath, { waitUntil: 'domcontentloaded' });
    await dataReady;
    await expect(page.getByTestId(footer)).toBeVisible();
    await expect(page.getByTestId('app-fatal-error-boundary')).toHaveCount(0);
  }
  expect(pageErrors).toEqual([]);
});
