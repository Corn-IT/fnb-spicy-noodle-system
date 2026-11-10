import { type ColumnDef } from '@tanstack/react-table';
import { Settings, Plus } from 'lucide-react';
import * as React from 'react';

import { BaseTable } from '@/components/base-table/base-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth.store';

import { type UserRecord, useUsersQuery } from '../api/rbac.api';
import { PermissionsDrawer } from './permissions-drawer';

export function RbacUsersPage() {
  const currentUser = useAuthStore((s) => s.user);
  const isSuperAdmin = currentUser?.isSuperAdmin ?? false;

  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(50);
  const [keyword, setKeyword] = React.useState('');
  const [selectedUser, setSelectedUser] = React.useState<UserRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const { data, isLoading } = useUsersQuery({ page, limit, keyword: keyword || undefined });

  const handleOpenDrawer = (user: UserRecord) => {
    setSelectedUser(user);
    setDrawerOpen(true);
  };

  const columns = React.useMemo<ColumnDef<UserRecord, unknown>[]>(
    () => [
      {
        id: 'stt',
        header: 'STT',
        size: 60,
        enableResizing: false,
        cell: ({ row }) => (page - 1) * limit + row.index + 1,
      },
      {
        accessorKey: 'username',
        header: 'Tên đăng nhập',
        size: 160,
        cell: ({ row }) => (
          <span className="font-medium">{row.original.username}</span>
        ),
      },
      {
        id: 'employeeName',
        header: 'Họ tên nhân viên',
        size: 200,
        cell: ({ row }) => row.original.employee?.fullName ?? '—',
      },
      {
        id: 'role',
        header: 'Vai trò',
        size: 160,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {row.original.isSuperAdmin ? (
              <Badge
                data-testid={`super-admin-badge-${row.original.id}`}
                variant="default"
                className="bg-amber-500 text-white"
              >
                Super Admin
              </Badge>
            ) : (
              <Badge variant="secondary">Nhân viên</Badge>
            )}
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Trạng thái',
        size: 125,
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? 'default' : 'secondary'}>
            {row.original.isActive ? 'Hoạt động' : 'Vô hiệu'}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: 'Phân quyền',
        size: 100,
        enableResizing: false,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 active:scale-95 transition-transform"
            data-testid={`open-permissions-btn-${row.original.id}`}
            onClick={(e) => {
              e.stopPropagation();
              handleOpenDrawer(row.original);
            }}
          >
            <Settings className="h-4 w-4" />
          </Button>
        ),
      },
    ],
    [page, limit],
  );

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg sm:text-xl font-bold tracking-tight">Phân quyền Hệ thống</h1>
        {isSuperAdmin ? (
          <Button
            data-testid="create-user-btn"
            className="font-bold shadow-xs active:scale-[0.98]"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>Thêm mới tài khoản</span>
          </Button>
        ) : null}
      </div>

      <BaseTable<UserRecord>
        tableId="rbac-users"
        data={data?.items ?? []}
        columns={columns}
        isLoading={isLoading}
        emptyMessage="Không tìm thấy tài khoản nào."
        searchPlaceholder="Tìm kiếm tài khoản..."
        searchValue={keyword}
        onSearchChange={setKeyword}
        onRowClick={handleOpenDrawer}
        pagination={{
          page,
          limit,
          total: data?.total ?? 0,
          totalPages,
          onPageChange: setPage,
          onLimitChange: setLimit,
        }}
      />

      <PermissionsDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        user={selectedUser}
      />
    </div>
  );
}
