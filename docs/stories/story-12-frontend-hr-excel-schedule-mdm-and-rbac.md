# Story 12: Xây dựng Giao diện Quản lý Nhân sự (Module 5), Lịch làm việc Excel (Module 6), Master Data (Module 7), Phân quyền RBAC (Module 8) & Đóng gói Docker Production

> **Story ID:** `STORY-12`  
> **Tên file:** `docs/stories/story-12-frontend-hr-excel-schedule-mdm-and-rbac.md`  
> **Phase thực thi:** Phase 5 (Frontend Modules 5, 6, 7, 8 & Production Docker Packaging)  
> **Agent phụ trách:** Antigravity  
> **Phụ thuộc (Dependencies):** `story-01` → `story-11` (Story hoàn thiện cuối cùng của hệ thống)  
> **Quy tắc bất biến áp dụng:** Hard Invariant 1 (Cô lập các feature modules `employees`, `schedules`, `master-data`, `rbac`), Hard Invariant 7 (Quản trị danh mục MDM chuẩn hoá chuỗi), Hard Invariant 8 (Drawer Phân quyền khoá `DISABLED / READONLY` đối với dòng Super Admin), Cơ chế Bảo vệ Thay đổi Chưa lưu (`Unsaved Changes Guard` — `EC-HR-03`) và Hiển thị Nhân viên Đã nghỉ (`EC-HR-02`)  
> **Tài liệu tham chiếu:** `docs/bmad/01-PRD-Master.md` (§3.6, §3.7, §3.8, §3.9), `docs/bmad/02-RBAC-And-MDM-Matrix.md`, `docs/bmad/03-Edge-Cases-And-Invariants.md` (`EC-HR-01`, `EC-HR-02`, `EC-HR-03`), `.agents/rules/04-frontend-ux-table-and-print.md` (§3, §4, §8), `.agents/rules/07-deployment-and-git.md`

---

## 1. MỤC TIÊU (OBJECTIVES)

Hoàn thiện 4 phân hệ quản trị nhân sự, lịch làm việc, danh mục gốc và phân quyền bảo mật, đồng thời đóng gói toàn bộ hệ thống sẵn sàng triển khai Production:
1. **Module 5 — Quản lý Hồ sơ Nhân sự (`src/features/employees/`):** BaseTable **7 cột chuẩn** (hiển thị tên nhân viên kèm badge `short_name` như `V.Anh` hoặc `N.V.Anh (#12)`), bộ lọc kết hợp Dropdown `Chức vụ / Chuyên môn` (lấy từ `/api/v1/mdm/lookup`) + ô tìm kiếm Tên/SĐT, và Modal/Drawer thêm/sửa/xem chi tiết đầy đủ 19 trường hồ sơ nhân sự liên kết 1-1 với tài khoản.
2. **Module 6 — Lịch làm việc Ma trận Dạng Excel (`src/features/schedules/`):** Bảng ma trận **7 cột (Thứ Hai → Chủ Nhật) × N dòng (Khung giờ ca làm việc)**, mỗi ô là một **Multi-select Tags Dropdown** hiển thị `short_name` nhân viên tô màu theo chuyên môn (`BEP_NAU` Đỏ, `BEP_CHIEN` Cam, `PHA_CHE` Xanh dương), hiển thị nhân viên đã xoá mềm (`isDeleted = true`) dưới dạng tag xám mờ kèm nhãn `(Đã nghỉ)` không gây crash (`EC-HR-02`), thanh điều hướng tuần + nút `[Sao chép từ tuần trước]`, và **Unsaved Changes Guard 2 lớp** (`window.beforeunload` + React Router Navigation Blocker — `EC-HR-03`).
3. **Module 7 — Quản trị Master Data (`src/features/master-data/`):** Giao diện 5 Tabs (`POSITION`, `SPECIALTY`, `INGREDIENT`, `UNIT`, `SUPPLIER`) trên `BaseTable` kèm quản trị Menu/Bàn ăn, hiển thị rõ `name` (Title Case), `normalized_name` (không dấu), và `metadata`.
4. **Module 8 — Phân quyền Hệ thống Đa cấp (`src/features/rbac/`):** BaseTable danh sách tài khoản kèm nút `[+ Thêm mới tài khoản]` (chỉ hiện với Super Admin) và **Drawer Phân quyền mở từ bên phải** (Checkbox `view` cho từng màn hình + Dropdown CRUD `create/update/delete` + Sub-permissions `cashflow:config`, `invoices:void`, `pos:splitKitchen`, `pos:tableAction`, `pos:checkout`). Dòng và toàn bộ checkboxes của tài khoản **Super Admin** hiển thị ở trạng thái **DISABLED / READONLY**.
5. **Đóng gói Docker Compose Production (`.agents/rules/07`):** Tạo đầy đủ `apps/api-server/Dockerfile` (multi-stage `node:20-alpine`, non-root user `fnb`, `HEALTHCHECK`), `docker-compose.yml` (`caddy`, `api`, `db` postgres:16-alpine, `backup`), `Caddyfile`, và script sao lưu tự động `scripts/backup.sh`.

