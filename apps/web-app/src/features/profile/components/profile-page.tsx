import {
  ChangePasswordSchema,
  UpdateProfileSchema,
  type UploadAvatarInput,
} from '@fnb/shared';
import {
  Building2,
  Camera,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Laptop,
  Link2,
  MapPin,
  Phone,
  Save,
  Shield,
  ShieldCheck,
  Trash2,
  Upload,
  UserCheck,
} from 'lucide-react';
import * as React from 'react';

import { SystemErrorView } from '@/components/error-display';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import {
  useChangePasswordMutation,
  useDeleteAvatarMutation,
  useMyProfileQuery,
  useUpdateProfileMutation,
  useUploadAvatarMutation,
} from '@/features/profile/api/profile.api';
import { AvatarCropDialog } from '@/features/profile/components/avatar-crop-dialog';
import { PersonalPreferencesCard } from '@/features/profile/components/personal-preferences-card';
import { useAppMessages } from '@/hooks/use-app-messages';
import { resolvePublicAssetUrl } from '@/utils/asset-url';
import { cn } from '@/utils/cn';
import { RBAC_MODULE_CONFIGS } from '@/utils/permission-catalog';

const MAX_SOURCE_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function computeInitials(name?: string | null): string {
  if (!name) return 'NV';
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(-2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('') || 'NV';
}

function formatSessionStartedAt(value?: string | null): string {
  if (!value) return 'Đang hoạt động';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Đang hoạt động';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

export function ProfilePage() {
  const { notify } = useAppMessages();
  const profileQuery = useMyProfileQuery();
  const { data: profile, isLoading } = profileQuery;
  const updateMutation = useUpdateProfileMutation();
  const uploadAvatarMutation = useUploadAvatarMutation();
  const deleteAvatarMutation = useDeleteAvatarMutation();
  const changePasswordMutation = useChangePasswordMutation();

  const [fullName, setFullName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [bankName, setBankName] = React.useState('');
  const [bankAccountNo, setBankAccountNo] = React.useState('');
  const [bankAccountName, setBankAccountName] = React.useState('');
  const [avatarUrl, setAvatarUrl] = React.useState('');
  const [showExternalUrlInput, setShowExternalUrlInput] = React.useState(false);
  const [cropFile, setCropFile] = React.useState<File | null>(null);
  const [isDraggingFile, setIsDraggingFile] = React.useState(false);
  const [avatarError, setAvatarError] = React.useState<string | null>(null);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [passwordError, setPasswordError] = React.useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (profile?.employee) {
      setFullName(profile.employee.fullName ?? '');
      setPhone(profile.employee.phone ?? '');
      setAddress(profile.employee.address ?? '');
      setBankName(profile.employee.bankName ?? '');
      setBankAccountNo(profile.employee.bankAccountNo ?? '');
      setBankAccountName(profile.employee.bankAccountName ?? '');
      setAvatarUrl(profile.employee.avatarUrl ?? '');
    }
  }, [profile]);

  const handleSelectAvatarFile = (file: File | null | undefined) => {
    if (!file) return;
    setAvatarError(null);

    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.type)) {
      setAvatarError('Chỉ hỗ trợ tệp ảnh định dạng PNG, JPEG hoặc WebP.');
      return;
    }

    if (file.size > MAX_SOURCE_FILE_BYTES) {
      setAvatarError('Ảnh gốc vượt quá 8MB. Vui lòng chọn ảnh có dung lượng nhỏ hơn.');
      return;
    }

    setCropFile(file);
  };

  const handleConfirmAvatarUpload = async (payload: UploadAvatarInput) => {
    setAvatarError(null);
    const updated = await uploadAvatarMutation.mutateAsync(payload);
    setAvatarUrl(updated.employee.avatarUrl ?? '');
    setCropFile(null);
    notify('profile.avatarUploadSuccess', { variant: 'success' });
  };

  const handleDeleteAvatar = async () => {
    setAvatarError(null);
    try {
      await deleteAvatarMutation.mutateAsync();
      setAvatarUrl('');
      notify('profile.avatarRemoveSuccess', { variant: 'success' });
    } catch (err) {
      setAvatarError(
        err instanceof Error ? err.message : 'Không thể xoá ảnh đại diện lúc này.',
      );
    }
  };

  const handleSaveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError(null);

    const payload = {
      fullName: fullName.trim() || undefined,
      phone: phone.trim() ? phone.trim() : null,
      address: address.trim() ? address.trim() : null,
      bankName: bankName.trim() ? bankName.trim() : null,
      bankAccountNo: bankAccountNo.trim() ? bankAccountNo.trim() : null,
      bankAccountName: bankAccountName.trim() ? bankAccountName.trim() : null,
      avatarUrl: avatarUrl.trim() ? avatarUrl.trim() : null,
    };

    const parsed = UpdateProfileSchema.safeParse(payload);
    if (!parsed.success) {
      setValidationError(
        parsed.error.issues[0]?.message || 'Dữ liệu cập nhật hồ sơ không hợp lệ',
      );
      return;
    }

    try {
      await updateMutation.mutateAsync(parsed.data);
      notify('profile.saveSuccess', { variant: 'success' });
    } catch (err) {
      setValidationError(
        err instanceof Error ? err.message : 'Không thể lưu hồ sơ cá nhân',
      );
    }
  };

  const handleChangePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError(null);
    const parsed = ChangePasswordSchema.safeParse({ currentPassword, newPassword, confirmPassword });
    if (!parsed.success) {
      setPasswordError(parsed.error.issues[0]?.message || 'Thông tin đổi mật khẩu không hợp lệ');
      return;
    }

    try {
      await changePasswordMutation.mutateAsync(parsed.data);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      notify('profile.changePasswordSuccess', { variant: 'success' });
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Không thể đổi mật khẩu');
    }
  };

  const grantedModules = React.useMemo(() => {
    if (!profile || profile.isSuperAdmin) return [];
    return RBAC_MODULE_CONFIGS.map((mod) => {
      const modulePerms = (profile.permissions?.[mod.key] ?? {}) as Record<string, boolean>;
      const activeLabels = mod.permissions
        .filter((perm) => Boolean(modulePerms[perm.key]))
        .map((perm) => perm.label);
      return {
        key: mod.key,
        label: mod.label,
        activeLabels,
      };
    }).filter((mod) => mod.activeLabels.length > 0);
  }, [profile]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-64 w-full animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!profile && profileQuery.isError) {
    return (
      <SystemErrorView
        variant="section"
        error={profileQuery.error}
        onRetry={() => void profileQuery.refetch()}
      />
    );
  }

  const emp = profile?.employee;
  const resolvedAvatarSrc = resolvePublicAssetUrl(avatarUrl);
  const avatarBusy = uploadAvatarMutation.isPending || deleteAvatarMutation.isPending;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        path="/profile"
        defaultTitle="Hồ sơ Tài khoản Cá nhân"
        defaultSubtitle="Liên kết 1-1 giữa Tài khoản đăng nhập (users) và Hồ sơ Nhân sự (employees)"
        className="border-b pb-4"
        titleClassName="text-2xl font-bold tracking-tight"
        subtitleClassName="text-sm text-muted-foreground"
        actions={
          <div className="flex flex-wrap items-center gap-2" data-testid="profile-readonly-badges">
            <div className="flex items-center gap-1.5 rounded-lg border bg-muted/40 px-3 py-1.5">
              <UserCheck className="h-4 w-4 text-accent-text shrink-0" />
              <span className="text-xs text-muted-foreground">Chức vụ:</span>
              <Badge variant="secondary" data-testid="badge-readonly-position">
                {emp?.position?.name ?? 'Chưa gán'}
              </Badge>
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border bg-muted/40 px-3 py-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="text-xs text-muted-foreground">Chuyên môn:</span>
              <Badge variant="info" data-testid="badge-readonly-specialty">
                {emp?.specialty?.name ?? 'Chưa gán'}
              </Badge>
            </div>
          </div>
        }
      />

      <form onSubmit={handleSaveProfile} className="grid gap-6 md:grid-cols-3">
        {/* Cột trái: Avatar Upload + Crop thật & Kéo thả */}
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setIsDraggingFile(true);
          }}
          onDragLeave={() => setIsDraggingFile(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDraggingFile(false);
            const dropped = event.dataTransfer.files?.[0];
            handleSelectAvatarFile(dropped);
          }}
          className={cn(
            'space-y-4 rounded-xl border bg-card p-5 shadow-sm transition-colors',
            isDraggingFile ? 'border-primary bg-primary/5 ring-2 ring-primary/30' : '',
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            data-testid="profile-avatar-file-input"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              handleSelectAvatarFile(file);
            }}
          />

          <div className="flex flex-col items-center gap-3 text-center">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarBusy}
              aria-label="Chọn ảnh đại diện mới"
              className="group relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-2 border-primary/30 bg-muted shadow-sm transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {resolvedAvatarSrc ? (
                <img
                  src={resolvedAvatarSrc}
                  alt={fullName || 'Avatar'}
                  data-testid="profile-avatar-img"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span
                  data-testid="profile-avatar-initials"
                  className="text-2xl font-bold text-muted-foreground select-none"
                >
                  {computeInitials(fullName || emp?.fullName)}
                </span>
              )}
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 text-[11px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="h-4 w-4" />
                <span>Đổi ảnh</span>
              </span>
            </button>

            <div>
              <p className="font-semibold text-foreground">
                {emp?.fullName ?? 'Nhân viên'}
              </p>
              <p className="text-xs text-muted-foreground">
                Tên viết tắt lịch tuần:{' '}
                <span
                  data-testid="profile-short-name"
                  className="font-mono font-semibold text-accent-text"
                >
                  {emp?.shortName ?? 'N/A'}
                </span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="profile-avatar-upload-btn"
              disabled={avatarBusy}
              onClick={() => fileInputRef.current?.click()}
              className="gap-1.5"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>{uploadAvatarMutation.isPending ? 'Đang tải...' : 'Chọn ảnh từ máy'}</span>
            </Button>

            {resolvedAvatarSrc ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="profile-avatar-delete-btn"
                disabled={avatarBusy}
                onClick={() => void handleDeleteAvatar()}
                className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Xoá ảnh</span>
              </Button>
            ) : null}
          </div>

          <p className="text-center text-[11px] text-muted-foreground leading-relaxed">
            Kéo thả hoặc chọn ảnh PNG, JPEG, WebP để cắt tròn và đồng bộ trực tiếp.
          </p>

          {avatarError ? (
            <div
              role="alert"
              data-testid="profile-avatar-error"
              className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-300"
            >
              {avatarError}
            </div>
          ) : null}

          <div className="border-t pt-3">
            <button
              type="button"
              onClick={() => setShowExternalUrlInput((prev) => !prev)}
              className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="inline-flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5" />
                <span>Hoặc dùng URL ảnh ngoài</span>
              </span>
              {showExternalUrlInput ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>

            {showExternalUrlInput ? (
              <div className="mt-2.5 space-y-1.5">
                <label
                  htmlFor="profile-avatar-url"
                  className="text-[11px] font-medium text-muted-foreground"
                >
                  Đường dẫn ảnh (http/https)
                </label>
                <Input
                  id="profile-avatar-url"
                  placeholder="https://assets.fnb.vn/avatar.jpg"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                />
              </div>
            ) : null}
          </div>
        </div>

        {/* Cột phải (2 cols): Thông tin liên hệ & Tài khoản ngân hàng nhận lương */}
        <div className="space-y-6 rounded-xl border bg-card p-6 shadow-sm md:col-span-2">
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-foreground">
              1. Thông tin Cá nhân & Liên hệ
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="profile-fullname" className="text-xs font-medium">
                  Họ và tên nhân viên
                </label>
                <Input
                  id="profile-fullname"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="profile-phone" className="text-xs font-medium">
                  Số điện thoại
                </label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="profile-phone"
                    placeholder="0901234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="profile-address" className="text-xs font-medium">
                Địa chỉ nơi ở hiện tại
              </label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="profile-address"
                  placeholder="Số nhà, đường, phường/xã, quận/huyện..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 border-t pt-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Building2 className="h-4 w-4 text-accent-text" />
              2. Tài khoản Ngân hàng Nhận lương
            </h2>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor="profile-bank-name" className="text-xs font-medium">
                  Tên ngân hàng
                </label>
                <Input
                  id="profile-bank-name"
                  placeholder="VD: Vietcombank"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="profile-bank-no" className="text-xs font-medium">
                  Số tài khoản
                </label>
                <Input
                  id="profile-bank-no"
                  placeholder="Nhập số tài khoản"
                  value={bankAccountNo}
                  onChange={(e) => setBankAccountNo(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="profile-bank-holder" className="text-xs font-medium">
                  Tên chủ tài khoản
                </label>
                <Input
                  id="profile-bank-holder"
                  placeholder="NGUYEN VAN ANH"
                  value={bankAccountName}
                  onChange={(e) => setBankAccountName(e.target.value)}
                />
              </div>
            </div>
          </div>

          {validationError ? (
            <div
              role="alert"
              className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-300"
            >
              {validationError}
            </div>
          ) : null}

          <div className="flex justify-end border-t pt-4">
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              className="font-bold shadow-xs active:scale-[0.98]"
            >
              <Save className="h-4 w-4 shrink-0" />
              <span>
                {updateMutation.isPending
                  ? 'Đang lưu đồng bộ...'
                  : 'Lưu thay đổi Hồ sơ'}
              </span>
            </Button>
          </div>
        </div>
      </form>

      {/* Thẻ 3: Phiên đăng nhập hiện tại & Quyền hạn của tôi */}
      <section
        data-testid="profile-session-permissions-card"
        className="space-y-4 rounded-xl border bg-card p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Shield className="h-4 w-4 text-accent-text" />
              3. Phiên đăng nhập & Quyền hạn của tôi
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Thông tin tài khoản, thiết bị bạn đang sử dụng và phạm vi chức năng được phân quyền.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              @{profile?.username}
            </Badge>
            <Badge variant={profile?.isSuperAdmin ? 'default' : 'secondary'}>
              {profile?.isSuperAdmin ? 'Super Admin' : 'Nhân viên'}
            </Badge>
          </div>
        </div>

        <div className="grid gap-3 rounded-lg border bg-muted/30 p-3.5 text-xs sm:grid-cols-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-muted-foreground">Thiết bị hiện tại</div>
              <div className="flex items-center gap-1 font-semibold text-foreground truncate">
                <Laptop className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {profile?.session?.deviceLabel ?? 'Trình duyệt hiện tại'}
                </span>
              </div>
            </div>
          </div>

          <div>
            <div className="text-muted-foreground">Địa chỉ IP phiên này</div>
            <div className="font-mono font-semibold text-foreground">
              {profile?.session?.ipAddress ?? '—'}
            </div>
          </div>

          <div>
            <div className="text-muted-foreground">Đăng nhập lúc</div>
            <div className="font-semibold text-foreground tabular-nums">
              {formatSessionStartedAt(profile?.session?.startedAt)}
            </div>
          </div>
        </div>

        {profile?.isSuperAdmin ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3.5 py-2.5 text-xs font-medium text-foreground">
            Tài khoản <span className="font-bold">Super Admin</span> có toàn quyền quản trị trên tất cả phân hệ nghiệp vụ và cấu hình cửa hàng.
          </div>
        ) : grantedModules.length > 0 ? (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {grantedModules.map((mod) => (
              <div
                key={mod.key}
                className="rounded-lg border bg-muted/20 p-3 space-y-1.5"
              >
                <div className="text-xs font-semibold text-foreground">{mod.label}</div>
                <div className="flex flex-wrap gap-1">
                  {mod.activeLabels.map((permLabel) => (
                    <span
                      key={permLabel}
                      className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
                    >
                      {permLabel}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border bg-muted/20 px-3.5 py-2.5 text-xs text-muted-foreground">
            Chưa có phân hệ nghiệp vụ nào được bật quyền cho tài khoản này. Vui lòng liên hệ Quản lý nếu cần bổ sung quyền.
          </p>
        )}
      </section>

      <PersonalPreferencesCard />

      {/* Thẻ 4: Đổi mật khẩu giữ nguyên phiên hiện tại */}
      <form
        onSubmit={handleChangePassword}
        data-testid="profile-password-form"
        className="space-y-4 rounded-xl border bg-card p-6 shadow-sm"
      >
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <KeyRound className="h-4 w-4 text-accent-text" />
            4. Đổi mật khẩu
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Xác minh mật khẩu hiện tại trước khi lưu mật khẩu mới. Phiên làm việc trên trình duyệt này sẽ được tự động làm mới mà không làm gián đoạn công việc.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor="profile-current-password" className="text-xs font-medium">
              Mật khẩu hiện tại
            </label>
            <PasswordInput
              id="profile-current-password"
              data-testid="profile-current-password"
              toggleTestId="toggle-profile-current-password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="profile-new-password" className="text-xs font-medium">
              Mật khẩu mới
            </label>
            <PasswordInput
              id="profile-new-password"
              data-testid="profile-new-password"
              toggleTestId="toggle-profile-new-password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="profile-confirm-password" className="text-xs font-medium">
              Xác nhận mật khẩu mới
            </label>
            <PasswordInput
              id="profile-confirm-password"
              data-testid="profile-confirm-password"
              toggleTestId="toggle-profile-confirm-password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>
        </div>

        {passwordError ? (
          <div
            role="alert"
            data-testid="profile-password-error"
            className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-300"
          >
            {passwordError}
          </div>
        ) : null}

        <div className="flex justify-end border-t pt-4">
          <Button
            type="submit"
            data-testid="change-password-submit"
            disabled={changePasswordMutation.isPending}
            className="font-bold shadow-xs active:scale-[0.98] transition-transform select-none"
          >
            {changePasswordMutation.isPending ? 'Đang đổi mật khẩu...' : 'Cập nhật mật khẩu'}
          </Button>
        </div>
      </form>

      <AvatarCropDialog
        file={cropFile}
        onClose={() => setCropFile(null)}
        onConfirm={handleConfirmAvatarUpload}
        isPending={uploadAvatarMutation.isPending}
      />
    </div>
  );
}
