import { getTicketFontFamily, resolveThermalFontFamily, waitForThermalFont } from './thermal-font.util';
import { DEFAULT_THERMAL_FONT_SIZE_PT, type ThermalPaperWidthDots } from '@fnb/shared';

export const ESC_POS_COMMANDS = {
  /** ESC @ — Initialize printer and reset formatting */
  INIT: new Uint8Array([0x1b, 0x40]),
  /** ESC p 0 50 250 — Kick 24V RJ11 Cash Drawer (Port 5 on iPOS iTP6, Pin 2, ~100ms pulse) */
  CASH_DRAWER_KICK: new Uint8Array([0x1b, 0x70, 0x00, 0x32, 0xfa]),
  /** GS L 0 0 — Reset hardware left margin to 0 dots */
  RESET_LEFT_MARGIN: new Uint8Array([0x1d, 0x4c, 0x00, 0x00]),
  /** ESC a 0 — Force left justification so RawBT / printer never centers GS v 0 rasters */
  ALIGN_LEFT: new Uint8Array([0x1b, 0x61, 0x00]),
  /** ESC d 4 — Legacy constant kept for reference; encoder only feeds when feedLinesBeforeCut > 0 */
  FEED_BEFORE_CUT: new Uint8Array([0x1b, 0x64, 0x04]),
  /** GS V 66 0 — Feed to cutter and partial auto-cut (standard ESC/POS auto-cutter) */
  AUTO_CUT_PARTIAL: new Uint8Array([0x1d, 0x56, 0x42, 0x00]),
} as const;

export interface EscPosEncodeOptions {
  paperWidthDots?: ThermalPaperWidthDots;
  kickCashDrawer?: boolean;
  maxBandHeight?: number;
  luminanceThreshold?: number;
  leftMarginMm?: number;
  rightMarginMm?: number;
  feedLinesBeforeCut?: number;
}

export interface ThermalPrintAreaMetrics {
  leftMarginDots: number;
  rightMarginDots: number;
  rasterWidthDots: number;
  contentWidthDots: number;
}

/**
 * Computes printable dot widths for ESC/POS raster rendering at 203 DPI (8 dots/mm).
 * Always keeps `rasterWidthDots` at the full `paperWidthDots` (576 or 384) and embeds
 * both `leftMarginDots` and `rightMarginDots` as explicit white pixels inside the canvas.
 * That way drivers such as RawBT USB never auto-scale or re-center narrower `GS v 0` bitmaps
 * and hardware `GS L` quirks cannot shift or clip the right edge.
 */
export function computeThermalPrintArea(
  paperWidthDots: ThermalPaperWidthDots = 576,
  leftMarginMm = 0,
  rightMarginMm = 0,
): ThermalPrintAreaMetrics {
  const clampedLeftMm = Number.isFinite(leftMarginMm) ? Math.max(0, Math.min(8, leftMarginMm)) : 0;
  const clampedRightMm = Number.isFinite(rightMarginMm) ? Math.max(0, Math.min(8, rightMarginMm)) : 0;
  const rasterWidthDots = Math.max(64, Math.floor(paperWidthDots / 8) * 8);
  const leftMarginDots = Math.round(clampedLeftMm * 8);
  const rightMarginDots = Math.round(clampedRightMm * 8);

  const contentWidthDots = Math.min(
    rasterWidthDots,
    Math.max(64, rasterWidthDots - leftMarginDots - rightMarginDots),
  );

  return {
    leftMarginDots,
    rightMarginDots,
    rasterWidthDots,
    contentWidthDots,
  };
}

/** Converts pt to thermal printer dots at 203 DPI (203 / 72 ≈ 2.8194 dots/pt). */
export function ptToThermalDots(pt: number): number {
  const safePt = Number.isFinite(pt) ? Math.max(6, Math.min(16, pt)) : DEFAULT_THERMAL_FONT_SIZE_PT;
  return Math.max(12, Math.round(safePt * (203 / 72)));
}

