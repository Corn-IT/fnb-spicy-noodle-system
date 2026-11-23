/**
 * Decodes ESC/POS GS v 0 monochrome raster bands back into RGBA pixel buffers
 * so Playwright tests can inspect thermal slips as PNGs and decode VietQR with jsQR.
 */
export interface DecodedRasterSlip {
  widthDots: number;
  heightDots: number;
  rgba: Uint8ClampedArray;
}

export function decodeEscPosRasterSlips(bytes: Uint8Array): DecodedRasterSlip[] {
  const slips: DecodedRasterSlip[] = [];
  let currentWidthDots = 0;
  let currentBands: Uint8Array[] = [];
  let currentHeight = 0;

  const flushSlip = () => {
    if (currentBands.length === 0 || currentWidthDots === 0 || currentHeight === 0) return;
    const widthBytes = currentWidthDots / 8;
    const rgba = new Uint8ClampedArray(currentWidthDots * currentHeight * 4);
    let rowIdx = 0;
    for (const band of currentBands) {
      const bandRows = Math.floor(band.length / widthBytes);
      for (let y = 0; y < bandRows; y += 1) {
        for (let xb = 0; xb < widthBytes; xb += 1) {
          const byte = band[y * widthBytes + xb] ?? 0;
          for (let bit = 0; bit < 8; bit += 1) {
            const isBlack = (byte & (1 << (7 - bit))) !== 0;
            const px = ((rowIdx + y) * currentWidthDots + (xb * 8 + bit)) * 4;
            const val = isBlack ? 0 : 255;
            rgba[px] = val;
            rgba[px + 1] = val;
            rgba[px + 2] = val;
            rgba[px + 3] = 255;
          }
        }
      }
      rowIdx += bandRows;
    }
    slips.push({ widthDots: currentWidthDots, heightDots: currentHeight, rgba });
    currentWidthDots = 0;
    currentBands = [];
    currentHeight = 0;
  };

  let i = 0;
  while (i < bytes.length) {
    // GS v 0 m xL xH yL yH d1..dk
    if (bytes[i] === 0x1d && bytes[i + 1] === 0x76 && bytes[i + 2] === 0x30) {
      const xL = bytes[i + 4] ?? 0;
      const xH = bytes[i + 5] ?? 0;
      const yL = bytes[i + 6] ?? 0;
      const yH = bytes[i + 7] ?? 0;
      const widthBytes = xL + (xH << 8);
      const bandRows = yL + (yH << 8);
      const dataLen = widthBytes * bandRows;
      const start = i + 8;
      const end = Math.min(bytes.length, start + dataLen);
      currentWidthDots = widthBytes * 8;
      currentBands.push(bytes.subarray(start, end));
      currentHeight += bandRows;
      i = end;
      continue;
    }

    // GS V 66 n (cut) -> end of slip
    if (bytes[i] === 0x1d && bytes[i + 1] === 0x56 && bytes[i + 2] === 0x42) {
      flushSlip();
      i += 4;
      continue;
    }

    i += 1;
  }

  flushSlip();
  return slips;
}
