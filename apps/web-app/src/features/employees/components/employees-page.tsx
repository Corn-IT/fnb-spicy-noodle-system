import { type ColumnDef } from '@tanstack/react-table';
import { Eye, FileSpreadsheet, Pencil, Trash2 } from 'lucide-react';
import * as React from 'react';

import { AuditHistoryButton } from '@/components/audit-history-drawer/audit-history-drawer';
import { BaseTable } from '@/components/base-table/base-table';
import { SystemErrorView } from '@/components/error-display';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppMessages } from '@/hooks/use-app-messages';
import { TruncatedTextWithTooltip } from '@/components/ui/truncated-text-with-tooltip';
import { exportToExcel, fetchAllPaginated } from '@/lib/excel-export';
import { useAuthStore } from '@/stores/auth.store';

import {
  type EmployeeRecord,
  fetchEmployees,
  useEmployeesQuery,
  useMdmLookupForEmployeesQuery,
  usePermanentDeleteEmployeeMutation,
  useSetEmployeeActiveMutation,
} from '../api/employees.api';
import { EmployeeFormDrawer } from './employee-form-drawer';

const MS_PER_DAY = 86_400_000;
const PERMANENT_DELETE_WAIT_DAYS = 30;

function getPermanentDeleteEligibility(employee: EmployeeRecord): {
  canPermanentDelete: boolean;
  remainingDays: number;
} {
  const refDateStr = employee.deletedAt ?? employee.createdAt;
  const refMs = Date.parse(refDateStr);
  if (!Number.isFinite(refMs)) {
    return { canPermanentDelete: false, remainingDays: PERMANENT_DELETE_WAIT_DAYS };
  }
  const elapsedDays = Math.floor((Date.now() - refMs) / MS_PER_DAY);
  const remainingDays = Math.max(0, PERMANENT_DELETE_WAIT_DAYS - elapsedDays);
  return {
    canPermanentDelete: elapsedDays >= PERMANENT_DELETE_WAIT_DAYS,
    remainingDays,
  };
}

