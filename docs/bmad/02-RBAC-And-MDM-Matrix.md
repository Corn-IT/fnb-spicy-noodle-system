# BMAD Phân quyền & Chuẩn hoá Dữ liệu Dùng chung
# 02-RBAC-And-MDM-Matrix.md — Ma trận Phân quyền (14 Phân hệ) & Quản trị Master Data (7 Danh mục)

> **Tài liệu:** `docs/bmad/02-RBAC-And-MDM-Matrix.md`  
> **Phiên bản:** 2.0.0 (Synced with Production Codebase — Stories 01–21)  
> **Vai trò thực hiện:** BMAD Business Analyst & System Architect  
> **Trạng thái:** FINAL & SYNCED  
> **Ngày phê duyệt gốc:** 2026-11-07 · **Ngày cập nhật đồng bộ:** 2026-11-26  
> **Nguồn sự thật đối chiếu:** `packages/shared/src/schemas/rbac.schema.ts`, `packages/shared/src/enums/mdm-cashflow.enum.ts`, `apps/api-server/src/common/guards/rbac.guard.ts`, `apps/api-server/prisma/seed-data.ts`, và toàn bộ 15 NestJS Controllers  
> **Quy chuẩn tuân thủ:** Hard Invariant 7 (MDM Chuẩn hoá chuỗi) & Hard Invariant 8 (RBAC 401 vs 403)

---

## 1. KIẾN TRÚC BẢO MẬT, SINGLE-SESSION & XÁC THỰC (AUTHENTICATION & GUARDS)

### 1.1. Chu trình Xác thực Hai Lớp (JWT Access + Refresh Token) & Single-Session Policy
Hệ thống áp dụng xác thực JWT kết hợp **Chính sách Một Phiên Hoạt Động (`active_session_id`)** để đảm bảo an toàn tài khoản trên máy POS dùng chung:

```
[Client / POS Web App] ── 1. POST /api/v1/auth/login { username, password, force? } ──► [IamController]
                       ├── Nếu đang có phiên khác online & force !== true ──► 409 AUTH_SESSION_CONFLICT_ONLINE
                       ├── Nếu hợp lệ / force=true: Cấp sessionId mới, phát 'session:revoked' đá phiên cũ
                       ◄── 2. AccessToken (Body 15m, chứa sid) + RefreshToken (httpOnly Cookie 7d)

[Mỗi Request API]      ── 3. Header Bearer <AccessToken> ──► [JwtAuthGuard]
                                                             ├── Kiểm tra JWT + active_session_id khớp DB
                                                             ├── Hợp lệ  ──► [RbacGuard]
                                                             └── Lỗi / Bị đá phiên / Hết hạn ──► 401 Unauthorized

[Khi nhận mã 401]      ── 4. POST /api/v1/auth/refresh ────► [Cấp AccessToken mới nếu sid còn khớp]
```

- **AccessToken:**
  - Ký bởi `FNB_JWT_SECRET ?? JWT_SECRET` (tối thiểu 64 ký tự).
  - TTL mặc định: `15m` (`FNB_JWT_EXPIRES_IN ?? JWT_EXPIRES_IN`).
  - Claims chính: `sub` (`userId`), `tokenType: 'access'`, `sid` (`activeSessionId`).
- **RefreshToken:**
  - TTL mặc định: `7d` (`FNB_JWT_REFRESH_EXPIRES_IN ?? JWT_REFRESH_EXPIRES_IN`).
  - Vận chuyển trong Cookie `httpOnly` (`refresh-cookie.util.ts`), kiểm tra khớp `active_session_id`.
