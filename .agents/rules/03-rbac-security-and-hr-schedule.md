---
trigger: model_decision
description: JWT authentication, RBAC roles and permissions, security guards, rate limiting, and HR work-schedule rules.
---

# 03 — RBAC, Single-Session, Bảo mật & Nhân sự / Bảng công / Bảng lương

> Áp dụng cho: Mọi Agent làm việc trên `IamModule`, `HrScheduleModule` (Employees, Schedules, Payroll), `RbacGuard`, `JwtAuthGuard`, và các màn hình `/rbac`, `/employees`, `/schedules`, `/payroll`, `/profile`. Đồng bộ 100% với `packages/shared/src/schemas/rbac.schema.ts` và `docs/bmad/02-RBAC-And-MDM-Matrix.md`.

---

## 1. Authentication (JWT) & Single-Session Policy

- **Login:** `POST /api/v1/auth/login` (`{ username, password, force? }`) → `{ accessToken, user }` + httpOnly cookie `refreshToken`.
- **Single-Session (`active_session_id`):**
  - Nếu tài khoản đang có kết nối socket online (`isSessionOnline(activeSessionId)`) và `force !== true` → trả `409 Conflict` (`AUTH_SESSION_CONFLICT_ONLINE`).
  - Khi đăng nhập thành công (`force: true` hoặc phiên cũ offline): sinh `active_session_id` mới, lưu IP/thiết bị/User-Agent, phát `session:revoked` tới room `user_session_{oldSid}` để đá phiên cũ tức thì và ghi `AuditLog`.
- **`accessToken`:** TTL `15m`, Header `Authorization: Bearer <token>`, claims `{ sub, tokenType: 'access', sid }`.
- **`refreshToken`:** TTL `7d`, httpOnly cookie (`refresh-cookie.util.ts`), đối khớp `active_session_id` qua `POST /api/v1/auth/refresh`.
- **Mật khẩu:** `bcryptjs` cost = `10`, độ dài `6–128` ký tự, chống timing attack bằng `DUMMY_PASSWORD_HASH`.
- **Rate Limiting:** `RateLimitGuard` (global `APP_GUARD`) tách riêng bucket cho `/auth/refresh` và `/auth/login` để tránh `429` khi nhiều thiết bị dùng chung Wi-Fi quán.

---

## 2. RBAC Permission Model — 14 Nhóm Quyền (`rbac.schema.ts`)

`UserPermissionsSchema` (có `normalizeLegacyPermissions` tự chuyển đổi dữ liệu cũ `mdm.write` / `rbac.manage`):

| # | Module Key | Quyền chi tiết (`boolean`) |
|:-:|:---|:---|
| 1 | `dashboard` | `view`, `viewProfit`, `export` |
| 2 | `pos` | `view`, `create`, `update`, `delete`, `splitKitchen`, `tableAction`, `checkout`, `qrSecurity` *(strict)*, `manualDiscount` *(strict)*, `openCashDrawer` *(strict)* |
| 3 | `menu` | `view`, `create`, `update`, `delete`, `manageStations`, `manageCategories`, `import`, `export` |
| 4 | `invoices` | `view`, `reprint`, `update` *(gửi yêu cầu sửa PTTT)*, `approve` *(duyệt/từ chối sửa PTTT)*, `void` *(huỷ đơn PAID, `voidReason >= 10`)*, `export` |
| 5 | `inventory` | `view`, `create`, `update`, `delete`, `export` |
| 6 | `cashflow` | `view`, `create` *(chốt ca)*, `compensate` *(bù chênh lệch)*, `config` *(ngân sách đầu ca)*, `export` |
| 7 | `employees` | `view`, `create`, `update`, `delete`, `export` |
| 8 | `schedules` | `view`, `create`, `update`, `delete`, `export` |
| 9 | `payroll` | `view`, `update`, `config`, `export` |
| 10 | `discounts` | `view`, `create`, `update`, `delete` |
| 11 | `mdm` | `view`, `create`, `update`, `delete` |
| 12 | `rbac` | `view`, `create`, `update`, `resetPassword` |
| 13 | `paymentQr` | `view`, `create`, `update`, `delete` |
| 14 | `settings` | `view`, `update` |

### Decorators & `RbacGuard` (`apps/api-server/src/common/decorators/permissions.decorator.ts`)
- 3 Decorators chuẩn: `@RequirePermission(module, action)`, `@RequireAnyPermission(...reqs)`, `@SuperAdminOnly()`.
- Luồng kiểm tra:
  1. `JwtAuthGuard` (Tầng 1): Thiếu token / token hỏng / hết hạn / phiên bị thu hồi → **`401 Unauthorized`** (**NEVER** `403`).
  2. `RbacGuard` (Tầng 2): `user.isSuperAdmin === true` → **ALLOW** (bypass toàn bộ).
  3. Nếu `@SuperAdminOnly()` → **`403 Forbidden`** (`RBAC_SUPER_ADMIN_REQUIRED`).
  4. Kiểm tra `permissions[module][action] === true` (chỉ fallback sang `pos.create || pos.update` cho 3 sub-action `splitKitchen`, `tableAction`, `checkout` khi key chưa khai báo; `qrSecurity`, `manualDiscount`, `openCashDrawer` kiểm tra **strict**). Thiếu quyền → **`403 Forbidden`** (`RBAC_PERMISSION_DENIED`, **NEVER** `401`).

