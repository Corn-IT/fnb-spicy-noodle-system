import { expect, test } from '@playwright/test';
import jsQR from 'jsqr';

import { setupMockApi } from './fixtures/api-mock';

test.describe('Thermal Provisional VietQR Raster & Scannability Verification (Chromium)', () => {
  test('renders same-origin offline EMVCo VietQR PNG that decodes via jsQR without canvas tainting', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });

    // Open Phiếu in tab -> select Tạm tính + VietQR template
    await page.getByRole('tab', { name: /Phiếu in/i }).click();
    await page.getByTestId('print-template-tab-provisional').click();

    const qrImg = page.getByTestId('provisional-vietqr-image');
    await expect(qrImg).toBeVisible();

    const src = await qrImg.getAttribute('src');
    expect(src?.startsWith('data:image/png;base64,')).toBe(true);

    // Draw the rendered QR image onto a 2D canvas and read RGBA pixels (proves canvas is NOT tainted!)
    const pixels = await page.evaluate(async () => {
      const img = document.querySelector('[data-testid="provisional-vietqr-image"]') as HTMLImageElement | null;
      if (!img) throw new Error('QR img not found');
      if (!img.complete || img.naturalWidth === 0) {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('QR failed to load'));
        });
      }
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No 2d context');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return {
        width: imageData.width,
        height: imageData.height,
        data: Array.from(imageData.data),
      };
    });

    // Decode with jsQR to guarantee any banking app can scan the printed thermal QR
    const decoded = jsQR(
      new Uint8ClampedArray(pixels.data),
      pixels.width,
      pixels.height,
    );

    expect(decoded).not.toBeNull();
    expect(decoded!.data).toContain('000201');
    expect(decoded!.data).toContain('A000000727'); // NAPAS GUID
    expect(decoded!.data).toContain('QRIBFTTA');
    expect(decoded!.data).toContain('5303704'); // VND
    expect(decoded!.data).toContain('5802VN');
  });

  test('renders left & right margin controls cleanly, persists across reload/legacy storage, and keeps full-width real Chrome ESC/POS raster', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    await setupMockApi(page);

    const capturedPayloads: Uint8Array[] = [];
    await page.route('**/api/v1/pos/print/lan-escpos', async (route) => {
      const body = route.request().postDataJSON() as { payloadBase64?: string };
      if (body?.payloadBase64) {
        capturedPayloads.push(new Uint8Array(Buffer.from(body.payloadBase64, 'base64')));
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          host: '192.168.1.200',
          port: 9100,
          bytesSent: capturedPayloads[capturedPayloads.length - 1]?.byteLength ?? 0,
          durationMs: 10,
        }),
      });
    });

    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: /Phiếu in/i }).click();

    const panel = page.getByTestId('printer-hardware-settings-panel');
    const leftInput = page.getByTestId('input-printer-left-margin-mm');
    const rightInput = page.getByTestId('input-printer-right-margin-mm');
    await expect(panel).toBeVisible();
    await expect(leftInput).toBeVisible();
    await expect(rightInput).toBeVisible();
    await expect(rightInput).toHaveValue('0');

    // Verify clean side-by-side desktop alignment without overlap
    const leftBox = await leftInput.boundingBox();
    const rightBox = await rightInput.boundingBox();
    expect(leftBox).not.toBeNull();
    expect(rightBox).not.toBeNull();
    expect(Math.abs(leftBox!.y - rightBox!.y)).toBeLessThan(8);
    expect(rightBox!.x).toBeGreaterThan(leftBox!.x + leftBox!.width);

    // Update margins: left=0mm, right=4mm -> check CSS vars and localStorage persistence
    await leftInput.fill('0');
    await rightInput.fill('4');

    await expect
      .poll(() =>
        page.evaluate(() => ({
          left: document.getElementById('thermal-print-container')?.style.getPropertyValue('--thermal-left-margin-mm'),
          right: document.getElementById('thermal-print-container')?.style.getPropertyValue('--thermal-right-margin-mm'),
        })),
      )
      .toEqual({ left: '0mm', right: '4mm' });

    // Switch to LAN_ESCPOS and trigger real Chrome Canvas 2D ESC/POS test print
    await page.getByTestId('printer-driver-option-LAN_ESCPOS').click();
    await page.getByTestId('btn-test-thermal-print').click();
    await expect.poll(() => capturedPayloads.length).toBe(1);

    // Margins are baked into the raster so the printer receives the full 576-dot width.
    const firstPayload = capturedPayloads[0]!;
    const hasGsL0 = firstPayload.some(
      (_b, i) => firstPayload[i] === 0x1d && firstPayload[i + 1] === 0x4c && firstPayload[i + 2] === 0 && firstPayload[i + 3] === 0,
    );
    const hasGsV0Width72 = firstPayload.some(
      (_b, i) =>
        firstPayload[i] === 0x1d &&
        firstPayload[i + 1] === 0x76 &&
        firstPayload[i + 2] === 0x30 &&
        firstPayload[i + 3] === 0x00 &&
        firstPayload[i + 4] === 72 &&
        firstPayload[i + 5] === 0,
    );
    expect(hasGsL0).toBe(true);
    expect(hasGsV0Width72).toBe(true);

    // Margins alter the image content, not the raster width or printer hardware margin.
    await leftInput.fill('3');
    await rightInput.fill('2');
    await page.getByTestId('btn-test-thermal-print').click();
    await expect.poll(() => capturedPayloads.length).toBe(2);

    const secondPayload = capturedPayloads[1]!;
    const hasGsL24 = secondPayload.some(
      (_b, i) => secondPayload[i] === 0x1d && secondPayload[i + 1] === 0x4c && secondPayload[i + 2] === 24 && secondPayload[i + 3] === 0,
    );
    const hasSecondGsV0Width72 = secondPayload.some(
      (_b, i) =>
        secondPayload[i] === 0x1d &&
        secondPayload[i + 1] === 0x76 &&
        secondPayload[i + 2] === 0x30 &&
        secondPayload[i + 3] === 0x00 &&
        secondPayload[i + 4] === 72 &&
        secondPayload[i + 5] === 0,
    );
    expect(hasGsL24).toBe(false);
    expect(hasSecondGsV0Width72).toBe(true);

    // Reload and verify persisted values survive reload
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: /Phiếu in/i }).click();
    await expect(page.getByTestId('input-printer-left-margin-mm')).toHaveValue('3');
    await expect(page.getByTestId('input-printer-right-margin-mm')).toHaveValue('2');

    // Verify out-of-range clamp (12 -> 8)
    await page.getByTestId('input-printer-right-margin-mm').fill('12');
    await expect(page.getByTestId('input-printer-right-margin-mm')).toHaveValue('8');

    // Verify legacy localStorage payload (without rightMarginMm) rehydrates cleanly to 0
    await page.evaluate(() => {
      const raw = localStorage.getItem('fnb-thermal-printer-device-config');
      const parsed = raw ? JSON.parse(raw) : { state: { config: {} }, version: 0 };
      delete parsed.state.config.rightMarginMm;
      parsed.state.config.leftMarginMm = 2;
      localStorage.setItem('fnb-thermal-printer-device-config', JSON.stringify(parsed));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: /Phiếu in/i }).click();
    await expect(page.getByTestId('input-printer-left-margin-mm')).toHaveValue('2');
    await expect(page.getByTestId('input-printer-right-margin-mm')).toHaveValue('0');

    expect(consoleErrors).toEqual([]);
  });
});

