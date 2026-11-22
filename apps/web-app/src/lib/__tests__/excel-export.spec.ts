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
});
