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
});