- **Single-Session & Thu hồi Phiên:**
  - Lưu `active_session_id`, `active_session_ip`, `active_session_device`, `active_session_agent`, `active_session_at`, `last_revoked_notice` trong bảng `users`.
  - Lý do thu hồi phiên (`SessionRevokeReason`): `NEW_LOGIN`, `ADMIN_REVOKED`, `PASSWORD_CHANGED`, `ACCOUNT_DISABLED`, `LOGGED_OUT`.
  - Khi bị thu hồi hoặc đăng nhập đè, `PosSocketGateway` phát `session:revoked` vào room `user_session_{sessionId}` và ngắt kết nối socket phiên cũ sau 100ms.
- **Mật khẩu:**
  - Mã hoá `bcryptjs` cost factor = `10`, độ dài `6–128` ký tự.
  - Chống timing attack khi user không tồn tại hoặc bị khoá (`DUMMY_PASSWORD_HASH`).

### 1.2. Cơ chế Guard Hai Tầng tại Backend NestJS
1. **Tầng 1 — `JwtAuthGuard`:**
   - Xác thực Bearer token, trạng thái `isActive`, `employee.isDeleted = false`, và đối khớp `activeSessionId`.
   - Mọi lỗi danh tính / hết hạn / phiên bị thu hồi → **LUÔN TRẢ HTTP `401 Unauthorized`**.
2. **Tầng 2 — `RbacGuard` (`apps/api-server/src/common/guards/rbac.guard.ts`):**
   - Hỗ trợ 3 Decorator trong `permissions.decorator.ts`:
     - `@RequirePermission(module, action)`
     - `@RequireAnyPermission(...requirements)`
     - `@SuperAdminOnly()`
   - Nếu `user.isSuperAdmin === true` → **BYPASS toàn bộ kiểm tra**.
   - Đối với `pos:splitKitchen`, `pos:tableAction`, `pos:checkout`: hỗ trợ tương thích ngược nếu trường chưa khai báo (`undefined`) và `pos.create === true || pos.update === true`.
   - Đối với `pos:manualDiscount`, `pos:qrSecurity`, `pos:openCashDrawer` và mọi quyền nhạy cảm khác: kiểm tra **strict** (không fallback).
   - Thiếu quyền → **LUÔN TRẢ HTTP `403 Forbidden`** (`RBAC_PERMISSION_DENIED` hoặc `RBAC_SUPER_ADMIN_REQUIRED`).

---

## 2. QUY TẮC MÃ LỖI HTTP BẤT BIẾN (HARD INVARIANT 8)

> [!CAUTION]
> **Quy tắc Vàng về Mã Lỗi HTTP:**
> - `401 Unauthorized`: **CHỈ DÙNG** khi thiếu token, token sai/hết hạn, sai mật khẩu, hoặc phiên đã bị thu hồi.
> - `403 Forbidden`: **CHỈ DÙNG** khi đã xác thực hợp lệ nhưng thiếu quyền thực hiện thao tác.
> - `GET /api/v1/mdm/lookup`: **BẮT BUỘC** chỉ dùng `@UseGuards(JwtAuthGuard)` (mở cho mọi tài khoản đã đăng nhập, không đòi quyền `mdm:*`).

| HTTP Code | Error Type | Tình huống Kích hoạt | Mã lỗi tiêu biểu (`ErrorCodes`) |
|:---:|:---|:---|:---|
| **`401`** | `Unauthorized` | Thiếu token, token hết hạn, sai mật khẩu, phiên bị thu hồi | `AUTH_TOKEN_MISSING`, `AUTH_TOKEN_EXPIRED`, `AUTH_CREDENTIALS_INVALID`, `AUTH_SESSION_REVOKED` |
| **`403`** | `Forbidden` | Thiếu quyền phân hệ / sub-permission hoặc gọi API `SuperAdminOnly` | `RBAC_PERMISSION_DENIED`, `RBAC_SUPER_ADMIN_REQUIRED` |
| **`409`** | `Conflict` | Xung đột phiên đang online, vi phạm quy tắc bàn/QR/giảm giá/thanh toán | `AUTH_SESSION_CONFLICT_ONLINE`, `POS_TABLE_NOT_AVAILABLE`, `POS_TAKEAWAY_CANNOT_MERGE`, `PAYMENT_QR_IN_USE`, `PAYMENT_QR_LOCKED_FIELD` |
| **`422`** | `Unprocessable` | Sai schema validation Zod (`ZodValidationPipe`) | `VALIDATION_FAILED` |

