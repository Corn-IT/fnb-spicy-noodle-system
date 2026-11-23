import { expect, test } from '@playwright/test';

import { MOCK_QR_TOKEN, setupMockApi } from './fixtures/api-mock';
import {
  auditPageLayout,
  DISPLAY_SCALE_LEVELS,
  RESPONSIVE_VIEWPORTS,
} from './utils/layout-assertions';

const MATRIX_PAGES = [
  { path: '/pos', name: 'POS' },
  { path: '/settings', name: 'Settings' },
  { path: '/menu', name: 'Menu' },
  { path: '/invoices', name: 'Invoices' },
  { path: `/q/${MOCK_QR_TOKEN}`, name: 'QR Guest' },
];

test.describe('Responsive Matrix (8 viewports x 4 display scale levels: 80/100/125/150%)', () => {
  test('zero horizontal page overflow across all viewports and zoom levels', async ({ page }) => {
    test.setTimeout(240_000);

    const overflowFailures: string[] = [];

    for (const scale of DISPLAY_SCALE_LEVELS) {
      await setupMockApi(page, {
        storeSettingsOverride: {
          displayScale: {
            globalPercent: scale,
            perPath: {},
            qrOrderPercent: scale,
          },
        },
      });

      for (const target of MATRIX_PAGES) {
        for (const vp of RESPONSIVE_VIEWPORTS) {
          await page.setViewportSize({ width: vp.width, height: vp.height });
          await page.goto(target.path, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(250);

          const violations = await auditPageLayout(page, {
            checkTouchTargets: false,
          });
          const critical = violations.filter(
            (v) =>
              v.rule === 'HORIZONTAL_OVERFLOW' ||
              v.rule === 'DIALOG_OUT_OF_VIEWPORT',
          );
          if (critical.length > 0) {
            overflowFailures.push(
              `${target.path} @ ${vp.name} (${scale}%): ${critical.map((c) => `${c.rule}:${c.selector}(${c.detail})`).join('; ')}`,
            );
          }
        }
      }
    }

    expect(overflowFailures, overflowFailures.join('\n')).toEqual([]);
  });
});