---

## 2. DANH SÁCH FILE CHECKLIST (FILE MANIFEST & CHECKLIST)

### 2.1. Feature Quản lý Hồ sơ Nhân sự — Module 5 (`apps/web-app/src/features/employees/`)
- [ ] `apps/web-app/src/features/employees/api/employees.api.ts` — Hooks gọi `/api/v1/employees` và `/api/v1/mdm/lookup?category=POSITION|SPECIALTY`.
- [ ] `apps/web-app/src/features/employees/components/employees-page.tsx` — BaseTable 7 cột chuẩn:
  1. `STT`, 2. `Tên nhân viên (+ short_name)`, 3. `Năm sinh`, 4. `Chức vụ`, 5. `Chuyên môn`, 6. `Ghi chú`, 7. `Thao tác` (`Eye` xem chi tiết, `Pencil` chỉnh sửa, `Trash` xoá mềm có confirm).
- [ ] `apps/web-app/src/features/employees/components/employee-form-drawer.tsx` — Drawer/Modal thêm mới & chỉnh sửa hồ sơ nhân sự đầy đủ (`full_name`, `dob`, `phone`, `address`, `citizen_id`, `citizen_id_issued_place`, `position_id`, `specialty_id`, `start_date`, `bank_name`, `bank_account_no`, `bank_account_name`, `avatar_url`, `attachment_urls`, `note`, và tuỳ chọn tạo kèm tài khoản `username`/`password` liên kết 1-1).
- [ ] `apps/web-app/src/features/employees/index.ts` — Barrel export duy nhất (Hard Invariant 1).

### 2.2. Feature Lịch làm việc Ma trận Excel — Module 6 (`apps/web-app/src/features/schedules/`)
- [ ] `apps/web-app/src/features/schedules/api/schedules.api.ts` — Hooks gọi `GET /api/v1/schedules`, `PUT /api/v1/schedules/bulk-save`, và `POST /api/v1/schedules/copy-previous-week`.
- [ ] `apps/web-app/src/features/schedules/hooks/use-unsaved-changes-guard.ts` — Hiện thực hoá đồng thời 2 lớp bảo vệ khi `isDirty === true` (`EC-HR-03` & `.agents/rules/04` §8):
  1. `window.addEventListener('beforeunload', handler)` chặn tắt tab / F5 trình duyệt.
  2. React Router `useBlocker(isDirty)` chặn chuyển trang nội bộ và bật Modal cảnh báo `"Bạn có thay đổi chưa lưu. Bạn có chắc muốn rời trang?"` (`[Huỷ bỏ & Ở lại]` / `[Rời đi không lưu]`).
- [ ] `apps/web-app/src/features/schedules/components/schedules-matrix-page.tsx` — Giao diện ma trận 7 cột (`Thứ 2` → `Chủ Nhật`) × N hàng (`Ca Sáng`, `Ca Tối`, `Ca Gãy`...), thanh điều hướng tuần (`[< Tuần trước]`, `[Tuần hiện tại]`, `[Tuần sau >]`), nút `[Sao chép từ tuần trước]`, và nút `[Lưu lịch tuần]`.
- [ ] `apps/web-app/src/features/schedules/components/schedule-cell-multiselect.tsx` — Ô chọn nhiều nhân viên hiển thị Tag `short_name` tô màu theo chuyên môn:
  - `BEP_NAU` → Tag màu Đỏ (`bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200`)
  - `BEP_CHIEN` → Tag màu Cam (`bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200`)
  - `PHA_CHE` → Tag màu Xanh dương (`bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200`)
  - Nhân viên có `isDeleted === true` (`EC-HR-02`) → Tag màu Xám mờ (`opacity-60 line-through`) kèm nhãn `(Đã nghỉ)`.