/** Builds GS L nL nH hardware left margin command (8 dots/mm at 203 DPI). */
export function buildLeftMarginCommand(leftMarginMm = 0): Uint8Array {
  const clampedMm = Number.isFinite(leftMarginMm) ? Math.max(0, Math.min(8, leftMarginMm)) : 0;
  const dots = Math.round(clampedMm * 8);
  return new Uint8Array([0x1d, 0x4c, dots & 0xff, (dots >> 8) & 0xff]);
}

/** Builds ESC d n paper feed command when lines > 0; returns empty buffer when 0. */
export function buildFeedLinesCommand(feedLinesBeforeCut = 0): Uint8Array {
  const lines = Number.isFinite(feedLinesBeforeCut)
    ? Math.max(0, Math.min(5, Math.floor(feedLinesBeforeCut)))
    : 0;
  if (lines === 0) return new Uint8Array(0);
  return new Uint8Array([0x1b, 0x64, lines]);
}

export function concatUint8Arrays(chunks: readonly Uint8Array[]): Uint8Array {
  let totalLength = 0;
  for (const chunk of chunks) {
    totalLength += chunk.byteLength;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.byteLength));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

/**
 * Builds a standalone ESC/POS command buffer that initializes the printer
 * and sends a 24V pulse to the RJ11 Cash Drawer port (Port 5 on iPOS iTP6).
 */
export function buildCashDrawerKickPayload(): Uint8Array {
  return concatUint8Arrays([
    ESC_POS_COMMANDS.INIT,
    ESC_POS_COMMANDS.CASH_DRAWER_KICK,
  ]);
}

/**
 * Converts RGBA pixel data (4 bytes/pixel) into 1-bit packed monochrome bytes (8 pixels/byte, MSB first).
 * Bit 1 = black thermal dot, Bit 0 = white paper.
 * Transparent pixels are composited onto a white background (#FFFFFF) first.
 */
export function rgbaToMonochrome1Bit(
  rgba: Uint8ClampedArray | Uint8Array,
  widthDots: number,
  heightDots: number,
  threshold = 165,
): Uint8Array {
  if (widthDots <= 0 || widthDots % 8 !== 0) {
    throw new Error(`widthDots must be a positive multiple of 8 (received ${widthDots})`);
  }
  const widthBytes = widthDots / 8;
  const mono = new Uint8Array(widthBytes * heightDots);

  for (let y = 0; y < heightDots; y += 1) {
    const rowByteOffset = y * widthBytes;
    const rowPixelOffset = y * widthDots * 4;

    for (let xByte = 0; xByte < widthBytes; xByte += 1) {
      let packedByte = 0;
      for (let bit = 0; bit < 8; bit += 1) {
        const pxIndex = rowPixelOffset + (xByte * 8 + bit) * 4;
        const r = rgba[pxIndex] ?? 255;
        const g = rgba[pxIndex + 1] ?? 255;
        const b = rgba[pxIndex + 2] ?? 255;
        const a = (rgba[pxIndex + 3] ?? 255) / 255;

        const blendedR = r * a + 255 * (1 - a);
        const blendedG = g * a + 255 * (1 - a);
        const blendedB = b * a + 255 * (1 - a);

        const luminance = 0.299 * blendedR + 0.587 * blendedG + 0.114 * blendedB;
        if (luminance < threshold) {
          packedByte |= 1 << (7 - bit);
        }
      }
      mono[rowByteOffset + xByte] = packedByte;
    }
  }

  return mono;
}

/**
 * Slices a 1-bit monochrome bitmap into horizontal ESC/POS `GS v 0` raster bands
 * (`0x1D 0x76 0x30 0x00 xL xH yL yH d1..dk`) of at most `maxBandHeight` rows.
 */
