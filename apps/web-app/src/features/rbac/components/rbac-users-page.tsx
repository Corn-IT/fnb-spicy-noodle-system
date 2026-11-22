import { type ColumnDef } from '@tanstack/react-table';
import { History, LogOut, Plus, Settings, ShieldAlert } from 'lucide-react';
import * as React from 'react';

import {
  AuditHistoryButton,
  AuditHistoryDrawer,
} from '@/components/audit-history-drawer/audit-history-drawer';
import { BaseTable } from '@/components/base-table/base-table';
import { SystemErrorView } from '@/components/error-display';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip } from '@/components/ui/tooltip';
import { useAppMessages } from '@/hooks/use-app-messages';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/utils/cn';

import {
  type UserRecord,
  useRevokeUserSessionMutation,
  useUsersQuery,
} from '../api/rbac.api';
import { CreateUserDialog } from './create-user-dialog';
import { PermissionsDrawer } from './permissions-drawer';
import { UserSessionHistoryDialog } from './user-session-history-dialog';

export function RbacUsersPage() {
  const currentUser = useAuthStore((s) => s.user);
  const isSuperAdmin = currentUser?.isSuperAdmin ?? false;
  const { notify, resolveErrorMessage } = useAppMessages();

  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(50);
  const [keyword, setKeyword] = React.useState('');
  const [selectedUser, setSelectedUser] = React.useState<UserRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [sessionHistoryUser, setSessionHistoryUser] = React.useState<UserRecord | null>(null);
  const [sessionAuditOpen, setSessionAuditOpen] = React.useState(false);
  const [sessionAuditKeyword, setSessionAuditKeyword] = React.useState('');
  const [revokeTarget, setRevokeTarget] = React.useState<UserRecord | null>(null);
  const [revokeError, setRevokeError] = React.useState<string | null>(null);

  const revokeSessionMutation = useRevokeUserSessionMutation();

  const handleConfirmRevoke = async () => {
    if (!revokeTarget) {
      return;
    }
    setRevokeError(null);
    try {
      await revokeSessionMutation.mutateAsync(revokeTarget.id);
      notify('rbac.session.revokeSuccess', {
        variant: 'success',
        vars: { username: revokeTarget.username },
      });
      setRevokeTarget(null);
    } catch (err) {
      const resolved = resolveErrorMessage('rbac.session.revokeError', err);
      setRevokeError(resolved.description ?? resolved.title);
      notify('rbac.session.revokeError', {
        variant: 'destructive',
        vars: { reason: resolved.description ?? resolved.title },
      });
    }
  };

  const usersQuery = useUsersQuery({ page, limit, keyword: keyword || undefined });
  const { data, isLoading } = usersQuery;

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
        size: 165,
        cell: ({ row }) => {
          const superAdminTooltip = row.original.isSuperAdmin
            ? 'Tài khoản Super Admin mặc định luôn hoạt động và không thể tạm ngưng'
            : undefined;
          const session = row.original.session;
          const isActiveSession = Boolean(session?.isActiveSession);
          const isSocketOnline = Boolean(isActiveSession && session?.isSocketOnline);
          return (
            <div className="flex flex-col items-start gap-1">
              <span
                title={superAdminTooltip}
                className={row.original.isSuperAdmin ? 'inline-flex cursor-not-allowed' : 'inline-flex'}
              >
                <Badge
                  variant={row.original.isActive ? 'success' : 'secondary'}
                  title={superAdminTooltip}
                  data-testid={`user-status-badge-${row.original.id}`}
                  className={row.original.isSuperAdmin ? 'cursor-not-allowed opacity-100' : undefined}
                >
                  {row.original.isActive ? 'Hoạt động' : 'Vô hiệu'}
                </Badge>
              </span>
              <span
                data-testid={`user-session-indicator-${row.original.id}`}
                className={cn(
                  'inline-flex items-center gap-1.5 text-[11px] font-medium',
                  isSocketOnline
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : isActiveSession
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-muted-foreground',
                )}
              >
                <span
                  className={cn(
                    'h-2 w-2 rounded-full shrink-0',
                    isSocketOnline
                      ? 'bg-emerald-500'
                      : isActiveSession
                        ? 'bg-amber-500'
                        : 'bg-slate-400 dark:bg-slate-600',
                  )}
                />
                <span>
                  {isSocketOnline
                    ? 'Đang trực tuyến'
                    : isActiveSession
                      ? 'Có phiên (chờ kết nối)'
                      : 'Ngoại tuyến'}
                </span>
              </span>
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: 'Thao tác',
        size: isSuperAdmin ? 124 : 76,
        enableResizing: false,
        cell: ({ row }) => {
          const canRevoke = Boolean(isSuperAdmin && row.original.session?.isActiveSession);
          return (
            <div className="flex items-center gap-1 whitespace-nowrap">
              <Tooltip content="Phân quyền & chi tiết tài khoản">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Phân quyền & chi tiết tài khoản"
                  aria-label="Phân quyền tài khoản"
                  className="h-8 w-8 p-0 active:scale-95 transition-transform"
                  data-testid={`open-permissions-btn-${row.original.id}`}
                  onClick={() => handleOpenDrawer(row.original)}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </Tooltip>
              {isSuperAdmin ? (
                <Tooltip content="Lịch sử phiên đăng nhập (5 lần gần nhất)">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="Lịch sử phiên đăng nhập (5 lần gần nhất)"
                    aria-label="Lịch sử phiên đăng nhập"
                    className="h-8 w-8 p-0 active:scale-95 transition-transform"
                    data-testid={`session-history-btn-${row.original.id}`}
                    onClick={() => setSessionHistoryUser(row.original)}
                  >
                    <History className="h-4 w-4" />
                  </Button>
                </Tooltip>
              ) : null}
              {canRevoke ? (
                <Tooltip content="Thu hồi phiên đăng nhập hiện tại">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="Thu hồi phiên đăng nhập hiện tại"
                    aria-label="Thu hồi phiên đăng nhập"
                    className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive active:scale-95 transition-transform"
                    data-testid={`revoke-session-btn-${row.original.id}`}
                    onClick={() => {
                      setRevokeError(null);
                      setRevokeTarget(row.original);
                    }}
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </Tooltip>
              ) : null}
            </div>
          );
        },
      },
    ],
    [page, limit, isSuperAdmin],
  );

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  if (!data && usersQuery.isError) {
    return (
      <SystemErrorView
        variant="section"
        error={usersQuery.error}
        onRetry={() => void usersQuery.refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        path="/rbac"
        defaultTitle="Phân quyền Hệ thống"
        actions={
          isSuperAdmin ? (
            <>
              <AuditHistoryButton module="RBAC" />
              <Button
                type="button"
                data-testid="create-user-btn"
                onClick={() => setCreateOpen(true)}
                className="font-bold shadow-xs active:scale-[0.98]"
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span>Thêm mới tài khoản</span>
              </Button>
            </>
          ) : null
        }
      />

      <BaseTable<UserRecord>
        tableId="rbac-users"
        data={data?.items ?? []}
        columns={columns}
        isLoading={isLoading}
        isFetching={usersQuery.isFetching}
        isPlaceholderData={usersQuery.isPlaceholderData}
        emptyMessage="Không tìm thấy tài khoản nào."
        searchPlaceholder="Tìm kiếm tài khoản..."
        searchValue={keyword}
        onSearchChange={setKeyword}
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

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />

      {isSuperAdmin ? (
        <>
          <UserSessionHistoryDialog
            open={Boolean(sessionHistoryUser)}
            onOpenChange={(open) => {
              if (!open) {
                setSessionHistoryUser(null);
              }
            }}
            user={
              sessionHistoryUser
                ? (data?.items.find((item) => item.id === sessionHistoryUser.id) ?? sessionHistoryUser)
                : null
            }
            onRequestRevokeSession={(target) => {
              setRevokeError(null);
              setRevokeTarget(target);
            }}
            onOpenFullAuditLog={(target) => {
              setSessionHistoryUser(null);
              setSessionAuditKeyword(target.username);
              setSessionAuditOpen(true);
            }}
          />

          <AuditHistoryDrawer
            open={sessionAuditOpen}
            onOpenChange={setSessionAuditOpen}
            module="RBAC"
            initialKeyword={sessionAuditKeyword}
          />
        </>
      ) : null}

      <Dialog
        open={Boolean(revokeTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setRevokeTarget(null);
            setRevokeError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md" data-testid="revoke-session-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5 shrink-0" />
              <span>Xác nhận đăng xuất từ xa</span>
            </DialogTitle>
            <DialogDescription>
              Thu hồi ngay phiên làm việc đang hoạt động của tài khoản{' '}
              <span className="font-semibold text-foreground">@{revokeTarget?.username}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="rounded-lg border bg-muted/40 p-3 space-y-1 text-xs">
              <div>
                <span className="text-muted-foreground">Thiết bị hiện tại: </span>
                <span className="font-medium text-foreground">
                  {revokeTarget?.session?.deviceLabel ?? 'Chưa xác định'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Địa chỉ IP: </span>
                <span className="font-mono font-medium text-foreground">
                  {revokeTarget?.session?.ipAddress ?? '—'}
                </span>
              </div>
            </div>

            {revokeTarget?.id === currentUser?.id ? (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Lưu ý: Đây chính là tài khoản bạn đang sử dụng. Phiên trình duyệt hiện tại của bạn
                cũng sẽ bị đăng xuất ngay lập tức.
              </p>
            ) : null}

            {revokeError ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {revokeError}
              </p>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:flex-wrap sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              disabled={revokeSessionMutation.isPending}
              onClick={() => {
                setRevokeTarget(null);
                setRevokeError(null);
              }}
            >
              Huỷ bỏ
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid="confirm-revoke-session-btn"
              disabled={revokeSessionMutation.isPending}
              onClick={() => void handleConfirmRevoke()}
            >
              {revokeSessionMutation.isPending ? 'Đang thu hồi...' : 'Xác nhận đăng xuất từ xa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