export function EmployeesPage() {
  const { notify, resolveMessage, resolveErrorMessage } = useAppMessages();
  const user = useAuthStore((s) => s.user);
  const canCreate = Boolean(user?.isSuperAdmin || user?.permissions.employees.create);
  const canUpdate = Boolean(user?.isSuperAdmin || user?.permissions.employees.update);
  const canDelete = Boolean(user?.isSuperAdmin || user?.permissions.employees.delete);
  const canExport = Boolean(user?.isSuperAdmin || user?.permissions.employees.export);

  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(20);
  const [keyword, setKeyword] = React.useState('');
  const [employeeStatus, setEmployeeStatus] = React.useState<'active' | 'inactive' | 'all'>('active');
  const [positionId, setPositionId] = React.useState<number | undefined>(undefined);
  const [specialtyId, setSpecialtyId] = React.useState<number | undefined>(undefined);
  const [isExporting, setIsExporting] = React.useState(false);

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerMode, setDrawerMode] = React.useState<'create' | 'edit' | 'view'>('create');
  const [selectedEmployee, setSelectedEmployee] = React.useState<EmployeeRecord | null>(null);

  const [permanentDeleteTarget, setPermanentDeleteTarget] = React.useState<EmployeeRecord | null>(null);
  const [statusTarget, setStatusTarget] = React.useState<{ employee: EmployeeRecord; isActive: boolean } | null>(null);

  const employeesQuery = useEmployeesQuery({
    page,
    limit,
    keyword: keyword || undefined,
    positionId,
    specialtyId,
    includeDeleted: employeeStatus !== 'active',
    inactiveOnly: employeeStatus === 'inactive',
  });
  const { data, isLoading } = employeesQuery;

  const { data: positions } = useMdmLookupForEmployeesQuery('POSITION');
  const { data: specialties } = useMdmLookupForEmployeesQuery('SPECIALTY');

  const permanentDeleteMutation = usePermanentDeleteEmployeeMutation();
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

  const handleConfirmPermanentDelete = async () => {
    if (!permanentDeleteTarget) return;
    try {
      await permanentDeleteMutation.mutateAsync(permanentDeleteTarget.id);
      notify('employees.delete.permanentSuccess', {
        variant: 'success',
        vars: { fullName: permanentDeleteTarget.fullName },
      });
    } catch (error) {
      const resolvedErr = resolveErrorMessage(
        'employees.delete.permanentError',
        error,
        'Vui lòng thử lại.',
      );
      notify('employees.delete.permanentError', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Vui lòng thử lại.' },
      });
    } finally {
      setPermanentDeleteTarget(null);
    }
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const allRows = await fetchAllPaginated((exportPage, exportLimit) =>
        fetchEmployees({
          page: exportPage,
          limit: exportLimit,
          keyword: keyword || undefined,
          positionId,
          specialtyId,
          includeDeleted: employeeStatus !== 'active',
          inactiveOnly: employeeStatus === 'inactive',
        }),
      );
      exportToExcel({
        filename: `nhan-su-${new Date().toISOString().slice(0, 10)}.xlsx`,
        sheetName: 'HoSoNhanSu',
        rows: allRows,
        columns: [
          { header: 'STT', value: (_, idx) => idx + 1, width: 8 },
          { header: 'Tên nhân viên', key: 'fullName', width: 26 },
          { header: 'Tên viết tắt', key: 'shortName', width: 14 },
          { header: 'Số điện thoại', key: 'phone', width: 16 },
          {
            header: 'Năm sinh',
            value: (row) => (row.dob ? new Date(row.dob).getFullYear() : ''),
            width: 12,
          },
          { header: 'Chức vụ', value: (row) => row.position?.name ?? '', width: 18 },
          { header: 'Chuyên môn', value: (row) => row.specialty?.name ?? '', width: 18 },
          {
            header: 'Trạng thái',
            value: (row) => (row.isDeleted ? 'Tạm ngưng' : 'Đang hoạt động'),
            width: 16,
          },
          { header: 'Tài khoản', value: (row) => row.user?.username ?? '', width: 16 },
          { header: 'Ghi chú', key: 'note', width: 28 },
        ],
      });
      notify('employees.exportExcelSuccess', {
        variant: 'success',
        vars: { count: allRows.length },
      });
    } catch (error) {
      const resolvedErr = resolveErrorMessage(
        'employees.exportExcelError',
        error,
        'Vui lòng thử lại.',
      );
      notify('employees.exportExcelError', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Vui lòng thử lại.' },
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleConfirmStatusChange = async () => {
    if (!statusTarget) return;
    try {
      await statusMutation.mutateAsync({
        employeeId: statusTarget.employee.id,
        isActive: statusTarget.isActive,
      });
      const detail = statusTarget.employee.user
        ? `Tài khoản ${statusTarget.employee.user.username} đã được ${statusTarget.isActive ? 'mở lại' : 'vô hiệu hoá'}.`
        : 'Trạng thái hồ sơ nhân viên đã được cập nhật.';
      notify(
        statusTarget.isActive
          ? 'employees.status.activateSuccess'
          : 'employees.status.deactivateSuccess',
        {
          variant: 'success',
          vars: { detail },
        },
      );
    } catch (error) {
      const resolvedErr = resolveErrorMessage(
        'employees.status.updateError',
        error,
        'Vui lòng thử lại.',
      );
      notify('employees.status.updateError', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Vui lòng thử lại.' },
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
        accessorKey: 'phone',
        header: 'Số điện thoại',
        size: 128,
        cell: ({ row }) => (
          <span className="tabular-nums whitespace-nowrap">{row.original.phone || '—'}</span>
        ),
      },
      {
        accessorKey: 'dob',
        header: 'Năm sinh',
        size: 92,
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
        id: 'status',
        header: 'Trạng thái',
        size: 148,
        cell: ({ row }) => {
          const isDeleted = row.original.isDeleted;
          const isSuperAdminAccount = Boolean(row.original.user?.isSuperAdmin);
          if (isSuperAdminAccount) {
            const superAdminTooltip =
              'Tài khoản Super Admin mặc định luôn hoạt động và không thể tạm ngưng';
            return (
              <span
                title={superAdminTooltip}
                className="inline-flex cursor-not-allowed"
              >
                <button
                  type="button"
                  disabled
                  title={superAdminTooltip}
                  aria-label={`${superAdminTooltip}: ${row.original.fullName}`}
                  data-testid={`toggle-employee-active-btn-${row.original.id}`}
                  className="inline-flex cursor-not-allowed items-center rounded-md opacity-100"
                >
                  <Badge variant="success" className="cursor-not-allowed opacity-100">
                    Đang hoạt động
                  </Badge>
                </button>
              </span>
            );
          }
          const badge = (
            <Badge
              variant={isDeleted ? 'secondary' : 'success'}
              className={canUpdate ? 'cursor-pointer transition-opacity hover:opacity-85' : undefined}
            >
              {isDeleted ? 'Tạm ngưng' : 'Đang hoạt động'}
            </Badge>
          );
          if (!canUpdate) {
            return badge;
          }
          const tooltip = isDeleted
            ? 'Bấm để kích hoạt lại nhân sự'
            : 'Bấm để tạm ngưng nhân sự';
          return (
            <button
              type="button"
              title={tooltip}
              aria-label={`${tooltip}: ${row.original.fullName}`}
              data-testid={`toggle-employee-active-btn-${row.original.id}`}
              onClick={(e) => {
                e.stopPropagation();
                setStatusTarget({ employee: row.original, isActive: isDeleted });
              }}
              className="inline-flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {badge}
            </button>
          );
        },
      },
      {
        accessorKey: 'note',
        header: 'Ghi chú',
        size: 155,
        cell: ({ row }) => (
          <div className="max-w-[155px] min-w-0">
            <TruncatedTextWithTooltip text={row.original.note} />
          </div>
        ),
      },
      {
        id: 'actions',
        header: 'Thao tác',
        size: 120,
        minSize: 112,
        enableResizing: false,
        cell: ({ row }) => {
          const emp = row.original;
          const { canPermanentDelete, remainingDays } = getPermanentDeleteEligibility(emp);
          const deleteTooltip = canPermanentDelete
            ? 'Xoá vĩnh viễn nhân sự'
            : `Cần đủ ${PERMANENT_DELETE_WAIT_DAYS} ngày tạm ngưng trước khi xoá vĩnh viễn (còn ${remainingDays} ngày)`;
          return (
            <div className="flex items-center gap-1 whitespace-nowrap">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                title="Xem chi tiết hồ sơ"
                aria-label="Xem chi tiết hồ sơ"
                className="h-8 w-8 p-0 active:scale-95 transition-transform"
                data-testid={`view-employee-btn-${emp.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleView(emp);
                }}
              >
                <Eye className="h-4 w-4" />
              </Button>
              {canUpdate && !emp.isDeleted ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  title="Chỉnh sửa hồ sơ"
                  aria-label="Chỉnh sửa hồ sơ"
                  className="h-8 w-8 p-0 active:scale-95 transition-transform"
                  data-testid={`edit-employee-btn-${emp.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(emp);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              ) : null}
              {canDelete && emp.isDeleted && !emp.user?.isSuperAdmin ? (
                <span
                  title={deleteTooltip}
                  className={canPermanentDelete ? 'inline-flex' : 'inline-flex cursor-not-allowed'}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!canPermanentDelete}
                    title={deleteTooltip}
                    aria-label={deleteTooltip}
                    className="h-8 w-8 p-0 active:scale-95 transition-transform disabled:pointer-events-none disabled:opacity-40"
                    data-testid={`delete-employee-btn-${emp.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (canPermanentDelete) {
                        setPermanentDeleteTarget(emp);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </span>
              ) : null}
            </div>
          );
        },
      },
    ],
    [page, limit, canUpdate, canDelete],
  );

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  if (!data && employeesQuery.isError) {
    return (
      <SystemErrorView
        variant="section"
        error={employeesQuery.error}
        onRetry={() => void employeesQuery.refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        path="/employees"
        defaultTitle="Quản lý Hồ sơ Nhân sự"
        actions={
          <>
            <AuditHistoryButton module="EMPLOYEES" />
            {canExport ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="export-employees-excel-btn"
                disabled={isExporting}
                onClick={handleExportExcel}
                className="font-semibold"
              >
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{isExporting ? 'Đang xuất...' : 'Xuất file Excel'}</span>
              </Button>
            ) : null}
            {canCreate ? (
              <Button
                data-testid="create-employee-btn"
                onClick={handleCreate}
                className="font-bold shadow-xs active:scale-[0.98]"
              >
                <span>Thêm nhân viên</span>
              </Button>
            ) : null}
          </>
        }
      />

      <BaseTable<EmployeeRecord>
        tableId="employees"
        data={data?.items ?? []}
        columns={columns}
        isLoading={isLoading}
        isFetching={employeesQuery.isFetching}
        isPlaceholderData={employeesQuery.isPlaceholderData}
        emptyMessage="Không tìm thấy nhân viên nào."
        searchPlaceholder="Tìm kiếm theo tên hoặc SĐT..."
        searchValue={keyword}
        onSearchChange={(nextKeyword) => {
          setKeyword(nextKeyword);
          setPage(1);
        }}
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

      {(() => {
        const deleteConfirmCopy = resolveMessage('employees.confirm.permanentDelete', {
          fullName: permanentDeleteTarget?.fullName ?? '',
          accountNote: permanentDeleteTarget?.user
            ? ` cùng tài khoản ${permanentDeleteTarget.user.username}`
            : '',
        });
        const statusConfirmCopy = resolveMessage('employees.confirm.toggleStatus', {
          actionTitle: statusTarget?.isActive ? 'Kích hoạt nhân viên' : 'Tạm ngưng nhân viên',
          detail: statusTarget?.isActive
            ? `Hồ sơ ${statusTarget.employee.fullName} sẽ được kích hoạt lại${statusTarget.employee.user ? ` cùng tài khoản ${statusTarget.employee.user.username}` : ''}. Nhân viên có tài khoản sẽ đăng nhập được sau thao tác này.`
            : `Hồ sơ ${statusTarget?.employee.fullName ?? 'nhân viên'} sẽ bị tạm ngưng${statusTarget?.employee.user ? ` và tài khoản ${statusTarget.employee.user.username} không thể đăng nhập` : ''}. Có thể kích hoạt lại sau.`,
        });
        return (
          <>
            <Dialog
              open={permanentDeleteTarget !== null}
              onOpenChange={(open) => {
                if (!open) setPermanentDeleteTarget(null);
              }}
            >
              <DialogContent data-testid="delete-employee-dialog">
                <DialogHeader>
                  <DialogTitle>{deleteConfirmCopy.title}</DialogTitle>
                  <DialogDescription>{deleteConfirmCopy.description}</DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    variant="outline"
                    className="font-semibold active:scale-[0.98] transition-transform select-none"
                    onClick={() => setPermanentDeleteTarget(null)}
                  >
                    Huỷ bỏ
                  </Button>
                  <Button
                    variant="destructive"
                    className="font-semibold active:scale-[0.98] transition-transform select-none shadow-xs"
                    data-testid="confirm-delete-employee-btn"
                    onClick={handleConfirmPermanentDelete}
                    disabled={permanentDeleteMutation.isPending}
                  >
                    Xoá vĩnh viễn
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={statusTarget !== null} onOpenChange={(open) => { if (!open) setStatusTarget(null); }}>
              <DialogContent data-testid="employee-status-confirm-dialog">
                <DialogHeader>
                  <DialogTitle>{statusConfirmCopy.title}</DialogTitle>
                  <DialogDescription>{statusConfirmCopy.description}</DialogDescription>
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
          </>
        );
      })()}
    </div>
  );
}