export function encodeMonochromeRasterBands(
  monoBytes: Uint8Array,
  widthDots: number,
  heightDots: number,
  maxBandHeight = 128,
): Uint8Array {
  if (widthDots <= 0 || widthDots % 8 !== 0) {
    throw new Error(`widthDots must be a positive multiple of 8 (received ${widthDots})`);
  }
  const widthBytes = widthDots / 8;
  const safeBandHeight = Math.max(1, Math.min(255, Math.floor(maxBandHeight)));
  const bands: Uint8Array[] = [];

  const xL = widthBytes & 0xff;
  const xH = (widthBytes >> 8) & 0xff;

  for (let startY = 0; startY < heightDots; startY += safeBandHeight) {
    const bandRows = Math.min(safeBandHeight, heightDots - startY);
    const yL = bandRows & 0xff;
    const yH = (bandRows >> 8) & 0xff;

    const sliceStart = startY * widthBytes;
    const sliceEnd = sliceStart + bandRows * widthBytes;
    const bandData = monoBytes.subarray(sliceStart, sliceEnd);

    const header = new Uint8Array([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH]);
    bands.push(header, bandData);
  }

  return concatUint8Arrays(bands);
}

interface TableCellSpec {
  lines: Array<{ text: string; bold: boolean; scale: number }>;
  align: 'left' | 'center' | 'right';
}

interface TableRowSpec {
  isHeader: boolean;
  cells: TableCellSpec[];
}

interface TicketVisualLine {
  kind: 'heading' | 'subheading' | 'banner' | 'pair' | 'text' | 'divider' | 'qr' | 'table';
  leftText?: string;
  rightText?: string;
  scale?: number;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  qrImg?: HTMLImageElement | null;
  tableColPercents?: number[];
  tableRows?: TableRowSpec[];
}

function parseScaleAttr(el: Element, fallback: number): number {
  const raw = el.getAttribute('data-print-scale');
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0.4 && parsed <= 2.5 ? parsed : fallback;
}

function parseAlignAttr(el: Element, fallback: 'left' | 'center' | 'right'): 'left' | 'center' | 'right' {
  const raw = el.getAttribute('data-print-align');
  if (raw === 'left' || raw === 'center' || raw === 'right') return raw;
  return fallback;
}

function extractTableSpec(tableEl: Element): TicketVisualLine | null {
  const rows: TableRowSpec[] = [];
  let colPercents: number[] = [];

  const headerCells = Array.from(tableEl.querySelectorAll('thead tr th, thead tr td'));
  if (headerCells.length > 0) {
    colPercents = headerCells.map((cell) => {
      const w = Number(cell.getAttribute('data-print-col-width'));
      return Number.isFinite(w) && w > 0 ? w : 0;
    });
  }

  const trList = Array.from(tableEl.querySelectorAll('tr'));
  for (const tr of trList) {
    const isHeader = Boolean(tr.closest('thead')) || tr.querySelectorAll('th').length > 0;
    const cellEls = Array.from(tr.children).filter(
      (c) => c.tagName === 'TH' || c.tagName === 'TD',
    );
    if (cellEls.length === 0) continue;

    const cells: TableCellSpec[] = cellEls.map((cellEl) => {
      const align = parseAlignAttr(cellEl, isHeader ? 'left' : 'left');
      const directChildren = Array.from(cellEl.children);
      const cellLines: Array<{ text: string; bold: boolean; scale: number }> = [];

      if (directChildren.length > 0) {
        for (const child of directChildren) {
          const text = (child.textContent ?? '').trim();
          if (!text) continue;
          const bold =
            isHeader ||
            child.hasAttribute('data-print-bold') ||
            (typeof child.className === 'string' && /font-(bold|extrabold|black)/.test(child.className));
          const scale = parseScaleAttr(child, isHeader ? 0.9 : 1);
          cellLines.push({ text, bold, scale });
        }
      } else {
        const text = (cellEl.textContent ?? '').trim();
        if (text) {
          const bold =
            isHeader ||
            cellEl.hasAttribute('data-print-bold') ||
            (typeof cellEl.className === 'string' && /font-(bold|extrabold|black)/.test(cellEl.className));
          cellLines.push({ text, bold, scale: parseScaleAttr(cellEl, isHeader ? 0.9 : 1) });
        }
      }

      return { lines: cellLines, align };
    });

    rows.push({ isHeader, cells });
  }

  if (rows.length === 0) return null;

  const colCount = rows[0]!.cells.length;
  const totalSpecified = colPercents.reduce((s, v) => s + v, 0);
  if (colPercents.length !== colCount || totalSpecified <= 0) {
    colPercents = Array.from({ length: colCount }, () => 100 / colCount);
  }

  return {
    kind: 'table',
    tableColPercents: colPercents,
    tableRows: rows,
  };
}

