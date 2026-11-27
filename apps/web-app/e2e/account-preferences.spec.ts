import { expect, test, type Page, type Route } from '@playwright/test';

import { MOCK_QR_TOKEN, MOCK_SUPER_ADMIN, setupMockApi } from './fixtures/api-mock';
import { auditPageLayout } from './utils/layout-assertions';

interface AccountPrefs {
  theme?: 'light' | 'dark' | 'system';
  displayScale?: { globalPercent?: number; perPath: Record<string, number> };
  navOrder?: string[];
  navGroupOrder?: string[];
  sidebarCollapsed?: boolean;
  voiceAlertEnabled?: boolean;
}

const BASE_PREFS = {
  theme: 'system',
  sidebarWidth: 260,
  columnWidths: {},
  displayScale: { perPath: {} },
  navOrder: [],
  navGroupOrder: [],
  sidebarCollapsed: false,
};

const readZoom = (page: Page) =>
  page.evaluate(() => document.documentElement.style.getPropertyValue('--page-zoom'));

/** Makes the mocked refresh endpoint answer as an account that has the given saved preferences. */
async function signInWithPreferences(page: Page, prefs: AccountPrefs, storeOverride: Record<string, unknown> = {}) {
  await setupMockApi(page, { storeSettingsOverride: storeOverride });
  await page.route('**/api/v1/auth/refresh', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'mock-e2e-token',
        user: { ...MOCK_SUPER_ADMIN, uiPreferences: { ...BASE_PREFS, ...prefs } },
      }),
    }),
  );
}

/** Records every account-preference save and answers like the real endpoint. */
async function captureSaves(page: Page): Promise<Array<Record<string, unknown>>> {
  const saves: Array<Record<string, unknown>> = [];
  await page.route('**/api/v1/profile/ui-prefs', (route: Route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    saves.push(body);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...BASE_PREFS, ...body }),
    });
  });
  return saves;
}

