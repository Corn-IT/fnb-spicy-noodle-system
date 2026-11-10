import { defaultUserPermissions, type MdmItem } from '@fnb/shared';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';

import {
  type EmployeeRecord,
  useCreateEmployeeMutation,
  useUpdateEmployeeMutation,
} from '../api/employees.api';

export interface EmployeeFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit' | 'view';
  employee: EmployeeRecord | null;
  positions: MdmItem[];
  specialties: MdmItem[];
}

interface FormState {
  fullName: string;
  dob: string;
  phone: string;
  address: string;
  citizenId: string;
  citizenIdIssuedPlace: string;
  positionId: string;
  specialtyId: string;
  startDate: string;
  bankName: string;
  bankAccountNo: string;
  bankAccountName: string;
  avatarUrl: string;
  note: string;
  createAccount: boolean;
  username: string;
  password: string;
}

function buildInitial(employee: EmployeeRecord | null): FormState {
  if (!employee) {
    return {
      fullName: '',
      dob: '',
      phone: '',
      address: '',
      citizenId: '',
      citizenIdIssuedPlace: '',
      positionId: '',
      specialtyId: '',
      startDate: '',
      bankName: '',
      bankAccountNo: '',
      bankAccountName: '',
      avatarUrl: '',
      note: '',
      createAccount: false,
      username: '',
      password: '',
    };
  }
  return {
    fullName: employee.fullName,
    dob: employee.dob ?? '',
    phone: employee.phone ?? '',
    address: employee.address ?? '',
    citizenId: employee.citizenId ?? '',
    citizenIdIssuedPlace: employee.citizenIdIssuedPlace ?? '',
    positionId: String(employee.positionId),
    specialtyId: String(employee.specialtyId),
    startDate: employee.startDate ?? '',
    bankName: employee.bankName ?? '',
    bankAccountNo: employee.bankAccountNo ?? '',
    bankAccountName: employee.bankAccountName ?? '',
    avatarUrl: employee.avatarUrl ?? '',
    note: employee.note ?? '',
    createAccount: false,
    username: '',
    password: '',
  };
}

