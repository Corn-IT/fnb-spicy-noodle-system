# Story 03: Xây dựng `IamModule` (JWT Auth, RBAC 401/403, Profile) & `MdmModule` (Master Data Chuẩn hoá Chuỗi)

> **Story ID:** `STORY-03`  
> **Tên file:** `docs/stories/story-03-iam-auth-rbac-and-mdm-backend.md`  
> **Phase thực thi:** Phase 4B (Backend IAM, RBAC & Master Data)  
> **Agent phụ trách:** Codex  
> **Phụ thuộc (Dependencies):** `story-01-monorepo-and-shared-contracts.md`, `story-02-prisma-schema-migrations-and-seed.md`  
> **Quy tắc bất biến áp dụng:** Hard Invariant 7 (MDM Chuẩn hoá Chuỗi), Hard Invariant 8 (RBAC 401 vs 403 & Mở `/api/v1/mdm/lookup`), Hard Invariant 9 (Đồng bộ `users.ui_preferences` & Profile JOIN 1-1)  
> **Tài liệu tham chiếu:** `docs/bmad/02-RBAC-And-MDM-Matrix.md`, `.agents/rules/03-rbac-security-and-hr-schedule.md`, `.agents/rules/02-pos-kitchen-and-cashflow-logic.md` (§6), `docs/architecture/04-audit-report.md` (`DISCREPANCY-RBAC-01`)

---

## 1. MỤC TIÊU (OBJECTIVES)

Hiện thực hoá hệ thống bảo mật, xác thực và phân quyền đa cấp (`IamModule`: Module 8 & Module 9 Backend) cùng hệ thống quản trị danh mục dùng chung (`MdmModule`: Module 7 Backend). Đảm bảo phân định tuyệt đối mã lỗi **HTTP 401 Unauthorized** (lỗi danh tính/token) và **HTTP 403 Forbidden** (thiếu quyền trong ma trận RBAC), tách biệt hoàn toàn API `/api/v1/mdm/lookup` (mở cho mọi user đã đăng nhập) khỏi API quản trị `/api/v1/mdm`, và xây dựng hàm `MdmService.findOrCreate()` chống trùng lặp dữ liệu tiếng Việt tuyệt đối.

---

## 2. DANH SÁCH FILE CHECKLIST (FILE MANIFEST & CHECKLIST)

### 2.1. Guards & Decorators Dùng chung (`apps/api-server/src/common/`)
- [x] `apps/api-server/src/common/decorators/current-user.decorator.ts` — Trích xuất thông tin user đã xác thực từ `request.user`.
- [x] `apps/api-server/src/common/decorators/permissions.decorator.ts` — Định nghĩa `@RequirePermission(module, action)` và `@SuperAdminOnly()`.
- [x] `apps/api-server/src/common/guards/jwt-auth.guard.ts` — Xác thực Bearer AccessToken ở Tầng 1; nếu thiếu token, sai chữ ký, tài khoản bị khoá (`is_active = false`), hoặc hết hạn 15 phút → **BẮT BUỘC** trả về `401 Unauthorized` (`AUTH_TOKEN_MISSING` / `AUTH_TOKEN_EXPIRED` / `AUTH_TOKEN_INVALID`). **CẤM TUYỆT ĐỐI** trả về 403.
- [x] `apps/api-server/src/common/guards/rbac.guard.ts` — Kiểm tra quyền ở Tầng 2:
  1. Nếu `user.is_super_admin === true` → Cho phép ngay lập tức (Bypass toàn bộ kiểm tra).
  2. Nếu endpoint gắn `@SuperAdminOnly()` mà `user.is_super_admin === false` → Trả về `403 Forbidden` (`RBAC_SUPER_ADMIN_REQUIRED`).
  3. Kiểm tra `user.permissions[module]?.[action] === true` (với sub-action của `pos` như `splitKitchen`/`tableAction`/`checkout`: hỗ trợ fallback kiểm tra `permissions.pos.create || permissions.pos.update` nếu cờ sub-permission chưa khai báo tường minh theo `DISCREPANCY-RBAC-01`).
  4. Nếu không đủ quyền → **BẮT BUỘC** trả về `403 Forbidden` (`RBAC_PERMISSION_DENIED`). **CẤM TUYỆT ĐỐI** trả về 401.