---

## 3. CẤU TRÚC DỮ LIỆU PHÂN QUYỀN (14-MODULE JSONB PERMISSIONS SCHEMA)

Định nghĩa thực tế tại `packages/shared/src/schemas/rbac.schema.ts` (có `normalizeLegacyPermissions` tự động ánh xạ các bản ghi cũ `mdm.write` → `create/update/delete` và `rbac.manage` → `create/update/resetPassword`):

| # | Module Key | Các Quyền Con (Boolean Flags) | Ghi chú Nghiệp vụ |
|:-:|:---|:---|:---|
| 1 | `dashboard` | `view`, `viewProfit`, `export` | `viewProfit` mở KPI lợi nhuận gộp & chi phí lương ước tính |
| 2 | `pos` | `view`, `create`, `update`, `delete`, `splitKitchen`, `tableAction`, `checkout`, `qrSecurity`, `manualDiscount`, `openCashDrawer` | `manualDiscount`, `qrSecurity`, `openCashDrawer` kiểm tra nghiêm ngặt không fallback |
| 3 | `menu` | `view`, `create`, `update`, `delete`, `manageStations`, `manageCategories`, `import`, `export` | Tách riêng quyền quản lý trạm bếp, danh mục con và nhập/xuất Excel |
| 4 | `invoices` | `view`, `reprint`, `update`, `approve`, `void`, `export` | `update` gửi yêu cầu sửa PTTT; `approve` duyệt/từ chối sửa PTTT; `void` huỷ hoá đơn đã thu tiền |
| 5 | `inventory` | `view`, `create`, `update`, `delete`, `export` | Nhập hàng kho nguyên vật liệu & xoá mềm phiếu nhập |
| 6 | `cashflow` | `view`, `create`, `compensate`, `config`, `export` | `create` chốt kết ca; `compensate` bù chênh lệch; `config` sửa ngân sách đầu ca |
| 7 | `employees` | `view`, `create`, `update`, `delete`, `export` | Hồ sơ nhân sự, đổi trạng thái, xoá mềm / xoá vĩnh viễn |
| 8 | `schedules` | `view`, `create`, `update`, `delete`, `export` | Bảng công / Lịch làm việc tuần & sao chép tuần trước |
| 9 | `payroll` | `view`, `update`, `config`, `export` | Bảng tính lương, cấu hình công thức lương & chỉnh sửa lương từng nhân viên |
| 10 | `discounts` | `view`, `create`, `update`, `delete` | Quản lý mã giảm giá & chương trình khuyến mãi |
| 11 | `mdm` | `view`, `create`, `update`, `delete` | Quản trị 7 danh mục Master Data (riêng `/mdm/lookup` mở cho mọi authenticated user) |
| 12 | `rbac` | `view`, `create`, `update`, `resetPassword` | Riêng thao tác ghi tài khoản/quyền/mật khẩu/thu hồi phiên trong `UsersController` đang khoá chặt `@SuperAdminOnly()` |
| 13 | `paymentQr` | `view`, `create`, `update`, `delete` | Quản lý mã QR thanh toán & thứ tự ưu tiên xoay vòng |
| 14 | `settings` | `view`, `update` | Cài đặt cửa hàng động (branding, theme, 5 mẫu phiếu in, message catalog, display scale) |