export function EmployeeFormDrawer({
  open,
  onOpenChange,
  mode,
  employee,
  positions,
  specialties,
}: EmployeeFormDrawerProps) {
  const [form, setForm] = React.useState<FormState>(() => buildInitial(employee));
  const createMutation = useCreateEmployeeMutation();
  const updateMutation = useUpdateEmployeeMutation(employee?.id ?? 0);

  React.useEffect(() => {
    if (open) {
      setForm(buildInitial(employee));
    }
  }, [open, employee]);

  const isReadonly = mode === 'view';
  const isCreate = mode === 'create';
  const isPending = createMutation.isPending || updateMutation.isPending;

  const update = (field: keyof FormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (isReadonly) return;

    const posId = Number(form.positionId);
    const specId = Number(form.specialtyId);

    if (!form.fullName.trim() || !posId || !specId) {
      toast({ variant: 'destructive', title: 'Vui lòng điền đầy đủ Họ tên, Chức vụ và Chuyên môn' });
      return;
    }

    try {
      if (isCreate) {
        await createMutation.mutateAsync({
          fullName: form.fullName.trim(),
          dob: form.dob || null,
          phone: form.phone || null,
          address: form.address || null,
          citizenId: form.citizenId || null,
          citizenIdIssuedPlace: form.citizenIdIssuedPlace || null,
          positionId: posId,
          specialtyId: specId,
          startDate: form.startDate || null,
          bankName: form.bankName || null,
          bankAccountNo: form.bankAccountNo || null,
          bankAccountName: form.bankAccountName || null,
          avatarUrl: form.avatarUrl || null,
          attachmentUrls: [],
          note: form.note || null,
          account:
            form.createAccount && form.username && form.password
              ? {
                  username: form.username,
                  password: form.password,
                  permissions: defaultUserPermissions,
                }
              : undefined,
        });
        toast({ variant: 'success', title: 'Tạo nhân viên thành công' });
      } else {
        await updateMutation.mutateAsync({
          fullName: form.fullName.trim(),
          dob: form.dob || null,
          phone: form.phone || null,
          address: form.address || null,
          citizenId: form.citizenId || null,
          citizenIdIssuedPlace: form.citizenIdIssuedPlace || null,
          positionId: posId,
          specialtyId: specId,
          startDate: form.startDate || null,
          bankName: form.bankName || null,
          bankAccountNo: form.bankAccountNo || null,
          bankAccountName: form.bankAccountName || null,
          avatarUrl: form.avatarUrl || null,
          attachmentUrls: [],
          note: form.note || null,
        });
        toast({ variant: 'success', title: 'Cập nhật nhân viên thành công' });
      }
      onOpenChange(false);
    } catch {
      toast({ variant: 'destructive', title: isCreate ? 'Tạo nhân viên thất bại' : 'Cập nhật thất bại' });
    }
  };

  const title =
    mode === 'create'
      ? 'Thêm nhân viên mới'
      : mode === 'edit'
        ? 'Chỉnh sửa hồ sơ nhân sự'
        : 'Chi tiết hồ sơ nhân sự';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0 overflow-hidden" data-testid="employee-form-drawer">
        <SheetHeader className="p-5 border-b shrink-0 text-left bg-card pr-12">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {isCreate
              ? 'Nhập thông tin nhân viên và tuỳ chọn tạo tài khoản liên kết 1-1.'
              : employee?.user
                ? `Tài khoản: ${employee.user.username}`
                : 'Chưa có tài khoản đăng nhập.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-5 flex flex-col gap-3">
          <FieldRow label="Họ và tên *">
            <Input data-testid="emp-fullname" value={form.fullName} readOnly={isReadonly} onChange={(e) => update('fullName', e.target.value)} />
          </FieldRow>
          <FieldRow label="Ngày sinh">
            <Input data-testid="emp-dob" type="date" value={form.dob} readOnly={isReadonly} onChange={(e) => update('dob', e.target.value)} />
          </FieldRow>
          <FieldRow label="Số điện thoại">
            <Input data-testid="emp-phone" value={form.phone} readOnly={isReadonly} onChange={(e) => update('phone', e.target.value)} />
          </FieldRow>
          <FieldRow label="Địa chỉ">
            <Input data-testid="emp-address" value={form.address} readOnly={isReadonly} onChange={(e) => update('address', e.target.value)} />
          </FieldRow>
          <FieldRow label="Số CCCD">
            <Input data-testid="emp-citizen-id" value={form.citizenId} readOnly={isReadonly} onChange={(e) => update('citizenId', e.target.value)} />
          </FieldRow>
          <FieldRow label="Nơi cấp CCCD">
            <Input data-testid="emp-citizen-issued" value={form.citizenIdIssuedPlace} readOnly={isReadonly} onChange={(e) => update('citizenIdIssuedPlace', e.target.value)} />
          </FieldRow>

          <FieldRow label="Chức vụ *">
            <Select value={form.positionId} onValueChange={(v) => update('positionId', v)} disabled={isReadonly}>
              <SelectTrigger data-testid="emp-position-select">
                <SelectValue placeholder="Chọn chức vụ" />
              </SelectTrigger>
              <SelectContent>
                {positions.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow label="Chuyên môn *">
            <Select value={form.specialtyId} onValueChange={(v) => update('specialtyId', v)} disabled={isReadonly}>
              <SelectTrigger data-testid="emp-specialty-select">
                <SelectValue placeholder="Chọn chuyên môn" />
              </SelectTrigger>
              <SelectContent>
                {specialties.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow label="Ngày bắt đầu">
            <Input data-testid="emp-start-date" type="date" value={form.startDate} readOnly={isReadonly} onChange={(e) => update('startDate', e.target.value)} />
          </FieldRow>

          <FieldRow label="Ngân hàng">
            <Input data-testid="emp-bank-name" value={form.bankName} readOnly={isReadonly} onChange={(e) => update('bankName', e.target.value)} />
          </FieldRow>
          <FieldRow label="Số tài khoản">
            <Input data-testid="emp-bank-account-no" value={form.bankAccountNo} readOnly={isReadonly} onChange={(e) => update('bankAccountNo', e.target.value)} />
          </FieldRow>
          <FieldRow label="Chủ tài khoản">
            <Input data-testid="emp-bank-account-name" value={form.bankAccountName} readOnly={isReadonly} onChange={(e) => update('bankAccountName', e.target.value)} />
          </FieldRow>
          <FieldRow label="Ghi chú">
            <Input data-testid="emp-note" value={form.note} readOnly={isReadonly} onChange={(e) => update('note', e.target.value)} />
          </FieldRow>

          {isCreate ? (
            <div className="mt-2 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="create-account-checkbox"
                  data-testid="create-account-checkbox"
                  checked={form.createAccount}
                  onCheckedChange={(checked) => update('createAccount', !!checked)}
                />
                <label htmlFor="create-account-checkbox" className="text-sm font-medium">
                  Tạo tài khoản đăng nhập (liên kết 1-1)
                </label>
              </div>
              {form.createAccount ? (
                <div className="mt-3 flex flex-col gap-2">
                  <FieldRow label="Tên đăng nhập">
                    <Input data-testid="emp-username" value={form.username} onChange={(e) => update('username', e.target.value)} />
                  </FieldRow>
                  <FieldRow label="Mật khẩu">
                    <Input data-testid="emp-password" type="password" value={form.password} onChange={(e) => update('password', e.target.value)} />
                  </FieldRow>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {!isReadonly ? (
          <SheetFooter className="p-4 border-t bg-muted/20 shrink-0 flex flex-row items-center justify-end gap-2">
            <Button
              variant="outline"
              className="h-9 px-4 font-semibold active:scale-[0.98]"
              onClick={() => onOpenChange(false)}
            >
              Huỷ
            </Button>
            <Button
              data-testid="submit-employee-btn"
              className="h-9 px-4 font-semibold active:scale-[0.98] shadow-xs"
              onClick={handleSubmit}
              disabled={isPending}
            >
              {isCreate ? 'Tạo nhân viên' : 'Lưu thay đổi'}
            </Button>
          </SheetFooter>
        ) : (
          <SheetFooter className="p-4 border-t bg-muted/20 shrink-0 flex flex-row items-center justify-end">
            <Button
              variant="outline"
              className="h-9 px-4 font-semibold active:scale-[0.98]"
              onClick={() => onOpenChange(false)}
            >
              Đóng
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