### 2.2. Module IAM, RBAC & Profile (`apps/api-server/src/modules/iam/`)
- [x] `apps/api-server/src/modules/iam/iam.module.ts` — Đăng ký `IamController`, `UsersController`, `ProfileController`, `IamService`, `JwtModule`.
- [x] `apps/api-server/src/modules/iam/iam.controller.ts` — Các endpoints xác thực:
  - `POST /api/v1/auth/login` — Kiểm tra username/password bằng `bcrypt.compare`, trả `accessToken` (15m) + set `refreshToken` (7d) vào `httpOnly` cookie + trả thông tin `user` kèm `employee` và `uiPreferences`. Nếu sai → `401 AUTH_CREDENTIALS_INVALID`.
  - `POST /api/v1/auth/refresh` — Đọc `refreshToken` từ cookie/body, cấp `accessToken` mới.
  - `POST /api/v1/auth/logout` — Xoá `refreshToken` cookie.
- [x] `apps/api-server/src/modules/iam/users.controller.ts` — Các endpoints quản trị tài khoản & phân quyền (Module 8):
  - `GET /api/v1/users` — `@RequirePermission('rbac', 'view')`: Danh sách tài khoản kèm thông tin nhân viên liên kết 1-1 (`employees`).
  - `POST /api/v1/users` — `@SuperAdminOnly()`: Tạo tài khoản mới liên kết 1-1 với `employee_id` (hash password bằng `bcrypt` cost=10, kiểm tra trùng `username` → `409 HR_USERNAME_TAKEN`).
  - `PUT /api/v1/users/:id/permissions` — `@SuperAdminOnly()`: Cập nhật JSONB `permissions` và trạng thái `is_active`. **CẤM** hạ quyền hoặc khoá tài khoản có `is_super_admin = true` (trả `403 RBAC_SUPER_ADMIN_REQUIRED`).
- [x] `apps/api-server/src/modules/iam/profile.controller.ts` — Các endpoints Hồ sơ cá nhân & UI Preferences (Module 9):
  - `GET /api/v1/profile` — `@UseGuards(JwtAuthGuard)`: Đọc dữ liệu JOIN từ cả 2 bảng `users` và `employees` (bao gồm `position` và `specialty` từ `master_data`).
  - `PUT /api/v1/profile` — `@UseGuards(JwtAuthGuard)`: Cho phép nhân viên tự cập nhật `phone`, `address`, `bank_name`, `bank_account_no`, `bank_account_name`, `avatar_url` đồng bộ trực tiếp vào bảng `employees` (giữ nguyên `position_id` và `specialty_id` readonly).
  - `PATCH /api/v1/profile/ui-prefs` — `@UseGuards(JwtAuthGuard)`: Merge và lưu cấu hình `{ theme, sidebar_width, column_widths }` vào cột `users.ui_preferences` (Hard Invariant 9).
- [x] `apps/api-server/src/modules/iam/iam.service.ts` — Toàn bộ business logic của IAM, RBAC, Profile.
- [x] `apps/api-server/src/modules/iam/dto/` — Re-export các DTOs từ `@fnb/shared`.

### 2.3. Module Master Data (`apps/api-server/src/modules/mdm/`)
- [x] `apps/api-server/src/modules/mdm/mdm.module.ts` — Export `MdmService` để `InventoryModule` (Story 06) và `HrScheduleModule` (Story 07) có thể import hợp lệ.
- [x] `apps/api-server/src/modules/mdm/mdm.controller.ts` — Tách biệt rõ 2 nhóm endpoints (Hard Invariant 8):
  - `GET /api/v1/mdm/lookup?category=...&keyword=...` — **CHỈ** dùng `@UseGuards(JwtAuthGuard)` (`AuthenticatedOnly`, **KHÔNG** yêu cầu `mdm:view` hay `mdm:write`). Trả về danh sách active `[{ id, category, name, normalizedName, metadata }]`, gồm `SUPPLIER` để chọn NCC khi nhập kho.
  - `GET /api/v1/mdm` — `@RequirePermission('mdm', 'view')`: Danh sách quản trị Master Data theo tab `category` (`POSITION`, `SPECIALTY`, `INGREDIENT`, `UNIT`, `SUPPLIER`) và `keyword`.
  - `POST /api/v1/mdm` — `@RequirePermission('mdm', 'write')`: Gọi `MdmService.findOrCreate()`.
  - `PUT /api/v1/mdm/:id` — `@RequirePermission('mdm', 'write')`: Cập nhật tên (tự động tính lại `titleCase` & `normalized_name`, kiểm tra chống trùng) và `metadata`.
  - `DELETE /api/v1/mdm/:id` — `@RequirePermission('mdm', 'write')`: Soft disable (`is_active = false`).
