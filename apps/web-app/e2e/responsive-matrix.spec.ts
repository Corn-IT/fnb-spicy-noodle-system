import { expect, test } from '@playwright/test';
import { MOCK_QR_TOKEN, setupMockApi } from './fixtures/api-mock';
import { auditPageLayout, DISPLAY_SCALE_LEVELS, RESPONSIVE_VIEWPORTS } from './utils/layout-assertions';

const PAGES = ['/settings', '/profile', '/pos', '/pos/touch', '/pos/touch/settings', '/pos/touch/printer', '/menu', '/invoices', `/q/${MOCK_QR_TOKEN}`];
const VIEWPORTS = RESPONSIVE_VIEWPORTS.filter((vp) => !process.env.E2E_VIEWPORT_WIDTH || vp.width === Number(process.env.E2E_VIEWPORT_WIDTH));
const BLOCKING_RULES = ['HORIZONTAL_OVERFLOW', 'DIALOG_OUT_OF_VIEWPORT', 'ELEMENT_OUT_OF_BOUNDS', 'TEXT_CLIPPED', 'UNREADABLE_MOBILE_TRUNCATION', 'INTERACTIVE_OCCLUDED'];

test.describe('Store policy responsive matrix', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const scale of DISPLAY_SCALE_LEVELS) {
      test(`${theme} ${scale}% across all viewport sizes`, async ({ page }, testInfo) => {
        test.setTimeout(300_000);
        await setupMockApi(page, { storeSettingsOverride: {
          defaultTheme: theme,
          qr: { storeName: '', subtitle: '', welcomeMessage: '', theme },
          displayScale: { globalPercent: scale, perPath: {}, qrOrderPercent: scale },
        } });
        const failures: string[] = [];
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        for (const path of PAGES) {
          await page.goto(path, { waitUntil: 'domcontentloaded' });
          for (const [index, viewport] of VIEWPORTS.entries()) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            // Reset order selection for each independent POS interaction; other pages resize live.
            if (path === '/pos' && index > 0) await page.reload({ waitUntil: 'domcontentloaded' });
            const root = path.startsWith('/q/') ? page.locator('[data-qr-order-root="true"]') : page.locator('main[data-app-content="true"]');
            await expect(root).toBeVisible();
            const ready = path.startsWith('/pos/touch') && viewport.width < 768 ? page.getByTestId('touch-too-narrow')
              : path.endsWith('/settings') ? page.getByTestId('input-store-name')
              : path === '/profile' ? page.getByTestId('profile-personal-preferences-card')
              : path.endsWith('/printer') ? page.getByTestId('printer-hardware-settings-panel')
              : path === '/pos/touch' ? page.getByTestId('touch-table-board')
              : path === '/pos' ? page.getByTestId('table-card-1')
              : path === '/menu' ? page.getByTestId('menu-management-page')
              : path === '/invoices' ? page.getByTestId('invoices-page') : root;
            await expect(ready).toBeVisible();
            await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--page-zoom'))).toBe(String(scale / 100));
            await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(theme === 'dark');
            const violations = (await auditPageLayout(page, { checkScrollReachability: true })).filter((item) => BLOCKING_RULES.includes(item.rule));
            failures.push(...violations.map((v) => `${path} ${viewport.name}: ${v.rule} ${v.selector} ${v.detail}`));
            if (path === '/pos') {
              await page.getByTestId('table-card-1').click();
              await page.getByTestId('btn-quick-cancel-order').click();
              const dialog = page.getByTestId('cancel-order-confirm-dialog');
              await expect(dialog).toBeVisible();
              const box = await dialog.boundingBox();
              if (!box || box.x < -2 || box.y < -2 || box.x + box.width > viewport.width + 2 || box.y + box.height > viewport.height + 2) {
                failures.push(`POS dialog outside ${viewport.name} at ${scale}%: ${JSON.stringify(box)}`);
              }
              await page.getByTestId('btn-cancel-order-dismiss').click();
              await expect(dialog).toHaveCount(0);
            }
            if (viewport.width === 320 && path === '/settings') {
              for (const tab of await page.getByRole('tab').all()) {
                await tab.click();
                await expect(tab).toHaveAttribute('aria-selected', 'true');
                const tabName = await tab.textContent();
                failures.push(...(await auditPageLayout(page, { checkScrollReachability: true })).filter((v) => v.rule === 'HORIZONTAL_OVERFLOW').map((v) => `Settings tab ${tabName}: ${v.detail}`));
              }
              await page.screenshot({ path: testInfo.outputPath(`settings-320-${theme}-${scale}.png`) });
              await page.getByRole('tab', { name: 'Thông tin quán' }).click();
            }
          }
        }
        await testInfo.attach('layout-findings', { body: JSON.stringify(failures, null, 2), contentType: 'application/json' });
        expect(errors, errors.join('\n')).toEqual([]);
        expect(failures, failures.join('\n')).toEqual([]);
      });
    }
  }
});
