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

  test('renders left & right margin controls cleanly, persists across reload/legacy storage, and narrows real Chrome ESC/POS raster', async ({ page }) => {
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

    // Verify real ESC/POS binary bytes: GS L 0 0 and GS v 0 width = 68 bytes (544 dots = 576 - 32)
    const firstPayload = capturedPayloads[0]!;
    const hasGsL0 = firstPayload.some(
      (_b, i) => firstPayload[i] === 0x1d && firstPayload[i + 1] === 0x4c && firstPayload[i + 2] === 0 && firstPayload[i + 3] === 0,
    );
    const hasGsV0Width68 = firstPayload.some(
      (_b, i) =>
        firstPayload[i] === 0x1d &&
        firstPayload[i + 1] === 0x76 &&
        firstPayload[i + 2] === 0x30 &&
        firstPayload[i + 3] === 0x00 &&
        firstPayload[i + 4] === 68 &&
        firstPayload[i + 5] === 0,
    );
    expect(hasGsL0).toBe(true);
    expect(hasGsV0Width68).toBe(true);

    // Now test left=3mm (24 dots) + right=2mm (16 dots) => GS L 24 0 and GS v 0 width = 67 bytes (536 dots = 576 - 40)
    await leftInput.fill('3');
    await rightInput.fill('2');
    await page.getByTestId('btn-test-thermal-print').click();
    await expect.poll(() => capturedPayloads.length).toBe(2);

    const secondPayload = capturedPayloads[1]!;
    const hasGsL24 = secondPayload.some(
      (_b, i) => secondPayload[i] === 0x1d && secondPayload[i + 1] === 0x4c && secondPayload[i + 2] === 24 && secondPayload[i + 3] === 0,
    );
    const hasGsV0Width67 = secondPayload.some(
      (_b, i) =>
        secondPayload[i] === 0x1d &&
        secondPayload[i + 1] === 0x76 &&
        secondPayload[i + 2] === 0x30 &&
        secondPayload[i + 3] === 0x00 &&
        secondPayload[i + 4] === 67 &&
        secondPayload[i + 5] === 0,
    );
    expect(hasGsL24).toBe(true);
    expect(hasGsV0Width67).toBe(true);

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