### 3.1. Đặc quyền Bất biến của Super Admin
- Khi `users.is_super_admin === true`:
  - `RbacGuard` và `AuditLogController` bỏ qua mọi giới hạn quyền.
  - Được xem thông tin IP/thiết bị phiên đang hoạt động và lịch sử phiên (`session-history`), xem đầy đủ `cashflow/preview` (không bị Blind Mode), và thực hiện các API `@SuperAdminOnly()`.
  - Trên giao diện `/rbac`, không thể vô hiệu hoá, hạ quyền hoặc chỉnh sửa quyền của Super Admin.

---

## 4. MA TRẬN PHÂN QUYỀN THEO 4 TÀI KHOẢN SEED CHUẨN (`seed-data.ts`)

| Phân hệ | Quyền chính | `superadmin` (`SUPERADMIN`) | `admin` (`ADMIN`) | `adminview` (`ADMIN_VIEW`) | `thungan` (`CASHIER`) |
|:---|:---|:---:|:---:|:---:|:---:|
| **Dashboard** | `view` / `viewProfit` / `export` | ✅ / ✅ / ✅ | ✅ / ✅ / ✅ | ✅ / ✅ / ✅ | ✅ / ❌ / ❌ |
| **POS** | `view, create, update, splitKitchen, tableAction, checkout` | ✅ | ✅ | Chỉ `view` | ✅ |
| **POS (Nhạy cảm)** | `delete`, `qrSecurity`, `manualDiscount`, `openCashDrawer` | ✅ | ✅ | ❌ | ❌ |
| **Menu** | `view` / `update` / `create, delete, stations, categories, import, export` | ✅ / ✅ / ✅ | ✅ / ✅ / ✅ | ✅ / ❌ / chỉ `export` | ✅ / ✅ / ❌ |
| **Hoá đơn** | `view` / `reprint` / `update` / `approve` / `void` / `export` | ✅ tất cả | ✅ (trừ `void` ❌) | Chỉ `view`, `export` | ✅ `view, reprint, update` |
| **Nhập hàng** | `view` / `create` / `update` / `delete` / `export` | ✅ tất cả | ✅ tất cả | Chỉ `view`, `export` | ✅ `view, create, delete` |
| **Dòng tiền** | `view` / `create` / `compensate` / `config` / `export` | ✅ tất cả | ✅ tất cả | Chỉ `view`, `export` | ✅ `view, create, compensate` |
| **Mã QR TT** | `view, create, update, delete` | ✅ | ✅ | Chỉ `view` | ❌ |
| **Mã giảm giá** | `view, create, update, delete` | ✅ | ✅ | Chỉ `view` | ❌ |
| **Nhân sự** | `view, create, update, delete, export` | ✅ | ✅ | Chỉ `view`, `export` | ❌ |
| **Bảng công** | `view` / `create, update, delete` / `export` | ✅ / ✅ / ✅ | ✅ / ✅ / ✅ | ✅ / ❌ / ✅ | ✅ / ❌ / ❌ |
| **Bảng lương** | `view, update, config, export` | ✅ | ✅ | Chỉ `view`, `export` | ❌ |
| **Master Data** | `view, create, update, delete` (`lookup` luôn mở) | ✅ | ✅ | Chỉ `view` | ❌ (`lookup` ✅) |
| **Phân quyền** | `view` / Thao tác quản trị (`@SuperAdminOnly`) | ✅ / ✅ | ✅ / ❌ | ✅ / ❌ | ❌ / ❌ |
| **Cài đặt** | `view` / `update` | ✅ / ✅ | ✅ / ✅ | ✅ / ❌ | ❌ / ❌ |
| **Hồ sơ & UI** | `/api/v1/profile/*`, `/api/v1/store-messages` | ✅ | ✅ | ✅ | ✅ |

---

## 5. BẢNG MAPPING TOÀN BỘ REST API SANG GUARD & QUYỀN RBAC