- [x] `apps/api-server/src/modules/mdm/mdm.service.ts` — Hiện thực hoá `findOrCreate(category, rawInput, metadata)` tuân thủ tuyệt đối Hard Invariant 7.
- [x] `apps/api-server/src/modules/iam/__tests__/iam-rbac.spec.ts` & `apps/api-server/src/modules/mdm/__tests__/mdm.service.spec.ts` — Unit & Integration tests đầy đủ.

---

## 3. CHI TIẾT KỸ THUẬT & NGHIỆP VỤ (TECHNICAL SPECIFICATIONS)

### 3.1. Thuật toán `MdmService.findOrCreate()` (Hard Invariant 7)
```typescript
async findOrCreate(category: MdmCategory, rawInput: string, metadata: Record<string, unknown> = {}) {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new BadRequestException('Tên danh mục không được để trống');
  }

  const titleCased = toTitleCase(trimmed);
  const normalized = normalizeVietnameseString(trimmed);

  const existing = await this.prisma.masterData.findFirst({
    where: { category, normalized_name: normalized, is_active: true },
  });

  if (existing) {
    if (Object.keys(metadata).length > 0) {
      return this.prisma.masterData.update({
        where: { id: existing.id },
        data: { metadata: { ...(existing.metadata as Record<string, unknown>), ...metadata } },
      });
    }
    return existing;
  }

  return this.prisma.masterData.create({
    data: {
      category,
      name: titleCased,
      normalized_name: normalized,
      metadata,
      is_active: true,
    },
  });
}
```
- Ví dụ kiểm chứng bắt buộc:
  - `"  tương ớt hàn quốc  "` → `name: "Tương Ớt Hàn Quốc"`, `normalized_name: "tuong ot han quoc"`.
  - `"Đá bi"` → `name: "Đá Bi"`, `normalized_name: "da bi"`.
  - Gọi lần 2 với `"TƯƠNG ỚT HÀN QUỐC"` kèm `{ last_price: 135000 }` → trả về đúng bản ghi cũ (không tạo bản ghi mới) và cập nhật `metadata.last_price = 135000`.

---

## 4. TIÊU CHÍ NGHIỆM THU (ACCEPTANCE CRITERIA)

- [x] **AC-03.1 (Strict 401 vs 403):**
  - Gửi request không có token hoặc token hết hạn/sai chữ ký → nhận đúng `401 Unauthorized` (không bao giờ trả 403).
  - Đăng nhập bằng `cashier01`, gọi `PUT /api/v1/users/1/permissions` hoặc `POST /api/v1/mdm` → nhận đúng `403 Forbidden` (không bao giờ trả 401).
- [x] **AC-03.2 (Super Admin Bypass & Protection):** Tài khoản `superadmin` truy cập mọi endpoint đều được phép; mọi nỗ lực gọi `PUT /api/v1/users/:superAdminId/permissions` để sửa/hạ quyền của Super Admin đều bị chặn với `403 Forbidden`.
- [x] **AC-03.3 (MDM Lookup Accessible to All Authenticated Users):** Tài khoản `cashier01` (có `mdm.view = false`, `mdm.write = false`) gọi `GET /api/v1/mdm/lookup?category=INGREDIENT` nhận `200 OK` cùng danh sách nguyên liệu; nhưng gọi `GET /api/v1/mdm` nhận `403 Forbidden`.
- [x] **AC-03.4 (MDM Normalization Idempotency):** Gọi `MdmService.findOrCreate('INGREDIENT', 'bún bò huế')` và `'  Bún Bò Huế  '` chỉ sinh ra duy nhất 1 dòng trong bảng `master_data` với `name = 'Bún Bò Huế'` và `normalized_name = 'bun bo hue'`.
- [x] **AC-03.5 (Profile 1-1 Sync & UI Preferences):** Gọi `PUT /api/v1/profile` cập nhật thông tin ngân hàng/địa chỉ lưu thẳng vào bảng `employees`; gọi `PATCH /api/v1/profile/ui-prefs` cập nhật `users.ui_preferences` mà không làm ảnh hưởng `permissions`.
