export interface ExcelColumn<Row> {
  header: string;
  key?: keyof Row;
  value?: (row: Row, index: number) => string | number | boolean | null | undefined;
  width?: number;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toColumnRef(colIndex: number): string {
  let n = colIndex + 1;
  let ref = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    ref = String.fromCharCode(65 + rem) + ref;
    n = Math.floor((n - 1) / 26);
  }
  return ref;
}

function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[\\/*?:[\]]/g, ' ').trim();
  return (cleaned || 'DuLieu').slice(0, 31);
}

function buildWorksheetXml<Row>(
  rows: Row[],
  columns: ExcelColumn<Row>[],
): string {
  const encoder = new TextEncoder();
  const widths = columns.map((col) => {
    let maxChars = col.header.length;
    for (let r = 0; r < rows.length; r++) {
      const raw = col.value ? col.value(rows[r]!, r) : col.key ? (rows[r]![col.key] as unknown) : '';
      const str = raw == null ? '' : String(raw);
      if (str.length > maxChars) maxChars = str.length;
    }
    return col.width ?? Math.min(60, Math.max(10, Math.ceil(maxChars * 1.15) + 4));
  });

  const colsXml = widths
    .map((w, idx) => `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`)
    .join('');

  const headerCells = columns
    .map((col, idx) => {
      const ref = `${toColumnRef(idx)}1`;
      return `<c r="${ref}" t="inlineStr" s="1"><is><t xml:space="preserve">${escapeXml(col.header)}</t></is></c>`;
    })
    .join('');

  const dataRowsXml = rows
    .map((row, rIdx) => {
      const excelRowNum = rIdx + 2;
      const cells = columns
        .map((col, cIdx) => {
          const ref = `${toColumnRef(cIdx)}${excelRowNum}`;
          const raw = col.value ? col.value(row, rIdx) : col.key ? (row[col.key] as unknown) : '';
          if (raw == null || raw === '') {
            return `<c r="${ref}" t="inlineStr" s="2"><is><t></t></is></c>`;
          }
          if (typeof raw === 'number' && Number.isFinite(raw)) {
            return `<c r="${ref}" t="n" s="2"><v>${raw}</v></c>`;
          }
          if (typeof raw === 'boolean') {
            return `<c r="${ref}" t="inlineStr" s="2"><is><t>${raw ? 'Có' : 'Không'}</t></is></c>`;
          }
          const text = String(raw);
          void encoder;
          return `<c r="${ref}" t="inlineStr" s="2"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
        })
        .join('');
      return `<row r="${excelRowNum}">${cells}</row>`;
    })
    .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<cols>${colsXml}</cols>` +
    '<sheetData>' +
    `<row r="1">${headerCells}</row>` +
    dataRowsXml +
    '</sheetData>' +
    '</worksheet>'
  );
}

interface ZipEntryInput {
  name: string;
  data: Uint8Array;
}

function buildZipStore(entries: ZipEntryInput[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const crc = crc32(data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, data);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralSize = centralParts.reduce((acc, part) => acc + part.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalSize = offset + centralSize + eocd.length;
  const output = new Uint8Array(totalSize);
  let cursor = 0;
  for (const part of localParts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralParts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  output.set(eocd, cursor);
  return output;
}

export function buildXlsxBytes<Row>(
  rows: Row[],
  columns: ExcelColumn<Row>[],
  sheetName = 'DuLieu',
): Uint8Array {
  const encoder = new TextEncoder();
  const safeSheet = sanitizeSheetName(sheetName);
  const worksheetXml = buildWorksheetXml(rows, columns);

  const contentTypesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '</Types>';

  const rootRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  const workbookXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${escapeXml(safeSheet)}" sheetId="1" r:id="rId1"/></sheets>` +
    '</workbook>';

  const workbookRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';

  const stylesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2">' +
    '<font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="2">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '</fills>' +
    '<borders count="2">' +
    '<border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border>' +
    '<left style="thin"><color indexed="64"/></left>' +
    '<right style="thin"><color indexed="64"/></right>' +
    '<top style="thin"><color indexed="64"/></top>' +
    '<bottom style="thin"><color indexed="64"/></bottom>' +
    '<diagonal/>' +
    '</border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="3">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
    '</cellXfs>' +
    '</styleSheet>';

  return buildZipStore([
    { name: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { name: '_rels/.rels', data: encoder.encode(rootRelsXml) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRelsXml) },
    { name: 'xl/styles.xml', data: encoder.encode(stylesXml) },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(worksheetXml) },
  ]);
}

export function exportToExcel<Row>(options: {
  filename: string;
  sheetName?: string;
  rows: Row[];
  columns: ExcelColumn<Row>[];
}): void {
  const bytes = buildXlsxBytes(options.rows, options.columns, options.sheetName);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const finalName = options.filename.endsWith('.xlsx') ? options.filename : `${options.filename}.xlsx`;
  link.href = url;
  link.download = finalName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function fetchAllPaginated<Item>(
  fetchPage: (page: number, limit: number) => Promise<{ items: Item[]; total: number }>,
  limit = 100,
): Promise<Item[]> {
  const first = await fetchPage(1, limit);
  const all = [...first.items];
  const totalPages = Math.max(1, Math.ceil(first.total / limit));
  for (let page = 2; page <= totalPages; page++) {
    const res = await fetchPage(page, limit);
    all.push(...res.items);
  }
  return all;
}

interface ParsedZipEntry {
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
}

function parseZipDirectory(bytes: Uint8Array): Map<string, ParsedZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder('utf-8');

  let eocdOffset = -1;
  const minOffset = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('File không đúng định dạng .xlsx (không tìm thấy cấu trúc ZIP)');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  let cursor = view.getUint32(eocdOffset + 16, true);
  const entries = new Map<string, ParsedZipEntry>();

  for (let idx = 0; idx < totalEntries && cursor + 46 <= eocdOffset; idx++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) break;
    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);

    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLen));
    entries.set(name.replace(/\\/g, '/'), {
      compressionMethod,
      compressedSize,
      localHeaderOffset,
    });
    cursor += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

async function readZipEntryText(
  bytes: Uint8Array,
  entry: ParsedZipEntry,
): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = entry.localHeaderOffset;
  if (view.getUint32(offset, true) !== 0x04034b50) {
    throw new Error('Cấu trúc mục ZIP trong file .xlsx không hợp lệ');
  }
  const nameLen = view.getUint16(offset + 26, true);
  const extraLen = view.getUint16(offset + 28, true);
  const dataStart = offset + 30 + nameLen + extraLen;
  const rawSlice = bytes.subarray(dataStart, dataStart + entry.compressedSize);

  let decodedBytes: Uint8Array;
  if (entry.compressionMethod === 0) {
    decodedBytes = rawSlice;
  } else if (entry.compressionMethod === 8) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Trình duyệt không hỗ trợ giải nén DEFLATE');
    }
    const copy = new Uint8Array(rawSlice.byteLength);
    copy.set(rawSlice);
    const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const ab = await new Response(stream).arrayBuffer();
    decodedBytes = new Uint8Array(ab);
  } else {
    throw new Error(`Chuẩn nén ZIP (${entry.compressionMethod}) chưa được hỗ trợ`);
  }

  return new TextDecoder('utf-8').decode(decodedBytes);
}

function columnLettersToIndex(cellRef: string): number {
  const lettersMatch = /^([A-Za-z]+)/.exec(cellRef.trim());
  if (!lettersMatch) return -1;
  const letters = lettersMatch[1]!.toUpperCase();
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return col - 1;
}

export async function parseExcelFile(
  input: Blob | ArrayBuffer | Uint8Array,
): Promise<Record<string, string>[]> {
  const bytes =
    input instanceof Uint8Array
      ? input
      : input instanceof ArrayBuffer
        ? new Uint8Array(input)
        : new Uint8Array(await input.arrayBuffer());

  const entries = parseZipDirectory(bytes);
  const parser = new DOMParser();

  // Parse shared strings if present (Excel / Google Sheets default)
  const sharedStrings: string[] = [];
  const sharedEntry = entries.get('xl/sharedStrings.xml');
  if (sharedEntry) {
    const sharedXml = await readZipEntryText(bytes, sharedEntry);
    const sharedDoc = parser.parseFromString(sharedXml, 'application/xml');
    const siNodes = sharedDoc.getElementsByTagName('si');
    for (let i = 0; i < siNodes.length; i++) {
      const si = siNodes[i]!;
      const tNodes = si.getElementsByTagName('t');
      let text = '';
      for (let j = 0; j < tNodes.length; j++) {
        text += tNodes[j]?.textContent ?? '';
      }
      sharedStrings.push(text);
    }
  }

  // Determine first worksheet path
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const workbookEntry = entries.get('xl/workbook.xml');
  const relsEntry = entries.get('xl/_rels/workbook.xml.rels');
  if (workbookEntry && relsEntry) {
    const [wbDoc, relsDoc] = await Promise.all([
      readZipEntryText(bytes, workbookEntry).then((t) => parser.parseFromString(t, 'application/xml')),
      readZipEntryText(bytes, relsEntry).then((t) => parser.parseFromString(t, 'application/xml')),
    ]);
    const firstSheet = wbDoc.getElementsByTagName('sheet')[0];
    const relId =
      firstSheet?.getAttribute('r:id') ??
      firstSheet?.getAttributeNS(
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
        'id',
      );
    if (relId) {
      const rels = relsDoc.getElementsByTagName('Relationship');
      for (let i = 0; i < rels.length; i++) {
        const rel = rels[i]!;
        if (rel.getAttribute('Id') === relId) {
          const target = rel.getAttribute('Target')?.replace(/^\/+/, '');
          if (target) {
            sheetPath = target.startsWith('xl/') ? target : `xl/${target}`;
          }
          break;
        }
      }
    }
  }

  const sheetEntry =
    entries.get(sheetPath) ??
    entries.get('xl/worksheets/sheet1.xml') ??
    Array.from(entries.entries())
      .filter(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
      .sort(([a], [b]) => a.localeCompare(b))[0]?.[1];

  if (!sheetEntry) {
    throw new Error('Không tìm thấy sheet dữ liệu trong file Excel');
  }

  const sheetXml = await readZipEntryText(bytes, sheetEntry);
  const sheetDoc = parser.parseFromString(sheetXml, 'application/xml');
  const rowNodes = sheetDoc.getElementsByTagName('row');

  const matrix: string[][] = [];
  for (let r = 0; r < rowNodes.length; r++) {
    const rowEl = rowNodes[r]!;
    const cellNodes = rowEl.getElementsByTagName('c');
    const rowValues: string[] = [];
    let fallbackCol = 0;

    for (let c = 0; c < cellNodes.length; c++) {
      const cell = cellNodes[c]!;
      const ref = cell.getAttribute('r') ?? '';
      const colIdx = ref ? columnLettersToIndex(ref) : fallbackCol;
      fallbackCol = Math.max(colIdx + 1, fallbackCol + 1);
      if (colIdx < 0) continue;

      const cellType = cell.getAttribute('t');
      let value = '';
      if (cellType === 's') {
        const vText = cell.getElementsByTagName('v')[0]?.textContent ?? '';
        const idx = Number(vText);
        value = Number.isInteger(idx) && sharedStrings[idx] !== undefined ? sharedStrings[idx]! : '';
      } else if (cellType === 'inlineStr') {
        const tNodes = cell.getElementsByTagName('t');
        for (let j = 0; j < tNodes.length; j++) {
          value += tNodes[j]?.textContent ?? '';
        }
      } else {
        value = cell.getElementsByTagName('v')[0]?.textContent ?? '';
      }

      rowValues[colIdx] = value.trim();
    }
    matrix.push(rowValues);
  }

  if (matrix.length === 0) return [];
  const headerRow = matrix[0] ?? [];
  const headers = headerRow.map((h) => h.trim());
  if (!headers.some(Boolean)) return [];

  const records: Record<string, string>[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const obj: Record<string, string> = {};
    let hasAnyValue = false;
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      const val = (row[c] ?? '').trim();
      obj[key] = val;
      if (val !== '') hasAnyValue = true;
    }
    if (hasAnyValue) {
      records.push(obj);
    }
  }

  return records;
}