| Phân hệ / Controller | Method | Endpoint | Guard / Quyền bắt buộc |
|:---|:---:|:---|:---|
| **Health** | `GET` | `/api/v1/health` | Public |
| **Auth (`IamController`)** | `POST` | `/api/v1/auth/login`, `/refresh`, `/logout` | Public (riêng `refresh` kiểm tra cookie & `sid`) |
| **Public Assets & Menu** | `GET` | `/api/v1/public/menu`, `/public/store-settings`, `/public/store-assets/:kind`, `/public/avatars/:employeeId`, `/public/tts`, `/public/orders/qr-pending-check` | Public (`public/menu` kèm QR Security Wi-Fi/GPS) |
| **Public QR Order** | `POST` | `/api/v1/public/orders/qr` | Public + `QrSecurityService` (Wi-Fi IP / GPS Geofence) |
| **Profile** | `GET/PUT` | `/api/v1/profile`, `PUT/DELETE /profile/avatar`, `PATCH /profile/ui-prefs`, `PATCH /profile/password` | `JwtAuthGuard` (`AuthenticatedOnly`) |
| **Store Messages** | `GET` | `/api/v1/store-messages` | `JwtAuthGuard` (`AuthenticatedOnly`) |
| **Dashboard** | `GET` | `/api/v1/dashboard/overview` | `@RequirePermission('dashboard', 'view')` |
| **POS — Tables & QR** | `GET` | `/api/v1/pos/tables` | `@RequirePermission('pos', 'view')` |
| | `POST/PUT/DELETE` | `/api/v1/pos/tables`, `/pos/tables/:id`, `POST /pos/tables/:id/rotate-qr`, `/pos/takeaway-qr/rotate`, `/pos/tables/shorten-qr` | `@RequirePermission('pos', 'update')` |
| | `GET/PUT` | `/api/v1/pos/qr-security-config` | `@RequirePermission('pos', 'qrSecurity')` |
| **POS — Orders** | `POST` | `/api/v1/pos/orders` | `@RequirePermission('pos', 'create')` |
| | `GET` | `/api/v1/pos/orders/:id`, `GET/POST /pos/orders/:id/provisional-bill`, `POST /pos/orders/:id/split-provisional-bill` | `@RequirePermission('pos', 'view')` |
| | `POST/PATCH` | `/api/v1/pos/orders/:id/approve`, `/cancel`, `PATCH /pos/orders/:id/items` | `@RequirePermission('pos', 'update')` |
| | `POST` | `/api/v1/pos/orders/:id/split-kitchen`, `/reprint-kitchen` | `@RequirePermission('pos', 'splitKitchen')` |
| | `POST` | `/api/v1/pos/orders/:id/table-action` | `@RequirePermission('pos', 'tableAction')` |
| | `POST/GET/DELETE` | `/api/v1/pos/orders/:id/checkout`, `/split-checkout`, `/applicable-discounts`, `/discount` | `@RequirePermission('pos', 'checkout')` (+ strict `pos:manualDiscount` nếu giảm tay) |
| **POS — Push & Print** | `GET/POST/DELETE` | `/api/v1/pos/push/vapid-public-key`, `/subscriptions/status`, `/subscriptions`, `/test` | `@RequirePermission('pos', 'view')` |
| | `POST` | `/api/v1/pos/print/lan-escpos` | `JwtAuthGuard` + một trong `pos:view`, `invoices:view`, `invoices:reprint`, `settings:view` |
| **Menu** | `GET` | `/api/v1/menu/products` | `@RequireAnyPermission(menu:view, pos:view)` |
| | `POST/PUT/DELETE` | `/api/v1/menu/products`, `/products/:id` | `menu:create`, `menu:update`, `menu:delete` |
| | `POST` | `/api/v1/menu/products/import-excel` | `@RequirePermission('menu', 'import')` |
| | `POST/PUT/DELETE` | `/api/v1/menu/stations`, `/stations/:id` | `@RequirePermission('menu', 'manageStations')` |
| | `POST/PUT/DELETE` | `/api/v1/menu/categories`, `/categories/:id` | `@RequirePermission('menu', 'manageCategories')` |
| **Discounts** | `GET/POST/PUT/PATCH/DELETE` | `/api/v1/discounts`, `/:id`, `/:id/status` | `discounts:view|create|update|delete` |
| **Invoices** | `GET` | `/api/v1/invoices`, `/api/v1/invoices/:id` | `@RequirePermission('invoices', 'view')` |
| | `POST/PATCH` | `/:id/reprint` · `PATCH /:id/payment-method` · `POST /:id/payment-method/review` · `POST /:id/void` | `invoices:reprint` · `invoices:update` · `invoices:approve` · `invoices:void` |
| **Inventory** | `GET/POST/PUT/DELETE` | `/api/v1/inventory-imports`, `/:id` | `inventory:view|create|update|delete` |
| **Cashflow** | `GET/POST/PUT` | `/preview`, `/settlements` · `/settle` · `/settlements/:id/compensate` · `/default-budget` | `cashflow:view` · `cashflow:create` · `cashflow:compensate` · `cashflow:config` |
| **Payment QR** | `GET/POST/PUT/DELETE` | `/api/v1/payment-qr`, `/:id/orders`, `/reorder`, `/:id` | `paymentQr:view|create|update|delete` |
| **Employees** | `GET/POST/PUT/PATCH/DELETE` | `/api/v1/employees`, `/:id`, `/:id/status`, `/:id/permanent` | `employees:view|create|update|delete` |
| **Schedules** | `GET` | `/api/v1/schedules` | `@RequirePermission('schedules', 'view')` |
| | `PUT/POST` | `/api/v1/schedules/bulk-save`, `/copy-previous-week` | `@RequireAnyPermission(schedules:create, update[, delete])` |
| **Payroll** | `GET/PUT` | `/api/v1/payroll` · `/payroll/config` · `/payroll/employees/:employeeId` | `payroll:view` · `payroll:config` · `payroll:update` |
| **Master Data** | `GET` | `/api/v1/mdm/lookup` | **`JwtAuthGuard` (`AuthenticatedOnly` — Invariant 8)** |
| | `GET/POST/PUT/DELETE` | `/api/v1/mdm`, `/api/v1/mdm/:id` | `mdm:view|create|update|delete` |
| **RBAC & Sessions** | `GET` | `/api/v1/users` | `@RequirePermission('rbac', 'view')` (IP/thiết bị ẩn với non-SuperAdmin) |
| | `POST/PUT/GET` | `/api/v1/users`, `/:id`, `/:id/permissions`, `/:id/reset-password`, `/:id/session-history`, `/:id/revoke-session` | **`@SuperAdminOnly()`** |
| **Store Settings** | `GET/PUT/DELETE` | `/api/v1/settings`, `/settings/assets/:kind` | `settings:view` · `settings:update` |
| **Audit Logs** | `GET` | `/api/v1/audit-logs`, `/api/v1/audit-logs/:module` | `JwtAuthGuard` + kiểm tra quyền `view` của module tương ứng (riêng `RBAC` bắt buộc `SuperAdmin`) |

