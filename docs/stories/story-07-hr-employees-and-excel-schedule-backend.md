# Story 07: Xây dựng `HrScheduleModule` (CRUD Nhân sự 1-1, Tự sinh `short_name` Chống Trùng & Lịch làm việc Ma trận Excel)

> **Story ID:** `STORY-07`  
> **Tên file:** `docs/stories/story-07-hr-employees-and-excel-schedule-backend.md`  
> **Phase thực thi:** Phase 4B (Backend HR & Excel Work Schedule)  
> **Agent phụ trách:** Codex  
> **Phụ thuộc (Dependencies):** `story-01`, `story-02`, `story-03`  
> **Quy tắc bất biến áp dụng:** Hard Invariant 7 (Tự chuẩn hoá Chức vụ & Chuyên môn qua `MdmService.findOrCreate`), Hard Invariant 8 (RBAC `employees:*` & `schedules:*`), Quy tắc Liên kết 1-1 `employees` ↔ `users`, Thuật toán `generateShortName` (`EC-HR-01`), Xử lý Nhân viên Xoá mềm trong Lịch tuần (`EC-HR-02`)  
> **Tài liệu tham chiếu:** `docs/bmad/01-PRD-Master.md` (§3.6, §3.7), `docs/bmad/03-Edge-Cases-And-Invariants.md` (`EC-HR-01`, `EC-HR-02`), `.agents/rules/03-rbac-security-and-hr-schedule.md` (§6, §7, §8), `.agents/rules/01-database-and-concurrency.md` (§2, §5), `docs/architecture/04-audit-report.md` (`DISCREPANCY-DB-03`, `DISCREPANCY-DB-04`)

---

## 1. MỤC TIÊU (OBJECTIVES)

Hiện thực hoá phân hệ Quản trị Nhân sự và Lịch làm việc tuần (`HrScheduleModule` — Module 5 & Module 6 Backend):
1. **Quản lý Hồ sơ Nhân sự (Module 5):** CRUD đầy đủ 19 trường của bảng `employees` (đồng bộ 1-1 với `users`), lọc kết hợp theo Chức vụ / Chuyên môn (từ MDM) và từ khoá Tên / SĐT, tự động sinh tên viết tắt `short_name` (`"Nguyễn Văn Anh"` → `"V.Anh"`, và tự động giải quyết xung đột trùng tên thành `"N.V.Anh (#12)"` theo `EC-HR-01`).
2. **Lịch làm việc Ma trận Dạng Excel (Module 6):** Quản lý bảng phân ca tuần (7 ngày `day_of_week: 0..6` × N khung giờ `time_slot`) lưu theo `week_start_date` (ngày Thứ Hai đầu tuần), hỗ trợ lưu hàng loạt toàn bộ tuần trong 1 transaction (`PUT /api/v1/schedules/bulk-save`), sao chép lịch từ tuần liền trước, và bảo toàn hiển thị nhân viên đã xoá mềm (`is_deleted = true`) kèm cờ `(Đã nghỉ)` để không bao giờ gây lỗi crash bảng lịch (`EC-HR-02`).

---

## 2. DANH SÁCH FILE CHECKLIST (FILE MANIFEST & CHECKLIST)

