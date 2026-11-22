import { describe, expect, it } from 'vitest';

import { generateOfflineQrDataUrl } from '../qr-svg';

describe('qr-svg offline generator', () => {
  it('generates a valid SVG Data URL offline for table QR routing', async () => {
    const token = 'a'.repeat(64);
    const dataUrl = await generateOfflineQrDataUrl(`https://pos.micay.vn/qr/${token}`);

    expect(dataUrl.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    const decodedSvg = decodeURIComponent(dataUrl.slice('data:image/svg+xml;utf8,'.length));
    expect(decodedSvg).toContain('<svg');
    expect(decodedSvg).toContain('viewBox=');
  });
});