/**
 * Extracts a structured sequence of visual lines, bordered tables, and QR images from a `.ticket-page` DOM node.
 * Prefers explicit `data-print-*` attributes and falls back to Tailwind class heuristics for legacy slips.
 */
function extractTicketVisualLines(ticketEl: HTMLElement): TicketVisualLine[] {
  const lines: TicketVisualLine[] = [];

  const walk = (el: Element) => {
    const printKind = el.getAttribute('data-print-kind');

    if (printKind === 'table' || el.tagName === 'TABLE') {
      const tableSpec = extractTableSpec(el);
      if (tableSpec) lines.push(tableSpec);
      return;
    }

    if (printKind === 'divider') {
      lines.push({ kind: 'divider' });
      return;
    }

    if (printKind === 'qr' && el instanceof HTMLImageElement) {
      lines.push({ kind: 'qr', qrImg: el });
      return;
    }

    if (el instanceof HTMLImageElement) {
      const testId = el.getAttribute('data-testid') ?? '';
      if (testId.includes('vietqr') || el.alt.toLowerCase().includes('vietqr') || el.height >= 80) {
        lines.push({ kind: 'qr', qrImg: el });
      }
      return;
    }

    const children = Array.from(el.children);

    if (printKind === 'banner') {
      const text = (el.textContent ?? '').trim();
      if (text) {
        lines.push({
          kind: 'banner',
          leftText: text,
          scale: parseScaleAttr(el, 1.05),
          bold: true,
        });
      }
      return;
    }

    if (printKind === 'pair' && children.length >= 2) {
      const left = (children[0]?.textContent ?? '').trim();
      const right = (children[1]?.textContent ?? '').trim();
      if (left || right) {
        lines.push({
          kind: 'pair',
          leftText: left,
          rightText: right,
          scale: parseScaleAttr(el, 1),
          bold: el.hasAttribute('data-print-bold'),
        });
      }
      return;
    }

    if (printKind === 'heading' || printKind === 'text') {
      const text = (el.textContent ?? '').trim();
      if (text) {
        lines.push({
          kind: printKind,
          leftText: text,
          scale: parseScaleAttr(el, printKind === 'heading' ? 1.4 : 1),
          bold: printKind === 'heading' || el.hasAttribute('data-print-bold'),
          align: parseAlignAttr(el, printKind === 'heading' ? 'center' : 'left'),
        });
      }
      return;
    }

    // Legacy class-based fallback for slips without explicit data-print-* attributes
    const className = typeof el.className === 'string' ? el.className : '';

    if (className.includes('border-2') && children.length === 0) {
      const text = (el.textContent ?? '').trim();
      if (text) {
        lines.push({ kind: 'banner', leftText: text, scale: 1.05, bold: true });
      }
      return;
    }

    if (
      className.includes('justify-between') &&
      children.length === 2 &&
      children.every((c) => c.children.length === 0)
    ) {
      const left = (children[0]?.textContent ?? '').trim();
      const right = (children[1]?.textContent ?? '').trim();
      if (left || right) {
        lines.push({
          kind: 'pair',
          leftText: left,
          rightText: right,
          scale: 1,
          bold: /font-(bold|extrabold|black)/.test(className),
        });
      }
      if (className.includes('border-b')) {
        lines.push({ kind: 'divider' });
      }
      return;
    }

    if (children.length === 0) {
      const text = (el.textContent ?? '').trim();
      if (!text) return;
      if (className.includes('text-base') || className.includes('text-lg') || className.includes('text-xl')) {
        lines.push({ kind: 'heading', leftText: text, scale: 1.4, bold: true, align: 'center' });
      } else if (/font-(bold|extrabold|black)/.test(className)) {
        lines.push({ kind: 'subheading', leftText: text, scale: 1, bold: true, align: 'left' });
      } else {
        lines.push({ kind: 'text', leftText: text, scale: 0.9, bold: false, align: 'left' });
      }
      if (className.includes('border-b')) {
        lines.push({ kind: 'divider' });
      }
      return;
    }

    if (className.includes('border-t')) {
      lines.push({ kind: 'divider' });
    }

    for (const child of children) {
      walk(child);
    }

    if (className.includes('border-b')) {
      lines.push({ kind: 'divider' });
    }
  };

  walk(ticketEl);

  if (lines.length === 0) {
    const fallbackText = (ticketEl.textContent ?? '').trim();
    if (fallbackText) {
      lines.push({ kind: 'text', leftText: fallbackText, scale: 1, bold: false, align: 'left' });
    }
  }

  return lines;
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const result: string[] = [];
  let current = words[0]!;

  const measure = (s: string) =>
    typeof ctx.measureText === 'function' ? ctx.measureText(s).width : s.length * 11;

  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${current} ${words[i]}`;
    if (measure(candidate) <= maxWidth) {
      current = candidate;
    } else {
      result.push(current);
      current = words[i]!;
    }
  }
  result.push(current);
  return result;
}

function layoutAndDrawLines(
  ctx: CanvasRenderingContext2D,
  visualLines: TicketVisualLine[],
  contentWidth: number,
  baseDots: number,
  draw: boolean,
  offsetX = 0,
  fontFamily = 'monospace',
): number {
  const paddingX = offsetX;
  const rightEdgeX = paddingX + contentWidth;
  const centerX = paddingX + contentWidth / 2;
  let cursorY = 4;

  const setFont = (scale: number, bold: boolean) => {
    const px = Math.max(10, Math.round(baseDots * scale));
    ctx.font = `${bold ? 'bold ' : ''}${px}px ${fontFamily}`;
    return px;
  };

  for (const line of visualLines) {
    if (line.kind === 'divider') {
      cursorY += 3;
      if (draw) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        if (typeof ctx.setLineDash === 'function') ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(paddingX, cursorY);
        ctx.lineTo(rightEdgeX, cursorY);
        ctx.stroke();
        if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);
      }
      cursorY += 5;
      continue;
    }

    if (line.kind === 'banner' && line.leftText) {
      const px = setFont(line.scale ?? 1.05, true);
      const bannerHeight = Math.round(px * 1.6);
      if (draw) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(paddingX, cursorY, contentWidth, bannerHeight);
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(line.leftText, centerX, cursorY + Math.round((bannerHeight - px) / 2), contentWidth - 8);
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'left';
      }
      cursorY += bannerHeight + 6;
      continue;
    }

    if (line.kind === 'heading' && line.leftText) {
      const px = setFont(line.scale ?? 1.4, true);
      const lh = Math.round(px * 1.22);
      const wrapped = wrapTextLines(ctx, line.leftText, contentWidth);
      if (draw) {
        ctx.textAlign = line.align ?? 'center';
        const x = line.align === 'left' ? paddingX : line.align === 'right' ? rightEdgeX : centerX;
        for (const w of wrapped) {
          ctx.fillText(w, x, cursorY, contentWidth);
          cursorY += lh;
        }
        ctx.textAlign = 'left';
      } else {
        cursorY += wrapped.length * lh;
      }
      continue;
    }

    if (line.kind === 'pair') {
      const px = setFont(line.scale ?? 1, line.bold ?? true);
      const lh = Math.round(px * 1.25);
      const left = line.leftText ?? '';
      const right = line.rightText ?? '';
      const leftMaxW = Math.floor(contentWidth * 0.68);
      const rightMaxW = Math.floor(contentWidth * 0.30);
      const leftWrapped = wrapTextLines(ctx, left, leftMaxW);

      if (draw) {
        ctx.textAlign = 'left';
        leftWrapped.forEach((w, idx) => {
          ctx.fillText(w, paddingX, cursorY + idx * lh, leftMaxW);
        });
        ctx.textAlign = 'right';
        ctx.fillText(right, rightEdgeX, cursorY, rightMaxW);
        ctx.textAlign = 'left';
      }
      cursorY += Math.max(1, leftWrapped.length) * lh;
      continue;
    }

    if ((line.kind === 'subheading' || line.kind === 'text') && line.leftText) {
      const px = setFont(line.scale ?? (line.kind === 'subheading' ? 1 : 0.9), line.bold ?? line.kind === 'subheading');
      const lh = Math.round(px * 1.25);
      const wrapped = wrapTextLines(ctx, line.leftText, contentWidth);
      if (draw) {
        const align = line.align ?? 'left';
        ctx.textAlign = align;
        const x = align === 'center' ? centerX : align === 'right' ? rightEdgeX : paddingX;
        for (const w of wrapped) {
          ctx.fillText(w, x, cursorY, contentWidth);
          cursorY += lh;
        }
        ctx.textAlign = 'left';
      } else {
        cursorY += wrapped.length * lh;
      }
      continue;
    }

    if (line.kind === 'table' && line.tableRows && line.tableColPercents) {
      const colWidths = line.tableColPercents.map((pct) => Math.floor((contentWidth * pct) / 100));
      // Adjust last column to absorb rounding remainder so right border aligns flush
      const sumW = colWidths.reduce((s, w) => s + w, 0);
      if (colWidths.length > 0) {
        colWidths[colWidths.length - 1] = (colWidths[colWidths.length - 1] ?? 0) + (contentWidth - sumW);
      }

      const cellPadX = 4;
      const cellPadY = 4;
      const tableStartY = cursorY;

      for (const row of line.tableRows) {
        // Measure all cells in this row
        const measuredCells = row.cells.map((cell, colIdx) => {
          const colW = Math.max(16, (colWidths[colIdx] ?? 40) - cellPadX * 2);
          const renderedLines: Array<{ text: string; px: number; lh: number; bold: boolean }> = [];
          let totalH = 0;
          for (const cl of cell.lines) {
            const px = setFont(cl.scale, cl.bold);
            const lh = Math.round(px * 1.22);
            const wrapped = wrapTextLines(ctx, cl.text, colW);
            for (const w of wrapped) {
              renderedLines.push({ text: w, px, lh, bold: cl.bold });
              totalH += lh;
            }
          }
          return { align: cell.align, renderedLines, totalH };
        });

        const rowHeight = Math.max(
          Math.round(baseDots * 1.3) + cellPadY * 2,
          ...measuredCells.map((c) => c.totalH + cellPadY * 2),
        );

        if (draw) {
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1.5;
          // Draw row top & bottom horizontal lines
          ctx.beginPath();
          ctx.moveTo(paddingX, cursorY);
          ctx.lineTo(rightEdgeX, cursorY);
          ctx.moveTo(paddingX, cursorY + rowHeight);
          ctx.lineTo(rightEdgeX, cursorY + rowHeight);
          ctx.stroke();

          let colX = paddingX;
          measuredCells.forEach((cell, colIdx) => {
            const cw = colWidths[colIdx] ?? 40;
            let textY = cursorY + cellPadY;
            for (const rl of cell.renderedLines) {
              ctx.font = `${rl.bold ? 'bold ' : ''}${rl.px}px ${fontFamily}`;
              ctx.textAlign = cell.align;
              const tx =
                cell.align === 'right'
                  ? colX + cw - cellPadX
                  : cell.align === 'center'
                    ? colX + cw / 2
                    : colX + cellPadX;
              ctx.fillText(rl.text, tx, textY, cw - cellPadX * 2);
              textY += rl.lh;
            }
            colX += cw;
          });
          ctx.textAlign = 'left';
        }

        cursorY += rowHeight;
      }

      if (draw) {
        // Draw vertical borders across the entire table
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        let colX = paddingX;
        ctx.beginPath();
        ctx.moveTo(colX + 0.75, tableStartY);
        ctx.lineTo(colX + 0.75, cursorY);
        for (const cw of colWidths) {
          colX += cw;
          const xLine = Math.min(rightEdgeX - 0.75, colX);
          ctx.moveTo(xLine, tableStartY);
          ctx.lineTo(xLine, cursorY);
        }
        ctx.stroke();
      }
      cursorY += 4;
      continue;
    }

    if (line.kind === 'qr') {
      const qrSize = Math.min(220, contentWidth);
      const qrX = paddingX + Math.floor((contentWidth - qrSize) / 2);
      if (draw) {
        if (!line.qrImg || !line.qrImg.complete || line.qrImg.naturalWidth === 0) {
          throw new Error('Không thể dựng mã QR lên phiếu in: ảnh QR chưa tải xong hoặc không hợp lệ.');
        }
        ctx.drawImage(line.qrImg, qrX, cursorY, qrSize, qrSize);
      }
      cursorY += qrSize + 8;
    }
  }

  return cursorY + 4;
}

async function waitForQrImage(image: HTMLImageElement): Promise<void> {
  if (image.complete && image.naturalWidth > 0) return;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let removeListeners = () => {};
  const failure = () => new Error('Không thể dựng mã QR lên phiếu in: ảnh QR chưa tải xong hoặc không hợp lệ.');
  try {
    const ready = typeof image.decode === 'function' ? image.decode() : new Promise<void>((resolve, reject) => {
      if (image.complete) { reject(failure()); return; }
      const onLoad = () => image.naturalWidth > 0 ? resolve() : reject(failure());
      const onError = () => reject(failure());
      image.addEventListener('load', onLoad, { once: true });
      image.addEventListener('error', onError, { once: true });
      removeListeners = () => { image.removeEventListener('load', onLoad); image.removeEventListener('error', onError); };
    });
    await Promise.race([ready, new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(failure()), 10000);
    })]);
    if (!image.complete || image.naturalWidth === 0) throw failure();
  } catch {
    throw failure();
  } finally {
    clearTimeout(timeout);
    removeListeners();
  }
}

/**
 * Renders a single `.ticket-page` DOM element into a 1-bit monochrome bitmap array.
 * Throws a clear error if canvas pixel reading fails (e.g. tainted canvas) instead of printing garbage noise.
 */
export async function renderTicketPageToMonochrome(
  ticketEl: HTMLElement,
  widthDots: ThermalPaperWidthDots | number = 576,
  luminanceThreshold = 165,
  contentWidthDots?: number,
  leftMarginDots = 0,
): Promise<{ monoBytes: Uint8Array; widthDots: number; heightDots: number }> {
  const safeRasterWidth = Math.max(64, Math.floor(widthDots / 8) * 8);
  const safeContentWidth = Math.min(
    safeRasterWidth,
    Math.max(64, Math.round(contentWidthDots ?? safeRasterWidth)),
  );
  const safeOffsetX = Math.max(
    0,
    Math.min(safeRasterWidth - safeContentWidth, Math.round(leftMarginDots)),
  );
  const font = getTicketFontFamily(ticketEl);
  await waitForThermalFont(font);
  const fontFamily = resolveThermalFontFamily(font);
  const visualLines = extractTicketVisualLines(ticketEl);
  const rawPt = Number(ticketEl.getAttribute('data-font-size-pt'));
  const baseDots = ptToThermalDots(
    Number.isFinite(rawPt) && rawPt > 0 ? rawPt : DEFAULT_THERMAL_FONT_SIZE_PT,
  );

  const isUnmockedJsdom =
    typeof navigator !== 'undefined' &&
    /jsdom/i.test(navigator.userAgent) &&
    typeof HTMLCanvasElement !== 'undefined' &&
    !('mock' in HTMLCanvasElement.prototype.getContext);

  if (typeof document !== 'undefined' && !isUnmockedJsdom) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx && typeof ctx.getImageData === 'function') {
      await Promise.all(visualLines.filter((line) => line.kind === 'qr').map((line) => {
        if (!line.qrImg) throw new Error('Không tìm thấy ảnh QR trên phiếu in.');
        return waitForQrImage(line.qrImg);
      }));
      canvas.width = safeRasterWidth;
      // Pass 1: measure exact height
      const measuredHeight = Math.max(
        32,
        layoutAndDrawLines(ctx, visualLines, safeContentWidth, baseDots, false, safeOffsetX, fontFamily),
      );
      canvas.height = measuredHeight;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, safeRasterWidth, measuredHeight);
      ctx.fillStyle = '#000000';
      ctx.textBaseline = 'top';

      // Pass 2: draw onto sized canvas
      layoutAndDrawLines(ctx, visualLines, safeContentWidth, baseDots, true, safeOffsetX, fontFamily);

      let imageData: ImageData;
      try {
        imageData = ctx.getImageData(0, 0, safeRasterWidth, measuredHeight);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Không thể dựng ảnh phiếu in nhiệt (canvas bị chặn đọc dữ liệu ảnh): ${detail}`,
        );
      }

      const monoBytes = rgbaToMonochrome1Bit(
        imageData.data,
        safeRasterWidth,
        measuredHeight,
        luminanceThreshold,
      );
      return {
        monoBytes,
        widthDots: safeRasterWidth,
        heightDots: measuredHeight,
      };
    }
  }

  // Test-only JSDOM minimal raster (when HTMLCanvasElement 2D is unimplemented in JSDOM)
  const syntheticRows = Math.max(16, visualLines.length * 8);
  const widthBytes = safeRasterWidth / 8;
  const monoBytes = new Uint8Array(widthBytes * syntheticRows);
  return {
    monoBytes,
    widthDots: safeRasterWidth,
    heightDots: syntheticRows,
  };
}