### 2.1. Module Nhân sự & Lịch làm việc (`apps/api-server/src/modules/hr-schedule/`)
- [x] `apps/api-server/src/modules/hr-schedule/hr-schedule.module.ts` — Import `MdmModule` (`// Cross-module: MdmModule needed for POSITION and SPECIALTY normalization`).
- [x] `apps/api-server/src/modules/hr-schedule/short-name.util.ts` — Hàm thuần (pure function) `generateShortName(fullName, existingEmployees, employeeId)` phục vụ `EC-HR-01`.
- [x] `apps/api-server/src/modules/hr-schedule/employees.controller.ts` — Các endpoints Quản lý Nhân viên (Module 5):
  - `GET /api/v1/employees` — `@RequirePermission('employees', 'view')`: Danh sách nhân viên đang làm việc (`is_deleted = false`), hỗ trợ lọc theo `positionId`, `specialtyId`, `keyword` (tìm theo `full_name`, `short_name`, `phone`), phân trang server-side, kèm thông tin tài khoản `user` liên kết 1-1.
  - `GET /api/v1/employees/:id` — `@RequirePermission('employees', 'view')`: Xem chi tiết đầy đủ hồ sơ nhân sự (CCCD, nơi cấp, địa chỉ, ngân hàng, file đính kèm, tài khoản liên kết).
  - `POST /api/v1/employees` — `@RequirePermission('employees', 'create')`: Tạo hồ sơ nhân viên mới, kiểm tra trùng `citizen_id` (`409 HR_CITIZEN_ID_DUPLICATE`), tự sinh `short_name` chống trùng, hỗ trợ tuỳ chọn tạo kèm tài khoản `users` liên kết 1-1 trong cùng `$transaction`.
  - `PUT /api/v1/employees/:id` — `@RequirePermission('employees', 'update')`: Cập nhật hồ sơ nhân viên (nếu đổi `full_name` thì tính lại `short_name`).
  - `DELETE /api/v1/employees/:id` — `@RequirePermission('employees', 'delete')`: Xoá mềm nhân viên (`is_deleted = true`) đồng thời vô hiệu hoá tài khoản liên kết (`users.is_active = false`).
- [x] `apps/api-server/src/modules/hr-schedule/schedules.controller.ts` — Các endpoints Lịch làm việc Ma trận (Module 6):
  - `GET /api/v1/schedules?weekStartDate=YYYY-MM-DD` — `@RequirePermission('schedules', 'view')`: Trả về ma trận lịch làm việc của tuần tương ứng kèm danh sách chi tiết nhân viên được gán trong từng ô (bao gồm cả nhân viên `is_deleted = true` theo `EC-HR-02`).
  - `PUT /api/v1/schedules/bulk-save` — `@RequirePermission('schedules', 'update')`: Lưu toàn bộ ma trận lịch tuần (`week_start_date`, các ô `day_of_week: 0..6` × `time_slot` × `employee_ids`) trong 1 transaction bằng `upsert` theo khoá duy nhất `uq_schedule_cell (week_start_date, day_of_week, time_slot)`.
  - `POST /api/v1/schedules/copy-previous-week` — `@RequirePermission('schedules', 'update')`: Sao chép toàn bộ ma trận phân ca từ tuần liền trước (`weekStartDate - 7 days`) sang tuần mục tiêu (tự động lọc bỏ các nhân viên đã nghỉ việc `is_deleted = true` khi tạo lịch cho tuần mới).
- [x] `apps/api-server/src/modules/hr-schedule/employees.service.ts` & `apps/api-server/src/modules/hr-schedule/schedules.service.ts`
- [x] `apps/api-server/src/modules/hr-schedule/dto/`

### 2.2. Bộ Kiểm thử Tự động Bắt buộc (`apps/api-server/src/modules/hr-schedule/__tests__/`)
- [x] `apps/api-server/src/modules/hr-schedule/__tests__/short-name.spec.ts` — Unit test thuật toán `generateShortName` (tên 1 từ, 2 từ, 3+ từ, trùng tên 2 người, trùng tên 3 người, cập nhật lại chính nhân viên đó không tự báo trùng).
- [x] `apps/api-server/src/modules/hr-schedule/__tests__/hr-schedule.service.spec.ts` — Unit tests cho CRUD Nhân sự 1-1, `EC-HR-02`, `bulk-save` 7 ngày, và `copy-previous-week`.
- [x] `apps/api-server/src/modules/hr-schedule/__tests__/hr-schedule.endpoints.integration.spec.ts` — HTTP tests cho xác thực, RBAC và các route employees/schedules.

---

## 3. CHI TIẾT KỸ THUẬT & NGHIỆP VỤ (TECHNICAL SPECIFICATIONS)