### Mapping Endpoints Chính (xem bảng đầy đủ tại `docs/bmad/02-RBAC-And-MDM-Matrix.md` §5)
- `GET /api/v1/mdm/lookup` → **`JwtAuthGuard` (`AuthenticatedOnly` — Hard Invariant 8)**, KHÔNG đòi quyền `mdm:*`.
- `GET/POST/PUT/DELETE /api/v1/mdm` → `mdm:view|create|update|delete`.
- `GET /api/v1/users` → `rbac:view` (ẩn IP/thiết bị phiên đối với non-SuperAdmin).
- `POST /api/v1/users`, `PUT /api/v1/users/:id`, `PUT /api/v1/users/:id/permissions`, `POST /api/v1/users/:id/reset-password`, `GET /api/v1/users/:id/session-history`, `POST /api/v1/users/:id/revoke-session` → **`@SuperAdminOnly()`**.
- `GET /api/v1/audit-logs/:module` → `JwtAuthGuard` + quyền `view` của module tương ứng (riêng `RBAC` chỉ Super Admin; IP/thiết bị chỉ trả cho Super Admin).
- `GET/PUT/PATCH/DELETE /api/v1/profile/*` & `GET /api/v1/store-messages` → `AuthenticatedOnly`.

---

## 3. HTTP Status Code Rules (Hard Invariant 8)

| Code | Khi nào | Ví dụ |
|------|---------|-------|
| `401` | Thiếu token, token hỏng/hết hạn, sai mật khẩu, phiên single-session bị thu hồi | `AUTH_TOKEN_EXPIRED`, `AUTH_SESSION_REVOKED` |
| `403` | Đã xác thực hợp lệ nhưng thiếu quyền / không phải Super Admin | `RBAC_PERMISSION_DENIED`, `RBAC_SUPER_ADMIN_REQUIRED` |
| `404` | Resource không tồn tại | Order/Employee/Discount ID không tồn tại |
| `409` | Xung đột phiên online hoặc vi phạm quy tắc nghiệp vụ | `AUTH_SESSION_CONFLICT_ONLINE`, `POS_TABLE_NOT_AVAILABLE`, `PAYMENT_QR_IN_USE` |
| `422` | Sai Zod Schema validation | `VALIDATION_FAILED` |

---

## 4. Super Admin & 4 Tài khoản Seed Chuẩn (`seed-data.ts`)

- 4 tài khoản seed (mật khẩu mặc định `Password@123`): `superadmin` (`isSuperAdmin: true`), `admin` (quản lý vận hành), `adminview` (chỉ xem & xuất báo cáo), `thungan` (thu ngân quầy).
- Trên UI `/rbac`: tách riêng **Drawer Thông tin tài khoản** (`username`, `roleLabel`, liên kết nhân sự, `isActive`) và **Drawer Phân quyền** (14 nhóm quyền, đẩy realtime qua `account:permissions_updated`). Tài khoản Super Admin luôn readonly, không thể tự hạ quyền hay vô hiệu hoá.

---

## 5. Nhân sự (1-1), Bảng công & Bảng tính lương (`HrScheduleModule`)

### 5.1. Liên kết Employee ↔ User (Strict 1-1) & Short Name
- `users.employee_id` là `UNIQUE FK → employees.id`. Danh sách `/employees` hiển thị ánh xạ tài khoản liên kết; hồ sơ `/profile` đọc/ghi đồng bộ về `employees`.
- Thuật toán `generateShortName`: `"Nguyễn Văn Anh"` → `"V.Anh"`; khi trùng → `"N.V.Anh (#12)"`.
- Hỗ trợ tạm ngưng/khôi phục (`PATCH /api/v1/employees/:id/status`) và xoá vĩnh viễn (`DELETE /api/v1/employees/:id/permanent` khi chưa có phát sinh).

### 5.2. Bảng công Tuần (`/schedules`)
- API: `GET /api/v1/schedules?weekStartDate=...`, `PUT /api/v1/schedules/bulk-save`, `POST /api/v1/schedules/copy-previous-week`.
- Mỗi ô hỗ trợ 2 chế độ chấm công: **`FULL_SHIFT`** (đủ ca) và **`CUSTOM_HOURS`** (`startTime`–`endTime`).
- **Unsaved Changes Guard:** Bắt buộc cài đủ 2 lớp (`beforeunload` + React Router blocker + cảnh báo chuyển tuần khi chưa lưu).
- **Edge case `EC-HR-02`:** Nhân viên đã `is_deleted = true` vẫn hiển thị xám mờ kèm `(Đã nghỉ)` trên bảng công & bảng lương, không gây crash.

### 5.3. Bảng tính Lương (`/payroll`)
- API: `GET /api/v1/payroll?fromDate=&toDate=`, `PUT /api/v1/payroll/config` (`payroll:config`), `PUT /api/v1/payroll/employees/:employeeId` (`payroll:update`).
- Tự tổng hợp `scheduleFullShiftDays` và `scheduleCustomHours` từ `work_schedules`; hỗ trợ `FULL_TIME` (mặc định `7.000.000đ / 28 công / 12h`) và `PART_TIME` (mặc định `25.000đ/giờ`), ghi đè công/giờ, lương riêng và thưởng/phạt (`bonusOrAdjustment`).