- [ ] `apps/web-app/src/features/schedules/index.ts` — Barrel export duy nhất (Hard Invariant 1).

### 2.3. Feature Quản trị Master Data & Menu — Module 7 & 0 (`apps/web-app/src/features/master-data/`)
- [ ] `apps/web-app/src/features/master-data/api/master-data.api.ts` — Hooks gọi `/api/v1/mdm` và `/api/v1/menu/products`.
- [x] `apps/web-app/src/features/master-data/components/master-data-page.tsx` — Giao diện Tabs quản trị 5 danh mục gốc (`POSITION`, `SPECIALTY`, `INGREDIENT`, `UNIT`, `SUPPLIER`) trên `BaseTable` + Tab quản trị Thực đơn/Combo/Bàn QR.
- [ ] `apps/web-app/src/features/master-data/index.ts` — Barrel export duy nhất (Hard Invariant 1).

### 2.4. Feature Quản trị Phân quyền RBAC — Module 8 (`apps/web-app/src/features/rbac/`)
- [ ] `apps/web-app/src/features/rbac/api/rbac.api.ts` — Hooks gọi `GET /api/v1/users`, `POST /api/v1/users`, và `PUT /api/v1/users/:id/permissions`.
- [ ] `apps/web-app/src/features/rbac/components/rbac-users-page.tsx` — BaseTable danh sách tài khoản (`username`, `Họ tên nhân viên` liên kết 1-1, `Vai trò / Super Admin badge`, `Trạng thái`), nút `[+ Thêm mới tài khoản]` (chỉ hiện khi `user.is_super_admin === true`).
- [ ] `apps/web-app/src/features/rbac/components/permissions-drawer.tsx` — Drawer (`Sheet` mở từ bên phải) khi click vào dòng user hoặc icon bánh răng Settings:
  - Hiển thị danh sách toàn bộ modules với Checkbox quyền truy cập màn hình (`view`).
  - Dưới mỗi module: cụm Dropdown/Checkboxes cấu hình CRUD (`create`, `update`, `delete`) và các **Sub-permissions** (`pos:splitKitchen`, `pos:tableAction`, `pos:checkout`, `invoices:reprint`, `invoices:void`, `cashflow:config`, `rbac:manage`).
  - Nếu tài khoản đang xem có `is_super_admin === true`: toàn bộ checkboxes và controls hiển thị đầy đủ dấu tích nhưng ở trạng thái **`disabled` / `readonly`** kèm thông báo `"Tài khoản Super Admin mặc định có toàn quyền hệ thống và không thể bị hạ quyền"`.
- [ ] `apps/web-app/src/features/rbac/index.ts` — Barrel export duy nhất (Hard Invariant 1).

### 2.5. Hạ tầng Docker Production & Kiểm thử Toàn diện
- [ ] `apps/api-server/Dockerfile` — Multi-stage build (`builder` & `runner`) trên `node:20-alpine`, chạy dưới non-root user `fnb` (UID 1001), tích hợp `HEALTHCHECK` gọi `/api/v1/health`.
- [ ] `docker-compose.yml` — Định nghĩa 4 services: `caddy`, `api`, `db` (`postgres:16-alpine`), `backup` theo đúng `.agents/rules/07-deployment-and-git.md` (§1).
- [ ] `Caddyfile` & `scripts/backup.sh` — Cấu hình reverse proxy tự động SSL và script `pg_dump` nén tải lên Cloudflare R2 lúc 03:00 sáng.
- [ ] `apps/web-app/src/features/__tests__/hr-schedule-mdm-rbac.test.tsx` — Bộ test Vitest kiểm chứng `UnsavedChangesGuard` (`EC-HR-03`), hiển thị nhân viên đã xoá mềm (`EC-HR-02`), màu sắc tag chuyên môn, và trạng thái `disabled` của Super Admin trong Drawer Phân quyền.