---

## 6. QUẢN TRỊ MASTER DATA & CHUẨN HOÁ CHUỖI (HARD INVARIANT 7)

### 6.1. 7 Danh mục Master Data Người dùng + Nhóm Cấu hình Nội bộ
```
master_data
├── POSITION         ── Chức vụ nhân sự (Chủ Cửa Hàng, Quản Lý, Thu Ngân Quầy, Bếp Trưởng...)
├── SPECIALTY        ── Chuyên môn làm việc (Quản Lý, Thu Ngân, Bếp Nấu, Bếp Chiên, Pha Chế, Phục Vụ)
├── INGREDIENT       ── Nguyên vật liệu nhập kho (kèm metadata: { default_unit, last_price })
├── UNIT             ── Đơn vị tính (Kg, Thùng, Gói, Két, Bao, Khay, Chai...)
├── SUPPLIER         ── Nhà cung cấp nguyên vật liệu
├── MENU_CATEGORY    ── Danh mục con thực đơn Tầng 2 (Mì Cay, Bánh Mì Chảo, Trà Sữa, Đồ Chiên...)
├── KITCHEN_STATION  ── Danh sách trạm bếp vật lý (BEP_NAU, BEP_CHIEN, PHA_CHE, mở rộng BEP_*)
└── SYSTEM_CONFIG    ── (Nội bộ) Cấu hình ngân sách mặc định, Store Settings, Store Messages, QR Security, Payroll Config, VAPID Keys, ảnh tài nguyên (logo/favicon/qr-logo/avatars)
```

