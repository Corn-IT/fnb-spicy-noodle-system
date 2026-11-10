# 03 — RBAC, Bảo mật & Nhân sự Lịch làm việc (RBAC, Security & HR Schedule)

> Áp dụng cho: Codex (Phase 4B — IamModule, HrScheduleModule), Antigravity (Phase 5 — Modules 5, 6, 8).

---

## 1. Authentication (JWT)

- Login: `POST /api/v1/auth/login` → `{ accessToken, refreshToken, user }`.
- `accessToken`: JWT, sống 15 phút, gửi qua header `Authorization: Bearer <token>`.
- `refreshToken`: JWT, sống 7 ngày, lưu trong httpOnly cookie.
- Password: **MUST** hash bằng `bcrypt`, tối thiểu 6 ký tự.
- **MUST** validate JWT trên mọi protected endpoint qua `JwtAuthGuard`.
- Refresh flow: `POST /api/v1/auth/refresh` → cấp lại accessToken mới.

## 2. RBAC Permission Model (Đồng bộ `02-RBAC-And-MDM-Matrix.md`)

### Cấu trúc `users.permissions` (JSONB — `UserPermissionsSchema` tại `@fnb/shared`):
```json
{
  "pos":       { "view": true, "create": true, "update": true, "delete": false, "splitKitchen": true, "tableAction": true, "checkout": true },
  "invoices":  { "view": true, "reprint": true, "void": false },
  "inventory": { "view": true, "create": true, "update": false, "delete": true },
  "cashflow":  { "view": true, "create": true, "config": false },
  "employees": { "view": true, "create": true, "update": true, "delete": false },
  "schedules": { "view": true, "update": true },
  "mdm":       { "view": true, "write": false },
  "rbac":      { "view": false, "manage": false }
}
```

### Permission Keys & Sub-permissions:
| Module | Key | Quyền CRUD & Sub-permissions |
|--------|-----|-----------------------------|
| Module 0 & 1 (Menu & POS) | `pos` | `view`, `create`, `update`, `delete`, `splitKitchen` (tách bếp), `tableAction` (MOVE/MERGE/SWAP), `checkout` (thanh toán) |
| Module 2 (Hoá đơn) | `invoices` | `view`, `reprint` (in lại bill), `void` (huỷ đơn đã PAID — bắt buộc `voidReason` >= 10 ký tự) |
| Module 3 (Nhập hàng) | `inventory` | `view`, `create`, `update`, `delete` (Thu ngân chỉ được xoá phiếu trong ca hiện tại; ngày cũ yêu cầu Quản lý/Admin) |
| Module 4 (Dòng tiền) | `cashflow` | `view`, `create` (kết ca), `config` (sửa ngân sách mặc định đầu ngày) |
| Module 5 (Nhân viên) | `employees` | `view`, `create`, `update`, `delete` |
| Module 6 (Lịch) | `schedules` | `view`, `update` (xếp ca, lưu lịch tuần, sao chép từ tuần trước) |
| Module 7 (MDM) | `mdm` | `view`, `write` (thêm/sửa/xoá danh mục gốc) |
| Module 8 (Phân quyền) | `rbac` | `view`, `manage` (chỉ Super Admin mới thao tác) |

### Custom Decorator & RbacGuard Logic:
```typescript
// apps/api-server/src/common/decorators/require-permission.decorator.ts
@RequirePermission('cashflow', 'config')
```

```
1. User authenticated? (JwtAuthGuard ở tầng 1)
   → NO  → 401 Unauthorized (NEVER 403)
2. User is_super_admin === true? (RbacGuard ở tầng 2)
   → YES → ALLOW (Bypass tất cả kiểm tra)
3. permissions[module]?.[action] === true?
   (Đối với sub-action của pos như splitKitchen/tableAction/checkout: cho phép fallback kiểm tra permissions.pos.create || permissions.pos.update nếu cờ sub-permission chưa khai báo tường minh)
   → YES → ALLOW
   → NO  → 403 Forbidden (NEVER 401)
```