---

## 3. CHI TIẾT KỸ THUẬT & NGHIỆP VỤ (TECHNICAL SPECIFICATIONS)

### 3.1. Cơ chế Bảo vệ Thay đổi Chưa lưu (`Unsaved Changes Guard` — `EC-HR-03`)
Trong `SchedulesMatrixPage`:
1. So sánh ma trận phân ca hiện tại trên state (`draftCells`) với dữ liệu gốc từ API (`initialCells`) để tính cờ `isDirty`.
2. Khi `isDirty === true`:
   - Đăng ký `window.addEventListener('beforeunload', (e) => { e.preventDefault(); e.returnValue = ''; })`.
   - Kích hoạt React Router Blocker chặn mọi thao tác click chuyển menu trên Sidebar hoặc Command Palette, hiển thị Dialog xác nhận.
3. Ngay khi mutation `bulkSaveSchedule` thành công (`onSuccess`): đặt lại `isDirty = false`, gỡ bỏ toàn bộ cảnh báo.

### 3.2. Kiểm tra Nghiệm thu Toàn Hệ thống (Pre-Completion Checklist — `.agents/rules/05` §6)
Trước khi kết thúc Story 12, bắt buộc thực thi và vượt qua 100% các lệnh kiểm định:
```bash
# 1. Build toàn bộ 3 packages trong Monorepo
pnpm -r build

# 2. Kiểm tra kiểu dữ liệu TypeScript (0 errors)
pnpm -r typecheck

# 3. Chạy toàn bộ Unit, Integration & Frontend Tests (100% pass)
pnpm -r test

# 4. Kiểm tra độ phủ test (Coverage thresholds)
pnpm -r test:coverage

# 5. Quét đảm bảo không có code giả lập hay import vi phạm Invariant 1
grep -r "// TODO\|// FIXME\|// placeholder\|// hack" apps/ packages/ --include="*.ts" --include="*.tsx"
```

---

## 4. TIÊU CHÍ NGHIỆM THU (ACCEPTANCE CRITERIA)

- [ ] **AC-12.1 (Module 5 Short Name & 1-1 Account Link):** Bảng Nhân viên hiển thị đúng 7 cột kèm `short_name` (`V.Anh` / `N.V.Anh (#12)`), lọc theo Chức vụ/Chuyên môn từ MDM và tạo mới nhân viên kèm tài khoản 1-1 hoạt động trơn tru.
- [ ] **AC-12.2 (Module 6 Excel Matrix, Specialty Colors, Soft-Deleted Tag & Unsaved Guard):** Ma trận 7 ngày × N ca hiển thị đúng màu tag theo chuyên môn (`BEP_NAU` Đỏ, `BEP_CHIEN` Cam, `PHA_CHE` Xanh dương); nhân viên đã xoá mềm hiển thị tag xám mờ `(Đã nghỉ)` không gây crash (`EC-HR-02`); sửa ô lịch chưa lưu mà bấm chuyển trang hoặc đóng tab đều bị chặn bởi `Unsaved Changes Guard` (`EC-HR-03`).
- [x] **AC-12.3 (Module 7 & Module 8 RBAC Drawer):** Màn hình Master Data quản lý đủ 5 tabs (`POSITION`, `SPECIALTY`, `INGREDIENT`, `UNIT`, `SUPPLIER`); Drawer Phân quyền hiển thị đầy đủ Checkbox `view` + CRUD + Sub-permissions và khoá `DISABLED / READONLY` đối với dòng Super Admin.
- [ ] **AC-12.4 (Docker Production Readiness):** `apps/api-server/Dockerfile`, `docker-compose.yml`, `Caddyfile`, và `scripts/backup.sh` tuân thủ 100% quy chuẩn tại `.agents/rules/07-deployment-and-git.md`.
- [ ] **AC-12.5 (Zero Violations Across All 10 Hard Invariants):** Toàn bộ monorepo pass `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r test` với 0 lỗi và không có bất kỳ placeholder comment nào.