/**
 * Encodes all `.ticket-page` slips inside `#thermal-print-container` into a single
 * ESC/POS binary command stream:
 *   1. `ESC @` (Init)
 *   2. `GS L nL nH` (Left margin calibration, default 0mm = 0 dots)
 *   3. Optional `ESC p 0 50 250` (24V RJ11 Cash Drawer kick when `kickCashDrawer` is true)
 *   4. For each `.ticket-page`:
 *      - `GS v 0` banded monochrome raster images (width narrowed by left/right margins)
 *      - Optional `ESC d n` paper feed ONLY when `feedLinesBeforeCut > 0`
 *      - `GS V 66 0` automatic paper cutter command
 */
export async function encodeThermalContainerToEscPos(
  containerEl: HTMLElement,
  options: EscPosEncodeOptions = {},
): Promise<Uint8Array> {
  const paperWidthDots: ThermalPaperWidthDots = options.paperWidthDots ?? 576;
  const maxBandHeight = options.maxBandHeight ?? 128;
  const luminanceThreshold = options.luminanceThreshold ?? 165;
  const leftMarginMm = options.leftMarginMm ?? 0;
  const rightMarginMm = options.rightMarginMm ?? 0;
  const feedCmd = buildFeedLinesCommand(options.feedLinesBeforeCut ?? 0);
  const { leftMarginDots, rasterWidthDots, contentWidthDots } = computeThermalPrintArea(
    paperWidthDots,
    leftMarginMm,
    rightMarginMm,
  );

  const ticketNodeList = containerEl.querySelectorAll<HTMLElement>('.ticket-page');
  const ticketElements: HTMLElement[] =
    ticketNodeList.length > 0 ? Array.from(ticketNodeList) : [containerEl];

  const chunks: Uint8Array[] = [
    ESC_POS_COMMANDS.INIT,
    ESC_POS_COMMANDS.RESET_LEFT_MARGIN,
    ESC_POS_COMMANDS.ALIGN_LEFT,
  ];

  if (options.kickCashDrawer) {
    chunks.push(ESC_POS_COMMANDS.CASH_DRAWER_KICK);
  }

  for (const ticketEl of ticketElements) {
    const { monoBytes, widthDots: actualWidthDots, heightDots } =
      await renderTicketPageToMonochrome(
        ticketEl,
        rasterWidthDots,
        luminanceThreshold,
        contentWidthDots,
        leftMarginDots,
      );
    const rasterBands = encodeMonochromeRasterBands(
      monoBytes,
      actualWidthDots,
      heightDots,
      maxBandHeight,
    );
    chunks.push(rasterBands);
    if (feedCmd.byteLength > 0) {
      chunks.push(feedCmd);
    }
    chunks.push(ESC_POS_COMMANDS.AUTO_CUT_PARTIAL);
  }

  return concatUint8Arrays(chunks);
}
