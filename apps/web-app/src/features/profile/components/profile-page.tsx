import { ChangePasswordSchema, UpdateProfileSchema } from '@fnb/shared';
import { Building2, Camera, MapPin, Phone, Save, ShieldCheck, UserCheck } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import {
  useMyProfileQuery,
  useChangePasswordMutation,
  useUpdateProfileMutation,
} from '@/features/profile/api/profile.api';

export function ProfilePage() {
  const { data: profile, isLoading } = useMyProfileQuery();
  const updateMutation = useUpdateProfileMutation();
  const changePasswordMutation = useChangePasswordMutation();

  const [fullName, setFullName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [bankName, setBankName] = React.useState('');
  const [bankAccountNo, setBankAccountNo] = React.useState('');
  const [bankAccountName, setBankAccountName] = React.useState('');
  const [avatarUrl, setAvatarUrl] = React.useState('');
  const [cropScale, setCropScale] = React.useState<number>(100);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [passwordError, setPasswordError] = React.useState<string | null>(null);

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
      toast({
        variant: 'success',
        title: 'Đã lưu hồ sơ cá nhân',
        description: 'Thông tin nhân sự (employees) đã được đồng bộ 1-1 thành công.',
      });
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
      toast({
        variant: 'success',
        title: 'Đã đổi mật khẩu',
        description: 'Mật khẩu mới đã được lưu an toàn.',
      });
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Không thể đổi mật khẩu');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-64 w-full animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  const emp = profile?.employee;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Hồ sơ Tài khoản Cá nhân
          </h1>
          <p className="text-sm text-muted-foreground">
            Liên kết 1-1 giữa Tài khoản đăng nhập (`users`) và Hồ sơ Nhân sự (`employees`)
          </p>
        </div>

        {/* AC-08.4: Chức vụ & Chuyên môn hiển thị dạng Badge READONLY */}
        <div className="flex flex-wrap items-center gap-2" data-testid="profile-readonly-badges">
          <div className="flex items-center gap-1.5 rounded-lg border bg-muted/40 px-3 py-1.5">
            <UserCheck className="h-4 w-4 text-primary shrink-0" />
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
      </div>

      <form onSubmit={handleSaveProfile} className="grid gap-6 md:grid-cols-3">
        {/* Cột trái: Avatar Crop & Resize + Định danh Readonly */}
        <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-primary/30 bg-muted">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={fullName || 'Avatar'}
                  style={{ transform: `scale(${cropScale / 100})` }}
                  className="h-full w-full object-cover transition-transform"
                />
              ) : (
                <Camera className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="font-semibold text-foreground">
                {emp?.fullName ?? 'Nhân viên'}
              </p>
              <p className="text-xs text-muted-foreground">
                Tên viết tắt lịch tuần:{' '}
                <span className="font-mono font-semibold text-primary">
                  {emp?.shortName ?? 'N/A'}
                </span>
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <label
              htmlFor="profile-avatar-url"
              className="text-xs font-medium text-muted-foreground"
            >
              URL Ảnh đại diện (Cloudflare R2)
            </label>
            <Input
              id="profile-avatar-url"
              placeholder="https://assets.fnb.vn/avatar.jpg"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="profile-avatar-scale"
              className="flex justify-between text-xs text-muted-foreground"
            >
              <span>Thu phóng / Cắt khung ảnh</span>
              <span>{cropScale}%</span>
            </label>
            <input
              id="profile-avatar-scale"
              type="range"
              min={80}
              max={150}
              value={cropScale}
              onChange={(e) => setCropScale(Number(e.target.value))}
              className="w-full accent-primary"
            />
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
              <Building2 className="h-4 w-4 text-primary" />
              2. Tài khoản Ngân hàng Nhận lương
            </h2>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor="profile-bank-name" className="text-xs font-medium">
                  Tên ngân hàng
                </label>
                <Input
                  id="profile-bank-name"
                  placeholder="VD: Vietcombank, MB Bank"
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

      <form
        onSubmit={handleChangePassword}
        data-testid="profile-password-form"
        className="space-y-4 rounded-xl border bg-card p-6 shadow-sm"
      >
        <div>
          <h2 className="text-base font-semibold text-foreground">3. Đổi mật khẩu</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Xác minh mật khẩu hiện tại trước khi lưu mật khẩu mới.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor="profile-current-password" className="text-xs font-medium">Mật khẩu hiện tại</label>
            <Input
              id="profile-current-password"
              data-testid="profile-current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="profile-new-password" className="text-xs font-medium">Mật khẩu mới</label>
            <Input
              id="profile-new-password"
              data-testid="profile-new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="profile-confirm-password" className="text-xs font-medium">Xác nhận mật khẩu mới</label>
            <Input
              id="profile-confirm-password"
              data-testid="profile-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>
        </div>

        {passwordError ? (
          <div role="alert" data-testid="profile-password-error" className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-300">
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
    </div>
  );
}
