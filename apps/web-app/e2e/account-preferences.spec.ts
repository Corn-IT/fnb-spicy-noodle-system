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

test.describe('Per-account preferences', () => {
  test('account scale overrides the store scale per screen while the guest QR page keeps the store scale', async ({ page }) => {
    await signInWithPreferences(
      page,
      { displayScale: { globalPercent: 120, perPath: { '/pos': 110 } } },
      { displayScale: { globalPercent: 100, perPath: {}, qrOrderPercent: 110 } },
    );
    const isPhone = (page.viewportSize()?.width ?? 1280) < 640;

    await page.goto('/pos', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main[data-app-content="true"]');
    await expect.poll(() => readZoom(page)).toBe(isPhone ? '1' : '1.1');

    await page.goto('/invoices', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main[data-app-content="true"]');
    await expect.poll(() => readZoom(page)).toBe(isPhone ? '1' : '1.2');

    await page.goto(`/q/${MOCK_QR_TOKEN}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-qr-order-root="true"]');
    await expect.poll(() => readZoom(page)).toBe('1.1');
  });

  test('restores saved menu order and collapsed sidebar when the session is restored on reload', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The desktop sidebar is not rendered on phones');
    await signInWithPreferences(page, {
      sidebarCollapsed: true,
      navGroupOrder: ['finance', 'sales', 'hr', 'system'],
    });

    await page.goto('/invoices', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main[data-app-content="true"]');

    await expect.poll(() => page.locator('aside').first().evaluate((el) => el.getBoundingClientRect().width)).toBeLessThan(100);
    const hrefs = await page.locator('aside nav a').evaluateAll((links) => links.map((a) => a.getAttribute('href')));
    expect(hrefs.indexOf('/cashflow')).toBeLessThan(hrefs.indexOf('/pos'));
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
    expect(hrefs.indexOf('/cashflow')).toBeLessThan(hrefs.indexOf('/pos'));
  });

  test('profile card saves quick consecutive changes as one request and updates the menu', async ({ page, isMobile }) => {
    await signInWithPreferences(page, {});
    const saves = await captureSaves(page);

    await page.goto('/profile', { waitUntil: 'domcontentloaded' });
    const card = page.getByTestId('profile-personal-preferences-card');
    await expect(card).toBeVisible();

    const groups = card.getByRole('list', { name: 'Thứ tự nhóm menu' });
    // Two clicks in a row: the second one must not produce a second request.
    await groups.getByRole('button', { name: /^Đưa nhóm Tài chính.* lên$/ }).click();
    await groups.getByRole('button', { name: /^Đưa nhóm Nhân sự.* lên$/ }).click();

    await expect.poll(() => saves.length, { timeout: 5000 }).toBe(1);
    await page.waitForTimeout(600);
    expect(saves).toHaveLength(1);
    expect(saves[0]).toEqual({ navGroupOrder: ['finance', 'hr', 'sales', 'system'] });
    await expect(card.getByRole('status')).toContainText('Đã lưu cho tài khoản của bạn');

    if (!isMobile) {
      const hrefs = await page.locator('aside nav a').evaluateAll((links) => links.map((a) => a.getAttribute('href')));
      expect(hrefs.indexOf('/cashflow')).toBeLessThan(hrefs.indexOf('/pos'));
    }
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

  test('phones keep the drawer menu on screen even when the account asks for 150% zoom', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Phone-only behavior');
    await signInWithPreferences(page, { displayScale: { globalPercent: 150, perPath: {} } });

    await page.goto('/invoices', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main[data-app-content="true"]');
    await expect.poll(() => readZoom(page)).toBe('1');

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
      if (path === '/profile') {
        await page.getByTestId('personal-per-path-scale').locator('summary').click();
      }
      const violations = await auditPageLayout(page, { checkTouchTargets: false });
      const overflow = violations.filter((v) => v.rule === 'HORIZONTAL_OVERFLOW');
      expect(overflow, `${path}: ${overflow.map((v) => `${v.selector} ${v.detail}`).join('; ')}`).toEqual([]);
    }
  });
});