### Bảng Mapping API Endpoints sang Quyền RBAC:
- `GET /api/v1/public/menu` & `POST /api/v1/public/orders/qr` → Public (Kèm `qr_token` hợp lệ)
- `GET /api/v1/pos/tables` & `GET /api/v1/pos/orders/:id/provisional-bill` → `@RequirePermission('pos', 'view')`
- `POST /api/v1/pos/orders` → `@RequirePermission('pos', 'create')`
- `PATCH /api/v1/pos/orders/:id/items` → `@RequirePermission('pos', 'update')`
- `POST /api/v1/pos/orders/:id/split-kitchen` → `@RequirePermission('pos', 'splitKitchen')`
- `POST /api/v1/pos/orders/:id/table-action` → `@RequirePermission('pos', 'tableAction')`
- `POST /api/v1/pos/orders/:id/checkout` → `@RequirePermission('pos', 'checkout')`
- `GET /api/v1/invoices` & `GET /api/v1/invoices/:id` → `@RequirePermission('invoices', 'view')`
- `POST /api/v1/invoices/:id/void` → `@RequirePermission('invoices', 'void')`
- `GET / POST / DELETE /api/v1/inventory-imports` → `@RequirePermission('inventory', 'view' | 'create' | 'delete')`
- `GET /api/v1/cashflow/settlements` → `@RequirePermission('cashflow', 'view')`
- `POST /api/v1/cashflow/settle` → `@RequirePermission('cashflow', 'create')`
- `PUT /api/v1/cashflow/default-budget` → `@RequirePermission('cashflow', 'config')`
- `GET / POST / PUT / DELETE /api/v1/employees` → `@RequirePermission('employees', 'view' | 'create' | 'update' | 'delete')`
- `GET /api/v1/schedules` → `@RequirePermission('schedules', 'view')`
- `PUT /api/v1/schedules/bulk-save` → `@RequirePermission('schedules', 'update')`
- `GET /api/v1/mdm/lookup` → `AuthenticatedOnly` (`@UseGuards(JwtAuthGuard)`, KHÔNG yêu cầu quyền MDM)
- `GET / POST / PUT / DELETE /api/v1/mdm` → `@RequirePermission('mdm', 'view' | 'write')`
- `GET /api/v1/users` → `@RequirePermission('rbac', 'view')`
- `POST /api/v1/users` & `PUT /api/v1/users/:id/permissions` → `SuperAdminOnly` (`is_super_admin = true`)
- `GET / PUT /api/v1/profile` & `PATCH /api/v1/profile/ui-prefs` → `AuthenticatedOnly`

## 3. HTTP Status Code Rules (HARD INVARIANT)

| Code | Khi nào | Ví dụ |
|------|---------|-------|
| `401` | Token missing, malformed, hoặc expired | Request không có Bearer token |
| `403` | User ĐÃ authenticated nhưng thiếu quyền | Thu ngân cố truy cập `/api/v1/cashflow/default-budget` mà không có `cashflow:config` |
| `404` | Resource không tồn tại | Order ID không tìm thấy |
| `409` | Vi phạm business rule | Merge đơn TAKEAWAY, bàn đích đã occupied khi MOVE |
| `422` | Zod validation failure | Thiếu trường bắt buộc trong request body |

- **NEVER** trả `401` khi user đã đăng nhập nhưng thiếu quyền → phải là `403`.
- **NEVER** trả `403` khi token không hợp lệ → phải là `401`.

## 4. Super Admin Rules

- `is_super_admin = true`: có **TẤT CẢ** quyền implicitly — `RbacGuard` bỏ qua kiểm tra permissions.
- Trên UI Module 8 (Phân quyền): hàng Super Admin hiển thị tất cả checkboxes nhưng ở trạng thái **disabled/readonly**.
- **CHỈ** Super Admin mới được:
  - Tạo tài khoản mới: `POST /api/v1/users`
  - Sửa quyền người khác: `PUT /api/v1/users/:id/permissions`
- Super Admin **MUST** được tạo sẵn trong `prisma/seed.ts`.

## 5. MDM Lookup API Tách biệt

