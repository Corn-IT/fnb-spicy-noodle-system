import { expect, test } from '@playwright/test';
import { MOCK_QR_TOKEN, setupMockApi } from './fixtures/api-mock';
import { auditPageLayout } from './utils/layout-assertions';

for (const target of [
  { path: '/invoices', width: 320, height: 740, ready: '[data-testid="invoices-page"]' },
  { path: `/q/${MOCK_QR_TOKEN}`, width: 390, height: 844, ready: '[data-qr-order-root="true"]' },
  { path: '/pos/touch/printer', width: 1024, height: 600, ready: '[data-testid="printer-hardware-settings-panel"]' },
  { path: '/menu', width: 768, height: 1024, ready: '[data-testid="menu-management-page"]' },
]) {
  test(`150% controls fit ${target.path} at ${target.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: target.width, height: target.height });
    await setupMockApi(page, { storeSettingsOverride: { displayScale: { globalPercent: 150, perPath: {}, qrOrderPercent: 150 } } });
    await page.goto(target.path);
    await expect(page.locator(target.ready)).toBeVisible();
    const violations = (await auditPageLayout(page)).filter((v) => ['HORIZONTAL_OVERFLOW', 'ELEMENT_OUT_OF_BOUNDS', 'TEXT_CLIPPED'].includes(v.rule));
    console.log(JSON.stringify(violations, null, 2));
    await page.screenshot({ path: testInfo.outputPath('controls.png'), fullPage: false });
    expect(violations).toEqual([]);
  });
}

for (const overflow of ['auto', 'hidden'] as const) {
  test(`layout audit verifies scroll reachability without accepting ${overflow === 'auto' ? 'false clipping' : 'hidden actions'}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 240 });
    await page.setContent(`<style>body{margin:0}#scroller{height:80px;width:300px;overflow:${overflow}}#content{height:300px}button{margin-top:100px;width:100px;height:30px}#overlay{position:fixed;top:80px;left:0;width:300px;height:100px;background:white}</style><div id="scroller"><div id="content"><button>Action</button></div></div><div id="overlay">Toolbar</div>`);
    const violations = (await auditPageLayout(page, { checkScrollReachability: true })).filter((v) => v.rule === 'INTERACTIVE_OCCLUDED');
    expect(violations).toHaveLength(overflow === 'auto' ? 0 : 1);
  });
}
