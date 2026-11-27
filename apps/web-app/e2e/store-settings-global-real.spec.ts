import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { PublicStoreSettingsResponseSchema, UpdateStoreSettingsSchema } from '@fnb/shared';

// Explicit opt-in: this suite writes settings and requires a disposable seeded backend.
test.describe('@real store-wide configuration', () => {
  test.skip(process.env.E2E_REAL_ISOLATED !== '1', 'Requires an isolated seeded database and E2E_REAL_ISOLATED=1');
  test('syncs real API/database/Socket changes across staff and QR, recovers missed events and retains hardware on account change', async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const contexts: BrowserContext[] = [];
    const makeContext = async () => {
      const context = await browser.newContext({ baseURL });
      contexts.push(context);
      return context;
    };
    const admin = await makeContext();
    const cashier = await makeContext();
    const guest = await makeContext();
    const login = async (context: BrowserContext, username: string) => {
      const response = await context.request.post('/api/v1/auth/login', {
        data: { username, password: process.env.E2E_TEST_PASSWORD ?? 'Password@123', force: true },
      });
      expect(response.ok()).toBeTruthy();
      return response.json() as Promise<{ accessToken: string; user: Record<string, unknown> }>;
    };
    const adminSession = await login(admin, 'superadmin');
    const cashierSession = await login(cashier, 'thungan');
    const openSessionPage = async (context: BrowserContext, session: { user: Record<string, unknown> }, path: string) => {
      const page = await context.newPage();
      await page.goto('/login');
      await page.evaluate((user) => localStorage.setItem('fnb-auth', JSON.stringify({ state: { user }, version: 0 })), session.user);
      await page.goto(path);
      return page;
    };
    const asInput = (value: Record<string, unknown>) => {
      const input = { ...value };
      delete input.updatedAt;
      delete input.assets;
      delete input.qrMessages;
      return UpdateStoreSettingsSchema.parse(input);
    };
    const headers = { Authorization: `Bearer ${adminSession.accessToken}` };
    const initialResponse = await admin.request.get('/api/v1/settings', { headers });
    expect(initialResponse.ok()).toBeTruthy();
    const original = PublicStoreSettingsResponseSchema.parse(await initialResponse.json());
    const messagesResponse = await admin.request.get('/api/v1/store-messages', { headers });
    const originalMessages = (await messagesResponse.json()).messages;
    const readCurrent = async () => PublicStoreSettingsResponseSchema.parse(await (await admin.request.get('/api/v1/settings', { headers })).json());
    const writeSettings = async (overrides: Record<string, unknown>) => {
      const current = await readCurrent();
      const response = await admin.request.put('/api/v1/settings', {
        headers,
        data: asInput({ ...current, ...overrides, expectedUpdatedAt: current.updatedAt }),
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      return current;
    };
    const zoom = (page: Page) => page.evaluate(() => document.documentElement.style.getPropertyValue('--page-zoom'));
    try {
      const staffPage = await openSessionPage(cashier, cashierSession, '/pos');
      await expect(staffPage.locator('main[data-app-content="true"]')).toBeVisible();
      const grid = await (await admin.request.get('/api/v1/pos/tables', { headers })).json();
      const token = grid.tables[0].qrToken;
      expect(token).toBeTruthy();
      const guestPage = await guest.newPage();
      await guestPage.goto(`/q/${token}`);
      await expect(guestPage.locator('[data-qr-order-root="true"]')).toBeVisible();

      // Assert a real Socket frame rather than allowing polling to masquerade as realtime.
      const frames: string[] = [];
      staffPage.on('websocket', (socket) => socket.on('framereceived', ({ payload }) => frames.push(String(payload))));
      await staffPage.reload();
      await expect.poll(() => frames.some((frame) => frame.startsWith('40/pos'))).toBe(true);
      await writeSettings({ defaultTheme: 'light', displayScale: { globalPercent: 125, perPath: {}, qrOrderPercent: 150 }, qr: { ...original.qr, theme: 'dark' } });
      await expect.poll(() => frames.some((frame) => frame.includes('store-settings:updated'))).toBe(true);
      await expect(staffPage.locator('html')).not.toHaveClass(/dark/);
      await expect.poll(() => zoom(staffPage)).toBe('1.25');
      await expect.poll(() => zoom(guestPage)).toBe('1.5');
      await expect(guestPage.locator('html')).toHaveClass(/dark/);
      await expect(guestPage.getByTestId('qr-theme-toggle')).toHaveCount(0);
      await writeSettings({ brandColor: '#2563EB' });
      await expect.poll(() => guestPage.evaluate(() => JSON.parse(localStorage.getItem('store_settings_cache') ?? '{}').brandColor)).toBe('#2563EB');
      await expect(guestPage.locator('html')).toHaveClass(/dark/);
      await expect(staffPage.locator('html')).not.toHaveClass(/dark/);

      const denied = await cashier.request.put('/api/v1/settings', {
        headers: { Authorization: `Bearer ${cashierSession.accessToken}` },
        data: asInput({ ...original, expectedUpdatedAt: original.updatedAt }),
      });
      expect(denied.status()).toBe(403);
      const stale = await admin.request.put('/api/v1/settings', {
        headers, data: asInput({ ...original, expectedUpdatedAt: original.updatedAt }),
      });
      expect(stale.status()).toBe(409);

      await cashier.setOffline(true);
      await writeSettings({ defaultTheme: 'light', displayScale: { globalPercent: 150, perPath: {}, qrOrderPercent: 100 } });
      await cashier.setOffline(false);
      await expect(staffPage.locator('html')).not.toHaveClass(/dark/);
      await expect.poll(() => zoom(staffPage)).toBe('1.5');

      const adminPage = await openSessionPage(admin, adminSession, '/settings');
      await expect(adminPage.getByTestId('input-store-name')).toBeVisible();
      await writeSettings({ storeName: 'Isolated concurrent update' });
      await adminPage.getByTestId('input-store-name').fill('Stale UI draft');
      await adminPage.getByTestId('store-settings-save-btn').click();
      await expect(adminPage.getByTestId('store-settings-conflict-banner')).toBeVisible();
      await expect(adminPage.getByTestId('input-store-name')).toHaveValue('Stale UI draft');
      await adminPage.getByTestId('store-settings-conflict-reload-btn').click();
      await expect(adminPage.getByTestId('input-store-name')).toHaveValue('Isolated concurrent update');
      await adminPage.getByTestId('input-store-name').fill('Isolated UI saved store');
      const savedResponse = adminPage.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/api/v1/settings'));
      await adminPage.getByTestId('store-settings-save-btn').click();
      expect((await savedResponse).ok()).toBeTruthy();
      await expect(staffPage).toHaveTitle(/Isolated UI saved store/);
      expect((await readCurrent()).storeName).toBe('Isolated UI saved store');
      await adminPage.getByRole('tab', { name: /Phiếu in/i }).click();
      await adminPage.getByTestId('printer-driver-option-RAWBT_USB').click();
      const configKey = 'fnb-thermal-printer-device-config';
      const saved = await adminPage.evaluate((key) => localStorage.getItem(key), configKey);
      expect(saved).toContain('RAWBT_USB');
      // A second tab in the same browser profile must see storage updates too.
      const otherTab = await admin.newPage();
      await otherTab.goto('/pos/touch/printer');
      await expect(otherTab.getByTestId('printer-driver-option-RAWBT_USB')).toHaveAttribute('aria-pressed', 'true');
      await adminPage.getByTestId('printer-driver-option-BROWSER').click();
      await expect(otherTab.getByTestId('printer-driver-option-BROWSER')).toHaveAttribute('aria-pressed', 'true');

      // Change to a different staff account using the real auth endpoints.
      await admin.request.post('/api/v1/auth/logout', { headers });
      const viewerSession = await login(admin, 'adminview');
      await adminPage.evaluate((user) => localStorage.setItem('fnb-auth', JSON.stringify({ state: { user }, version: 0 })), viewerSession.user);
      await adminPage.goto('/settings');
      await adminPage.getByRole('tab', { name: /Phiếu in/i }).click();
      await expect(adminPage.getByTestId('printer-driver-option-BROWSER')).toBeDisabled();
      await expect(adminPage.getByTestId('btn-reset-printer-hardware-config')).toBeDisabled();
      expect(await adminPage.evaluate((key) => localStorage.getItem(key), configKey)).toContain('BROWSER');
      expect(await staffPage.evaluate((key) => localStorage.getItem(key), configKey)).toBeNull();
    } finally {
      // Logging in as another account above replaced the admin context cookie; restore with a fresh admin session.
      const restore = await login(admin, 'superadmin');
      const restoreHeaders = { Authorization: `Bearer ${restore.accessToken}` };
      const current = PublicStoreSettingsResponseSchema.parse(await (await admin.request.get('/api/v1/settings', { headers: restoreHeaders })).json());
      const response = await admin.request.put('/api/v1/settings', {
        headers: restoreHeaders,
        data: asInput({ ...original, messages: originalMessages, expectedUpdatedAt: current.updatedAt }),
      });
      expect(response.ok(), 'Restore isolated store settings').toBeTruthy();
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
});
