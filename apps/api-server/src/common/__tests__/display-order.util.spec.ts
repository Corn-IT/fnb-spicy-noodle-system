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
});