### 6.2. Thuật toán Chuẩn hoá Chuỗi `MdmService.findOrCreate()` (Hard Invariant 7)
1. `trim()` → cắt khoảng trắng thừa 2 đầu và gộp khoảng trắng giữa.
2. `toTitleCase()` → chuẩn hoá chữ hoa đầu từ làm tên hiển thị (`name`).
3. `normalizeVietnameseString()` → NFD + bỏ dấu tiếng Việt + `đ/Đ -> d` + lowercase làm `normalized_name`.
4. Đối chiếu Composite Unique `(category, normalized_name)`: nếu đã tồn tại thì tái sử dụng (và cập nhật metadata mới như `last_price` nếu có); chưa tồn tại mới INSERT.
5. **Phân biệt với `f_search_norm()` (Migration `20261123000000`):** PostgreSQL có hàm `f_search_norm(text)` (dùng `unaccent`, gộp `đ->d`, gộp `y->i`) **chỉ dùng cho tìm kiếm mờ không dấu**, tuyệt đối không thay thế cột `normalized_name` của Invariant 7.

---

## 7. BỘ TÀI KHOẢN SEED MẶC ĐỊNH (`apps/api-server/prisma/seed-data.ts`)

Mật khẩu khởi tạo chung cho cả 4 tài khoản seed (khi chạy `npx prisma db seed`): **`Password@123`** (`bcrypt` cost 10).

| # | Username | Họ tên nhân sự liên kết (1-1) | Chức vụ | Role Key | Phạm vi quyền mặc định |
|:-:|:---|:---|:---|:---|:---|
| 1 | **`superadmin`** | Nguyễn Minh Quân (`M.Quân`) | Chủ Cửa Hàng | `SUPERADMIN` (`isSuperAdmin: true`) | Toàn quyền tuyệt đối (Bypass RBAC) |
| 2 | **`admin`** | Phạm Minh Tuấn (`M.Tuấn`) | Quản Lý Cửa Hàng | `ADMIN` | Toàn quyền vận hành 14 phân hệ (trừ `invoices:void` và thao tác `@SuperAdminOnly` trên `/rbac`) |
| 3 | **`adminview`** | Lê Thị Hương (`T.Hương`) | Quản Lý Cửa Hàng | `ADMIN_VIEW` | Chỉ xem (`view`) và xuất báo cáo (`export`) toàn bộ phân hệ kiểm toán |
| 4 | **`thungan`** | Trần Thị Lan (`T.Lan`) | Thu Ngân Quầy | `CASHIER` | POS quầy, cập nhật trạng thái món (`/menu`), xem/in lại/gửi sửa PTTT hoá đơn, nhập kho, kết ca & bù chênh lệch, xem lịch làm việc và Dashboard (không xem lợi nhuận) |

*(Kèm 8 hồ sơ nhân viên vận hành mẫu cho 4 khu vực: Bếp Nấu, Bếp Chiên, Pha Chế, Phục Vụ.)*

---

> **Tài liệu Ma trận Phân quyền & Master Data (v2.0.0) đã được đồng bộ 100% với `rbac.schema.ts`, `RbacGuard`, 15 NestJS Controllers và `seed-data.ts`.**
