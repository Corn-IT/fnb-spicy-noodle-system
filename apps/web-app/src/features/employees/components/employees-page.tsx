import { type ColumnDef } from '@tanstack/react-table';
import { Eye, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import * as React from 'react';

import { BaseTable } from '@/components/base-table/base-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth.store';

import {
  type EmployeeRecord,
  useDeleteEmployeeMutation,
  useEmployeesQuery,
  useMdmLookupForEmployeesQuery,
  useSetEmployeeActiveMutation,
} from '../api/employees.api';
import { EmployeeFormDrawer } from './employee-form-drawer';

export function EmployeesPage() {
  const user = useAuthStore((s) => s.user);
  const canCreate = user?.isSuperAdmin || user?.permissions.employees.create;
  const canUpdate = user?.isSuperAdmin || user?.permissions.employees.update;
  const canDelete = user?.isSuperAdmin || user?.permissions.employees.delete;

  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(20);
  const [keyword, setKeyword] = React.useState('');
  const [employeeStatus, setEmployeeStatus] = React.useState<'active' | 'inactive' | 'all'>('active');
  const [positionId, setPositionId] = React.useState<number | undefined>(undefined);
  const [specialtyId, setSpecialtyId] = React.useState<number | undefined>(undefined);

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerMode, setDrawerMode] = React.useState<'create' | 'edit' | 'view'>('create');
  const [selectedEmployee, setSelectedEmployee] = React.useState<EmployeeRecord | null>(null);

  const [deleteConfirmId, setDeleteConfirmId] = React.useState<number | null>(null);
  const [statusTarget, setStatusTarget] = React.useState<{ employee: EmployeeRecord; isActive: boolean } | null>(null);

  const { data, isLoading } = useEmployeesQuery({
    page,
    limit,
    keyword: keyword || undefined,
    positionId,
    specialtyId,
    includeDeleted: employeeStatus !== 'active',
    inactiveOnly: employeeStatus === 'inactive',
  });

  const { data: positions } = useMdmLookupForEmployeesQuery('POSITION');
  const { data: specialties } = useMdmLookupForEmployeesQuery('SPECIALTY');

  const deleteMutation = useDeleteEmployeeMutation();
  const statusMutation = useSetEmployeeActiveMutation();

  const handleView = (emp: EmployeeRecord) => {
    setSelectedEmployee(emp);
    setDrawerMode('view');
    setDrawerOpen(true);
  };

  const handleEdit = (emp: EmployeeRecord) => {
    setSelectedEmployee(emp);
    setDrawerMode('edit');
    setDrawerOpen(true);
  };

  const handleCreate = () => {
    setSelectedEmployee(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirmId === null) return;
    try {
      await deleteMutation.mutateAsync(deleteConfirmId);
      toast({ variant: 'success', title: 'Đã xoá mềm nhân viên thành công' });
    } catch {
      toast({ variant: 'destructive', title: 'Xoá nhân viên thất bại' });
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const handleConfirmStatusChange = async () => {
    if (!statusTarget) return;
    try {
      await statusMutation.mutateAsync({
        employeeId: statusTarget.employee.id,
        isActive: statusTarget.isActive,
      });
      toast({
        variant: 'success',
        title: statusTarget.isActive ? 'Đã kích hoạt nhân viên' : 'Đã tạm ngưng nhân viên',
        description: statusTarget.employee.user
          ? `Tài khoản ${statusTarget.employee.user.username} đã được ${statusTarget.isActive ? 'mở lại' : 'vô hiệu hoá'}.`
          : 'Trạng thái hồ sơ nhân viên đã được cập nhật.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Không thể cập nhật trạng thái nhân viên',
        description: error instanceof Error ? error.message : 'Vui lòng thử lại.',
      });
    } finally {
      setStatusTarget(null);
    }
  };

  const columns = React.useMemo<ColumnDef<EmployeeRecord, unknown>[]>(
    () => [
      {
        id: 'stt',
        header: 'STT',
        size: 52,
        enableResizing: false,
        cell: ({ row }) => (page - 1) * limit + row.index + 1,
      },
      {
        accessorKey: 'fullName',
        header: 'Tên nhân viên',
        size: 185,
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{row.original.fullName}</span>
            <Badge
              variant="secondary"
              className="w-fit text-xs"
              data-testid={`short-name-badge-${row.original.id}`}
            >
              {row.original.shortName}
            </Badge>
          </div>
        ),
      },
      {
        accessorKey: 'dob',
        header: 'Năm sinh',
        size: 90,
        cell: ({ row }) =>
          row.original.dob
            ? new Date(row.original.dob).getFullYear()
            : '—',
      },
      {
        id: 'position',
        header: 'Chức vụ',
        size: 130,
        cell: ({ row }) => row.original.position?.name ?? '—',
      },
      {
        id: 'specialty',
        header: 'Chuyên môn',
        size: 130,
        cell: ({ row }) => row.original.specialty?.name ?? '—',
      },
      {
        accessorKey: 'note',
        header: 'Ghi chú',
        size: 145,
        cell: ({ row }) => row.original.note ?? '—',
      },
      {
        id: 'actions',
        header: 'Thao tác',
        size: 270,
        minSize: 260,
        enableResizing: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 active:scale-95 transition-transform"
              data-testid={`view-employee-btn-${row.original.id}`}
              onClick={(e) => {
                e.stopPropagation();
                handleView(row.original);
              }}
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Badge
              variant={row.original.isDeleted ? 'secondary' : 'success'}
            >
              {row.original.isDeleted ? 'Tạm ngưng' : 'Đang hoạt động'}
            </Badge>
            {canUpdate ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 active:scale-95 transition-transform"
                data-testid={`toggle-employee-active-btn-${row.original.id}`}
                aria-label={`${row.original.isDeleted ? 'Kích hoạt' : 'Tạm ngưng'} ${row.original.fullName}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setStatusTarget({ employee: row.original, isActive: row.original.isDeleted });
                }}
              >
                <Power className="h-4 w-4" />
              </Button>
            ) : null}
            {canUpdate ? (
              row.original.isDeleted ? null : <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 active:scale-95 transition-transform"
                data-testid={`edit-employee-btn-${row.original.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit(row.original);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            ) : null}
            {canDelete && !row.original.isDeleted ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 active:scale-95 transition-transform"
                data-testid={`delete-employee-btn-${row.original.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteConfirmId(row.original.id);
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [page, limit, canUpdate, canDelete],
  );

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg sm:text-xl font-bold tracking-tight">Quản lý Hồ sơ Nhân sự</h1>
        {canCreate ? (
          <Button
            data-testid="create-employee-btn"
            onClick={handleCreate}
            className="font-bold shadow-xs active:scale-[0.98]"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>Thêm nhân viên</span>
          </Button>
        ) : null}
      </div>

      <BaseTable<EmployeeRecord>
        tableId="employees"
        data={data?.items ?? []}
        columns={columns}
        isLoading={isLoading}
        emptyMessage="Không tìm thấy nhân viên nào."
        searchPlaceholder="Tìm kiếm theo tên hoặc SĐT..."
        searchValue={keyword}
        onSearchChange={setKeyword}
        toolbarLeft={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={positionId ? String(positionId) : 'all'}
              onValueChange={(v) => {
                setPositionId(v === 'all' ? undefined : Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger className="w-36 sm:w-40" data-testid="position-filter">
                <SelectValue placeholder="Chức vụ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả chức vụ</SelectItem>
                {positions?.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={specialtyId ? String(specialtyId) : 'all'}
              onValueChange={(v) => {
                setSpecialtyId(v === 'all' ? undefined : Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger className="w-40 sm:w-44" data-testid="specialty-filter">
                <SelectValue placeholder="Chuyên môn" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả chuyên môn</SelectItem>
                {specialties?.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <select
              aria-label="Lọc trạng thái nhân viên"
              data-testid="employee-status-filter"
              value={employeeStatus}
              onChange={(event) => {
                setEmployeeStatus(event.target.value as 'active' | 'inactive' | 'all');
                setPage(1);
              }}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            >
              <option value="active">Đang hoạt động</option>
              <option value="inactive">Tạm ngưng</option>
              <option value="all">Tất cả trạng thái</option>
            </select>
          </div>
        }
        pagination={{
          page,
          limit,
          total: data?.total ?? 0,
          totalPages,
          onPageChange: setPage,
          onLimitChange: setLimit,
        }}
      />

      <EmployeeFormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        mode={drawerMode}
        employee={selectedEmployee}
        positions={positions ?? []}
        specialties={specialties ?? []}
      />

      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent data-testid="delete-employee-dialog">
          <DialogHeader>
            <DialogTitle>Xác nhận xoá nhân viên</DialogTitle>
            <DialogDescription>
              Nhân viên sẽ bị xoá mềm (đánh dấu nghỉ việc). Dữ liệu lịch sử vẫn được giữ lại.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="font-semibold active:scale-[0.98] transition-transform select-none"
              onClick={() => setDeleteConfirmId(null)}
            >
              Huỷ bỏ
            </Button>
            <Button
              variant="destructive"
              className="font-semibold active:scale-[0.98] transition-transform select-none shadow-xs"
              data-testid="confirm-delete-employee-btn"
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
            >
              Xác nhận xoá
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={statusTarget !== null} onOpenChange={(open) => { if (!open) setStatusTarget(null); }}>
        <DialogContent data-testid="employee-status-confirm-dialog">
          <DialogHeader>
            <DialogTitle>{statusTarget?.isActive ? 'Kích hoạt nhân viên' : 'Tạm ngưng nhân viên'}</DialogTitle>
            <DialogDescription>
              {statusTarget?.isActive
                ? `Hồ sơ ${statusTarget.employee.fullName} sẽ được kích hoạt lại${statusTarget.employee.user ? ` cùng tài khoản ${statusTarget.employee.user.username}` : ''}. Nhân viên có tài khoản sẽ đăng nhập được sau thao tác này.`
                : `Hồ sơ ${statusTarget?.employee.fullName ?? 'nhân viên'} sẽ bị tạm ngưng${statusTarget?.employee.user ? ` và tài khoản ${statusTarget.employee.user.username} không thể đăng nhập` : ''}. Có thể kích hoạt lại sau.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="font-semibold active:scale-[0.98] transition-transform select-none"
              onClick={() => setStatusTarget(null)}
            >
              Huỷ bỏ
            </Button>
            <Button
              type="button"
              data-testid="confirm-employee-status-btn"
              className="font-semibold active:scale-[0.98] transition-transform select-none shadow-xs"
              variant={statusTarget?.isActive ? 'default' : 'destructive'}
              disabled={statusMutation.isPending}
              onClick={handleConfirmStatusChange}
            >
              {statusTarget?.isActive ? 'Kích hoạt' : 'Tạm ngưng'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
