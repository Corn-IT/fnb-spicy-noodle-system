import { describe, expect, it } from 'vitest';
import {
  compareEmployeesForDisplay,
  compareMdmRecords,
  compareUsersForDisplay,
} from '../utils/display-order.util';

describe('display-order.util', () => {
  it('orders RBAC users logically: superadmin -> admin -> adminview -> thungan -> other staff', () => {
    const shuffled = [
      { id: 4, username: 'nhanvien1', isSuperAdmin: false, isActive: true, permissions: {} },
      { id: 3, username: 'thungan', isSuperAdmin: false, isActive: true, permissions: {} },
      { id: 2, username: 'admin', isSuperAdmin: false, isActive: true, permissions: {} },
      { id: 5, username: 'adminview', isSuperAdmin: false, isActive: true, permissions: {} },
      { id: 1, username: 'superadmin', isSuperAdmin: true, isActive: true, permissions: {} },
    ];

    const sorted = [...shuffled].sort(compareUsersForDisplay);
    expect(sorted.map((u) => u.username)).toEqual([
      'superadmin',
      'admin',
      'adminview',
      'thungan',
      'nhanvien1',
    ]);
  });

  it('orders employees by position hierarchy and account tier (Chủ -> Quản Lý admin -> Quản Lý adminview -> Thu Ngân -> Bếp -> Phục Vụ)', () => {
    const shuffled = [
      {
        id: 12,
        fullName: 'Bảo Trâm',
        position: { name: 'Nhân Viên Phục Vụ', metadata: { sortOrder: 8 } },
        specialty: { name: 'Phục Vụ Bàn', metadata: { sortOrder: 6 } },
        user: null,
      },
      {
        id: 5,
        fullName: 'Văn Hùng',
        position: { name: 'Bếp Trưởng Mì Cay', metadata: { sortOrder: 4 } },
        specialty: { name: 'Bếp Nấu (Mì Cay)', metadata: { sortOrder: 3 } },
        user: null,
      },
      {
        id: 3,
        fullName: 'Lê Thị Hương',
        position: { name: 'Quản Lý Cửa Hàng', metadata: { sortOrder: 2 } },
        specialty: { name: 'Quản Lý', metadata: { sortOrder: 1 } },
        user: { username: 'adminview', isSuperAdmin: false, isActive: true },
      },
      {
        id: 4,
        fullName: 'Trần Thị Lan',
        position: { name: 'Thu Ngân Quầy', metadata: { sortOrder: 3 } },
        specialty: { name: 'Thu Ngân', metadata: { sortOrder: 2 } },
        user: { username: 'thungan', isSuperAdmin: false, isActive: true },
      },
      {
        id: 2,
        fullName: 'Phạm Minh Tuấn',
        position: { name: 'Quản Lý Cửa Hàng', metadata: { sortOrder: 2 } },
        specialty: { name: 'Quản Lý', metadata: { sortOrder: 1 } },
        user: { username: 'admin', isSuperAdmin: false, isActive: true },
      },
      {
        id: 1,
        fullName: 'Nguyễn Minh Quân',
        position: { name: 'Chủ Cửa Hàng', metadata: { sortOrder: 1 } },
        specialty: { name: 'Quản Lý', metadata: { sortOrder: 1 } },
        user: { username: 'superadmin', isSuperAdmin: true, isActive: true },
      },
    ];

    const sorted = [...shuffled].sort(compareEmployeesForDisplay);
    expect(sorted.map((e) => e.fullName)).toEqual([
      'Nguyễn Minh Quân',
      'Phạm Minh Tuấn',
      'Lê Thị Hương',
      'Trần Thị Lan',
      'Văn Hùng',
      'Bảo Trâm',
    ]);
  });

  it('orders Master Data records by numeric metadata.sortOrder ascending before unsorted entries', () => {
    const shuffled = [
      { id: 10, name: 'Đồ Uống Nóng', metadata: {} },
      { id: 2, name: 'Quản Lý Cửa Hàng', metadata: { sortOrder: 2 } },
      { id: 1, name: 'Chủ Cửa Hàng', metadata: { sortOrder: 1 } },
      { id: 3, name: 'Bếp Trưởng', metadata: { sortOrder: 4 } },
    ];

    const sorted = [...shuffled].sort(compareMdmRecords);
    expect(sorted.map((r) => r.name)).toEqual([
      'Chủ Cửa Hàng',
      'Quản Lý Cửa Hàng',
      'Bếp Trưởng',
      'Đồ Uống Nóng',
    ]);
  });

  it('covers resolveUserAccountTier, fallback MDMs, and client-info.util IP/UA detection branches', async () => {
    const {
      compareEmployeesForDisplay: cmpEmp,
      compareUsersForDisplay: cmpUser,
      readMetadataSortOrder,
    } = await import('../utils/display-order.util');
    const { extractClientIpFromHeaders, normalizeIpAddress, parseDeviceLabel } = await import(
      '../security/client-info.util'
    );

    expect(readMetadataSortOrder(null)).toBeNull();
    expect(readMetadataSortOrder({ sortOrder: -2 })).toBeNull();
    expect(readMetadataSortOrder({ sortOrder: 3 })).toBe(3);

    const users = [
      { id: 10, username: 'mgr', isActive: true, permissions: { settings: { update: true } } },
      { id: 11, username: 'viewer', isActive: true, permissions: { payroll: { view: true } } },
      { id: 12, username: 'cashier02', isActive: false, permissions: { pos: { create: true } } },
      { id: 13, username: 'kitchen1', isActive: true, permissions: {} },
    ];
    expect(users.sort(cmpUser).map((u) => u.username)).toEqual([
      'mgr',
      'viewer',
      'cashier02',
      'kitchen1',
    ]);

    const emps = [
      { id: 20, fullName: 'B', isDeleted: true, position: { name: 'Phục Vụ' } },
      { id: 21, fullName: 'A', isDeleted: false, position: { name: 'Bếp Chiên' }, specialty: { name: 'Bếp Chiên' } },
      { id: 22, fullName: 'C', isDeleted: false, position: { name: 'Custom Role' } },
    ];
    expect(emps.sort(cmpEmp).map((e) => e.id)).toEqual([21, 22, 20]);

    expect(normalizeIpAddress(null)).toBe('unknown');
    expect(normalizeIpAddress('::ffff:192.168.1.9:4321')).toBe('192.168.1.9');
    expect(normalizeIpAddress('::1')).toBe('127.0.0.1');
    expect(extractClientIpFromHeaders({ 'x-real-ip': '203.0.113.9, 10.0.0.1' })).toBe('203.0.113.9');
    expect(extractClientIpFromHeaders({}, '127.0.0.1')).toBe('127.0.0.1');

    expect(parseDeviceLabel(undefined)).toBe('Không rõ thiết bị');
    expect(parseDeviceLabel('curl/8.4.0')).toBe('API Client');
    expect(parseDeviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) CriOS/120')).toBe('iPhone · Chrome');
    expect(parseDeviceLabel('Mozilla/5.0 (iPad; CPU OS 17_0) Firefox/120')).toBe('iPad · Firefox');
    expect(parseDeviceLabel('Mozilla/5.0 (Android 14) ZaloTheme/1.0')).toBe('Android · Zalo');
    expect(parseDeviceLabel('Mozilla/5.0 (Windows NT 10.0) Edg/120.0')).toBe('Windows · Edge');
    expect(parseDeviceLabel('Mozilla/5.0 (Macintosh; Mac OS X) Safari/605.1')).toBe('macOS · Safari');
    expect(parseDeviceLabel('Mozilla/5.0 (X11; Linux x86_64) coc_coc_browser/110')).toBe('Linux · Cốc Cốc');
    expect(parseDeviceLabel('CustomUA OPR/95 FBAV/1')).toBe('Thiết bị · Opera');
    expect(parseDeviceLabel('FBAN/Messenger')).toBe('Thiết bị · Facebook');
    expect(parseDeviceLabel('UnknownAgent/1.0')).toBe('Thiết bị · Trình duyệt');
  });
});