test('loads each bundled thermal font locally with Vietnamese glyphs and applies independent template defaults', async ({ page }) => {
  await setupMockApi(page);
  const fontRequests: string[] = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('.woff2')) fontRequests.push(url.href);
    if (url.protocol.startsWith('http') && !['127.0.0.1', 'localhost'].includes(url.hostname)) {
      await route.abort();
    } else {
      await route.fallback();
    }
  });
  await page.goto('/settings', { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /Phiếu in/i }).click();
  for (const [template, font] of Object.entries({ official: 'noto-sans', provisional: 'roboto', kitchen: 'roboto-mono', kitchenCancel: 'noto-sans', tableTransfer: 'roboto' })) {
    await page.getByTestId(`print-template-tab-${template}`).click();
    await expect(page.getByTestId('receipt-live-preview').locator('[data-thermal-font]').first()).toHaveAttribute('data-thermal-font', font);
    if (['official', 'provisional', 'kitchen'].includes(template)) {
      await page.evaluate(() => document.fonts.ready);
      await page.getByTestId('receipt-live-preview').screenshot({ path: `/tmp/thermal-font-preview-${template}.png` });
    }
  }
  await page.getByTestId('print-font-family-tableTransfer').click();
  await page.getByRole('option', { name: 'Be Vietnam Pro', exact: true }).click();
  const result = await page.evaluate(async () => {
    const { waitForThermalFont } = await import('/src/components/print-slips/thermal-font.util.ts');
    const { renderTicketPageToMonochrome } = await import('/src/components/print-slips/escpos-encoder.util.ts');
    const fonts = ['noto-sans', 'roboto', 'roboto-mono', 'be-vietnam-pro'] as const;
    for (const font of fonts) await waitForThermalFont(font);
    const ticket = document.querySelector('[data-testid="receipt-live-preview"] [data-thermal-font]') as HTMLElement;
    const raster = await renderTicketPageToMonochrome(ticket);
    const named = ['Noto Sans', 'Roboto', 'Roboto Mono', 'Be Vietnam Pro'];
    return {
      family: getComputedStyle(ticket).fontFamily,
      loaded: named.every((font) => [400, 700].every((weight) => document.fonts.check(`${weight} 16px "${font}"`, 'Mì cay Đặng Ắ ặ ễ ộ ự'))),
      ink: raster.monoBytes.some((byte) => byte !== 0),
    };
  });
  expect(result.family).toContain('Be Vietnam Pro');
  expect(result.loaded).toBe(true);
  expect(result.ink).toBe(true);
  expect(fontRequests.length).toBeGreaterThan(0);
  expect(fontRequests.every((url) => ['127.0.0.1', 'localhost'].includes(new URL(url).hostname))).toBe(true);
});
