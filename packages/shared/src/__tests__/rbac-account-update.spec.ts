import { describe, expect, it } from 'vitest';
import {
  CreateUserSchema,
  resolveUserRoleDisplay,
  UpdateUserAccountSchema,
} from '../schemas/rbac.schema';

describe('UpdateUserAccountSchema & resolveUserRoleDisplay', () => {
  it('should reject an empty update payload and unknown fields', () => {
    expect(UpdateUserAccountSchema.safeParse({}).success).toBe(false);
    expect(UpdateUserAccountSchema.safeParse({ unknownField: true }).success).toBe(false);
  });

  it('should reject invalid username length and overlong roleLabel', () => {
    expect(UpdateUserAccountSchema.safeParse({ username: 'ab' }).success).toBe(false);
    expect(UpdateUserAccountSchema.safeParse({ roleLabel: 'a'.repeat(65) }).success).toBe(false);
  });

  it('should normalize empty roleLabel strings to null and trim valid values', () => {
    const cleared = UpdateUserAccountSchema.parse({ roleLabel: '   ' });
    expect(cleared.roleLabel).toBeNull();

    const custom = UpdateUserAccountSchema.parse({
      employeeId: 12,
      username: '  thungan02  ',
      roleLabel: '  Quản lý chỉ xem  ',
      isActive: true,
    });
    expect(custom).toEqual({
      employeeId: 12,
      username: 'thungan02',
      roleLabel: 'Quản lý chỉ xem',
      isActive: true,
    });

    const created = CreateUserSchema.parse({
      employeeId: 5,
      username: 'staff01',
      password: 'Password@123',
      roleLabel: '   ',
    });
    expect(created.roleLabel).toBeNull();
  });

  it('should resolve role display with precedence Super Admin > roleLabel > positionName > Nhân viên', () => {
    expect(
      resolveUserRoleDisplay({
        isSuperAdmin: true,
        roleLabel: 'Tuỳ chỉnh',
        positionName: 'Quản Lý Cửa Hàng',
      }),
    ).toBe('Super Admin');

    expect(
      resolveUserRoleDisplay({
        isSuperAdmin: false,
        roleLabel: 'Quản lý chỉ xem',
        positionName: 'Quản Lý Cửa Hàng',
      }),
    ).toBe('Quản lý chỉ xem');

    expect(
      resolveUserRoleDisplay({
        isSuperAdmin: false,
        roleLabel: '   ',
        positionName: 'Thu Ngân Quầy',
      }),
    ).toBe('Thu Ngân Quầy');

    expect(
      resolveUserRoleDisplay({
        isSuperAdmin: false,
        roleLabel: null,
        positionName: null,
      }),
    ).toBe('Nhân viên');
  });
});
