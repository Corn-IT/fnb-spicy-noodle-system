import { describe, expect, it, vi } from 'vitest';

import { buildXlsxBytes, fetchAllPaginated, parseExcelFile } from '../excel-export';

describe('excel-export utilities', () => {
  it('builds a valid PK-zip .xlsx byte payload with worksheet XML and inline strings', () => {
    const bytes = buildXlsxBytes(
      [
        { name: 'Mì Bò Mỹ', price: 45000, active: true },
        { name: 'Trà Đào', price: 25000, active: false },
      ],
      [
        { header: 'Tên món', key: 'name' },
        { header: 'Đơn giá', key: 'price' },
        { header: 'Đang bán', key: 'active' },
      ],
      'ThucDon',
    );

    // ZIP local file header magic bytes: PK\x03\x04
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);

    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain('xl/worksheets/sheet1.xml');
    expect(decoded).toContain('xl/styles.xml');
    expect(decoded).toContain('<borders count="2">');
    expect(decoded).toContain('applyBorder="1"');
    expect(decoded).toContain('s="1"');
    expect(decoded).toContain('s="2"');
    expect(decoded).toContain('Mì Bò Mỹ');
    expect(decoded).toContain('45000');
  });

  it('fetches every page cleanly in fetchAllPaginated', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: [1, 2], total: 5 })
      .mockResolvedValueOnce({ items: [3, 4], total: 5 })
      .mockResolvedValueOnce({ items: [5], total: 5 });

    const result = await fetchAllPaginated(fetchPage, 2);

    expect(result).toEqual([1, 2, 3, 4, 5]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 1, 2);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2, 2);
    expect(fetchPage).toHaveBeenNthCalledWith(3, 3, 2);
  });

  it('parses an exported .xlsx file back into header-keyed row records including blank cells', async () => {
    const bytes = buildXlsxBytes(
      [
        { stt: 1, name: 'Mì Bò Mỹ', subtitle: 'Cay cấp 0-7', price: 45000, status: 'Đang bán' },
        { stt: 2, name: 'Trà Đào', subtitle: '', price: 25000, status: 'Đang ẩn' },
      ],
      [
        { header: 'STT', key: 'stt' },
        { header: 'Tên món', key: 'name' },
        { header: 'Mô tả phụ', key: 'subtitle' },
        { header: 'Đơn giá', key: 'price' },
        { header: 'Trạng thái', key: 'status' },
      ],
      'ThucDon',
    );

    const parsed = await parseExcelFile(bytes);
    expect(parsed).toEqual([
      { STT: '1', 'Tên món': 'Mì Bò Mỹ', 'Mô tả phụ': 'Cay cấp 0-7', 'Đơn giá': '45000', 'Trạng thái': 'Đang bán' },
      { STT: '2', 'Tên món': 'Trà Đào', 'Mô tả phụ': '', 'Đơn giá': '25000', 'Trạng thái': 'Đang ẩn' },
    ]);
  });

  it('triggers xlsx Blob download in exportToExcel and handles sharedStrings, workbook rels, and malformed ZIP files', async () => {
    const { exportToExcel } = await import('../excel-export');
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:xlsx-url');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.fn();
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'a') {
        el.click = clickSpy;
      }
      return el;
    }) as typeof document.createElement);

    exportToExcel({
      filename: 'bao-cao-luong',
      sheetName: 'BangLuong',
      rows: [{ emp: 'NV01', total: 5000000 }],
      columns: [
        { header: 'Mã NV', key: 'emp' },
        { header: 'Tổng lương', key: 'total' },
      ],
    });
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:xlsx-url');

    // Invalid ZIP rejected cleanly
    await expect(parseExcelFile(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(/ZIP/);

    // Construct minimal stored ZIP containing sharedStrings + custom sheet path via workbook rels
    const makeStoredZip = (files: Array<{ name: string; content: string }>) => {
      const enc = new TextEncoder();
      const parts: Uint8Array[] = [];
      const central: Uint8Array[] = [];
      let offset = 0;

      for (const f of files) {
        const nameBytes = enc.encode(f.name);
        const dataBytes = enc.encode(f.content);
        const lh = new Uint8Array(30 + nameBytes.length);
        const lhv = new DataView(lh.buffer);
        lhv.setUint32(0, 0x04034b50, true);
        lhv.setUint16(26, nameBytes.length, true);
        lh.set(nameBytes, 30);
        parts.push(lh, dataBytes);

        const cd = new Uint8Array(46 + nameBytes.length);
        const cdv = new DataView(cd.buffer);
        cdv.setUint32(0, 0x02014b50, true);
        cdv.setUint32(20, dataBytes.length, true);
        cdv.setUint16(28, nameBytes.length, true);
        cdv.setUint32(42, offset, true);
        cd.set(nameBytes, 46);
        central.push(cd);

        offset += lh.length + dataBytes.length;
      }

      const centralSize = central.reduce((s, c) => s + c.length, 0);
      const eocd = new Uint8Array(22);
      const ev = new DataView(eocd.buffer);
      ev.setUint32(0, 0x06054b50, true);
      ev.setUint16(10, files.length, true);
      ev.setUint32(16, offset, true);

      const total = offset + centralSize + eocd.length;
      const out = new Uint8Array(total);
      let cur = 0;
      for (const p of [...parts, ...central, eocd]) {
        out.set(p, cur);
        cur += p.length;
      }
      return out;
    };

    const customZip = makeStoredZip([
      {
        name: 'xl/sharedStrings.xml',
        content: '<sst><si><t>Tên món</t></si><si><t>Bò Mỹ</t></si></sst>',
      },
      {
        name: 'xl/workbook.xml',
        content: '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Menu" r:id="rId9"/></sheets></workbook>',
      },
      {
        name: 'xl/_rels/workbook.xml.rels',
        content: '<Relationships><Relationship Id="rId9" Target="worksheets/custom2.xml"/></Relationships>',
      },
      {
        name: 'xl/worksheets/custom2.xml',
        content: '<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c></row><row><c r="A2" t="s"><v>1</v></c></row></sheetData></worksheet>',
      },
    ]);

    const parsedShared = await parseExcelFile(customZip.buffer);
    expect(parsedShared).toEqual([{ 'Tên món': 'Bò Mỹ' }]);

    const noSheetZip = makeStoredZip([{ name: 'xl/workbook.xml', content: '<workbook/>' }]);
    await expect(parseExcelFile(noSheetZip)).rejects.toThrow(/sheet/);
  });
});