- `GET /api/v1/mdm/lookup?category=INGREDIENT`:
  - Quyền: **authenticated** (bất kỳ user đã đăng nhập, KHÔNG cần quyền MDM).
  - Dùng bởi: Drawer Module 3 (autocomplete nguyên liệu), Dropdowns Module 5 (chức vụ/chuyên môn), mọi Combobox trong hệ thống.
- `CRUD /api/v1/mdm`:
  - Quyền: `mdm:view` / `mdm:write`.
  - Dùng bởi: Màn hình quản trị Module 7.
- **MUST** tách biệt 2 endpoint này — **NEVER** yêu cầu `mdm:write` cho lookup.

## 6. Liên kết Employee ↔ User (Strict 1-1)

- `employees`: lưu trữ đầy đủ hồ sơ nhân sự thực tế (`full_name`, `short_name`, `dob`, `phone`, `address`, `citizen_id`, `citizen_id_issued_place`, `start_date`, `bank_name`, `bank_account_no`, `bank_account_name`, `avatar_url`, `attachment_urls`, `note`, `position_id`, `specialty_id`).
- `users`: đăng nhập (`username`, `password_hash`), phân quyền (`is_super_admin`, `permissions`), UI preferences (`ui_preferences`), trạng thái (`is_active`).
- `users.employee_id` **MUST** là FK **UNIQUE** → `employees.id` (strict 1-to-1).
- Khi tạo nhân viên kèm tài khoản: tạo `employee` **TRƯỚC**, rồi tạo `user` linked với `employee_id`.
- Trang Hồ sơ cá nhân (Module 9) đọc từ **CẢ HAI** bảng (JOIN) và khi cập nhật thông tin cá nhân/ngân hàng/avatar sẽ đồng bộ trực tiếp về bảng `employees`.

## 7. Thuật toán Sinh Tên Viết tắt (Employee Short Name)

```typescript
function generateShortName(fullName: string, existingShortNames: string[], employeeId: number): string {
  // "Nguyễn Văn Anh" → words = ["Nguyễn", "Văn", "Anh"]
  const words = fullName.trim().split(/\s+/);
  const lastName = words[words.length - 1];           // "Anh"
  const middleInitial = words.length > 2
    ? words[words.length - 2][0] + '.'                // "V."
    : '';
  let shortName = `${middleInitial}${lastName}`;      // "V.Anh"

  if (existingShortNames.includes(shortName)) {
    // Collision → add first name initial + " (#ID)"
    const firstInitial = words[0][0] + '.';           // "N."
    shortName = `${firstInitial}${middleInitial}${lastName} (#${employeeId})`; // "N.V.Anh (#12)"
  }

  return shortName;
}
```

- Hiển thị trong ô lịch làm việc Module 6 dưới dạng tags có màu theo chuyên môn:
  - `BEP_NAU` → tag màu đỏ
  - `BEP_CHIEN` → tag màu cam
  - `PHA_CHE` → tag màu xanh dương

## 8. Lịch làm việc (Module 6 — Excel-style Matrix)

### Cấu trúc dữ liệu:
- 7 cột (Thứ 2 → Chủ nhật) × N hàng (khung giờ).
- Mỗi ô là **Multi-select Dropdown** hiển thị `short_name` nhân viên.
- Tags có màu theo `specialty` của nhân viên.

### API:
- `GET /api/v1/schedules?weekStartDate=2026-11-02` → lấy ma trận tuần.
- `PUT /api/v1/schedules/bulk-save` → lưu toàn bộ tuần trong 1 request.
- Copy từ tuần trước: API hỗ trợ clone schedule tuần trước.

### Unsaved Changes Guard:
- **MUST** implement `window.addEventListener('beforeunload', handler)` — bắt close/refresh.
- **MUST** implement React Router navigation blocker — bắt chuyển trang in-app.
- Hiển thị dialog: `"Bạn có thay đổi chưa lưu. Bạn có chắc muốn rời trang?"`.
- **MUST** active khi grid đã bị sửa nhưng chưa save.
- **MUST** deactivate sau khi save thành công.

### Edge case:
- Nhân viên bị soft-delete giữa tuần → hiển thị tên xám (grayed out) trong ô lịch, **NEVER** crash.