test.describe('Store policy and remaining account preferences', () => {
  test('store scale wins over old account overrides while QR uses its store scale', async ({ page }) => {
    await signInWithPreferences(
      page,
      { displayScale: { globalPercent: 120, perPath: { '/pos': 110 } } },
      { defaultTheme: 'dark', displayScale: { globalPercent: 125, perPath: { '/pos': 150 }, qrOrderPercent: 110 } },
    );

    await page.goto('/pos', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main[data-app-content="true"]');
    await expect.poll(() => readZoom(page)).toBe('1.5');
    await expect(page.getByTestId('table-card-1')).toBeVisible();
    await page.waitForLoadState('load');

    await page.goto('/invoices', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main[data-app-content="true"]');
    await expect.poll(() => readZoom(page)).toBe('1.25');

    await page.goto(`/q/${MOCK_QR_TOKEN}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-qr-order-root="true"]');
    await expect.poll(() => readZoom(page)).toBe('1.1');
  });

  test('ignores personal menu order while retaining personal collapsed sidebar', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The desktop sidebar is not rendered on phones');
    await signInWithPreferences(page, {
      sidebarCollapsed: true,
      navGroupOrder: ['finance', 'sales', 'hr', 'system'],
    });

    await page.goto('/invoices', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main[data-app-content="true"]');

    await expect.poll(() => page.locator('aside').first().evaluate((el) => el.getBoundingClientRect().width)).toBeLessThan(100);
    const hrefs = await page.locator('aside nav a').evaluateAll((links) => links.map((a) => a.getAttribute('href')));
    expect(hrefs.indexOf('/pos')).toBeLessThan(hrefs.indexOf('/cashflow'));
  });

  test('a different account never inherits the previous account preferences', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The desktop sidebar is not rendered on phones');
    await signInWithPreferences(page, { sidebarCollapsed: true, navGroupOrder: ['finance', 'sales', 'hr', 'system'] });
    await page.goto('/invoices', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main[data-app-content="true"]');
    await expect.poll(() => page.locator('aside').first().evaluate((el) => el.getBoundingClientRect().width)).toBeLessThan(100);

    // Same browser, next account: the server has no saved choices for it.
    await page.unroute('**/api/v1/auth/refresh');
    await page.route('**/api/v1/auth/refresh', (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'mock-e2e-token-2',
          user: { ...MOCK_SUPER_ADMIN, id: 2, username: 'other', uiPreferences: BASE_PREFS },
        }),
      }),
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main[data-app-content="true"]');

    await expect.poll(() => page.locator('aside').first().evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(200);
    const hrefs = await page.locator('aside nav a').evaluateAll((links) => links.map((a) => a.getAttribute('href')));
    expect(hrefs.indexOf('/pos')).toBeLessThan(hrefs.indexOf('/cashflow'));
  });

  test('picks up changes made on another device when the tab becomes active again', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The desktop sidebar is not rendered on phones');
    await page.clock.install();
    await signInWithPreferences(page, {});
    await page.goto('/invoices', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main[data-app-content="true"]');
    const sidebarWidth = () => page.locator('aside').first().evaluate((el) => el.getBoundingClientRect().width);
    await expect.poll(sidebarWidth).toBeGreaterThan(200);

    // Meanwhile the same account collapsed the sidebar and reordered the groups on another device.
    await page.route('**/api/v1/profile', (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...MOCK_SUPER_ADMIN,
          uiPreferences: { ...BASE_PREFS, sidebarCollapsed: true, navGroupOrder: ['finance', 'sales', 'hr', 'system'] },
        }),
      }),
    );

    await page.clock.fastForward(25_000);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));

    await expect.poll(sidebarWidth).toBeLessThan(100);
    const hrefs = await page.locator('aside nav a').evaluateAll((links) => links.map((a) => a.getAttribute('href')));
    expect(hrefs.indexOf('/pos')).toBeLessThan(hrefs.indexOf('/cashflow'));
  });

  test('profile explains store management and exposes no personal theme, scale or menu controls', async ({ page }) => {
    await signInWithPreferences(page, { theme: 'light', displayScale: { globalPercent: 80, perPath: {} } }, { defaultTheme: 'dark' });
    const saves = await captureSaves(page);
    await page.goto('/profile');
    const card = page.getByTestId('profile-personal-preferences-card');
    await expect(card).toBeVisible();
    await expect(card.getByText(/cài đặt chung của cửa hàng/i).first()).toBeVisible();
    await expect(card.getByRole('list', { name: 'Thứ tự nhóm menu' })).toHaveCount(0);
    await expect(page.getByTestId('personal-per-path-scale')).toHaveCount(0);
    await expect(page.locator('html')).toHaveClass(/dark/);
    expect(saves).toEqual([]);
  });

  test('turning the voice off in the profile card is saved for the account and silences the device switch', async ({ page }) => {
    await signInWithPreferences(page, {});
    const saves = await captureSaves(page);
    await page.goto('/profile', { waitUntil: 'domcontentloaded' });

    await page.getByTestId('personal-voice-toggle').uncheck();

    await expect.poll(() => saves.length, { timeout: 5000 }).toBe(1);
    expect(saves[0]).toEqual({ voiceAlertEnabled: false });
    expect(await page.evaluate(() => localStorage.getItem('fnb-pos-voice-alert'))).toBe('false');
  });

  test('phones apply store 150% zoom and keep drawer controls on screen', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Phone-only behavior');
    await signInWithPreferences(page, { displayScale: { globalPercent: 80, perPath: {} } }, { displayScale: { globalPercent: 150, perPath: {}, qrOrderPercent: 100 } });

    await page.goto('/invoices', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main[data-app-content="true"]');
    await expect.poll(() => readZoom(page)).toBe('1.5');

    await page.getByRole('button', { name: 'Mở menu điều hướng' }).click();
    const closeButton = page.getByRole('button', { name: /đóng/i }).first();
    await expect(closeButton).toBeVisible();
    const box = await closeButton.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
  });

  test('profile card, invoices and cashflow have no horizontal overflow at 320px', async ({ page }) => {
    await signInWithPreferences(page, {});
    await page.setViewportSize({ width: 320, height: 640 });

    for (const path of ['/profile', '/invoices', '/cashflow']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('main[data-app-content="true"]');
      await page.waitForTimeout(300);
      const violations = await auditPageLayout(page, { checkTouchTargets: false });
      const overflow = violations.filter((v) => v.rule === 'HORIZONTAL_OVERFLOW');
      expect(overflow, `${path}: ${overflow.map((v) => `${v.selector} ${v.detail}`).join('; ')}`).toEqual([]);
    }
  });
});