### 3.1. Thuật toán Tự sinh Tên Viết tắt Chống Trùng (`EC-HR-01` — `.agents/rules/03` §7)
```typescript
export function generateShortName(
  fullName: string,
  existingEmployees: Array<{ id: number; shortName: string }>,
  currentEmployeeId: number,
): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return `#${currentEmployeeId}`;

  const lastName = words[words.length - 1]; // "Anh"
  const middleInitial = words.length > 2 ? `${words[words.length - 2][0].toUpperCase()}.` : '';
  let candidate = `${middleInitial}${lastName}`; // "V.Anh"

  const isCollision = existingEmployees.some(
    (emp) => emp.id !== currentEmployeeId && emp.shortName.toLowerCase() === candidate.toLowerCase(),
  );

  if (isCollision) {
    const firstInitial = words.length > 1 ? `${words[0][0].toUpperCase()}.` : '';
    candidate = `${firstInitial}${middleInitial}${lastName} (#${currentEmployeeId})`; // "N.V.Anh (#12)"
  }

  return candidate;
}
```
- Lưu ý khi tạo mới nhân viên: Thực hiện `INSERT` bản ghi `employees` (với `short_name` tạm) trong `$transaction` để lấy `id` tự tăng của PostgreSQL, sau đó gọi `generateShortName(..., newEmp.id)` và cập nhật chuẩn xác `short_name` trước khi commit.

### 3.2. Xử lý Nhân viên Đã Xoá mềm trong Lịch làm việc (`EC-HR-02`)
- Khi gọi `GET /api/v1/schedules?weekStartDate=...`:
  1. Lấy toàn bộ các dòng `work_schedules` của `weekStartDate`.
  2. Tập hợp tất cả ID xuất hiện trong mảng JSONB `employee_ids` của các ô trong tuần đó.
  3. Truy vấn bảng `employees` với `WHERE id IN (...)` **MÀ KHÔNG THÊM ĐIỀU KIỆN `is_deleted = FALSE`**.
  4. Map từng nhân viên vào ô lịch kèm thuộc tính:
     ```typescript
     {
       id: emp.id,
       shortName: emp.short_name,
       fullName: emp.full_name,
       specialtyCode: emp.specialty?.normalized_name, // Để FE tô màu Đỏ/Cam/Xanh dương
       isDeleted: emp.is_deleted,                    // Nếu true -> FE hiển thị tag xám mờ + "(Đã nghỉ)"
     }
     ```
  5. Song song đó, trả về danh sách `availableEmployees` (`WHERE is_deleted = FALSE`) để đổ vào Multi-select Dropdown khi Quản lý muốn chọn thêm người mới vào ca.

---

## 4. TIÊU CHÍ NGHIỆM THU (ACCEPTANCE CRITERIA)

- [x] **AC-07.1 (Short Name Generation & Collision `EC-HR-01`):**
  - Tạo nhân viên `"Nguyễn Văn Anh"` → `short_name = "V.Anh"`.
  - Tạo tiếp nhân viên `"Trần Văn Anh"` (ID = 15) → `short_name = "T.V.Anh (#15)"` (hoặc cập nhật cả hai tách biệt rõ ràng).
- [x] **AC-07.2 (Soft-deleted Employee in Schedule `EC-HR-02`):** Gán nhân viên ID 12 vào lịch Thứ Tư, sau đó gọi `DELETE /api/v1/employees/12` (`is_deleted = true`). Khi gọi lại `GET /api/v1/schedules` của tuần đó, API trả về HTTP `200 OK` chứa đầy đủ thông tin nhân viên ID 12 với cờ `isDeleted: true`, tuyệt đối không bị lỗi null reference hay mất dữ liệu lịch sử.
- [x] **AC-07.3 (Bulk Save Matrix 7 Days):** Gọi `PUT /api/v1/schedules/bulk-save` lưu ma trận 7 ngày (`day_of_week` từ `0` đến `6`) × các ca làm việc thành công và idempotent khi lưu đè lần 2.
- [x] **AC-07.4 (Strict 1-1 Employee ↔ User):** Xoá mềm nhân viên (`DELETE /api/v1/employees/:id`) tự động khoá luôn tài khoản đăng nhập liên kết (`users.is_active = false`).
- [x] **AC-07.5 (Full Backend Verification Phase 4B):** Toàn bộ 7 modules trong `apps/api-server` (`pos`, `menu`, `inventory`, `cashflow`, `hr-schedule`, `mdm`, `iam`) được đăng ký sạch sẽ vào `AppModule`; chạy `pnpm -r typecheck` và `pnpm -r test` đạt 100% pass.
