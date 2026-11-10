# Story 06: Xây dựng `InventoryModule` (Nhập hàng Tự động Lưu MDM) & `CashflowModule` (Công thức Kết ca Đối soát Dòng tiền)

> **Story ID:** `STORY-06`  
> **Tên file:** `docs/stories/story-06-inventory-and-cashflow-settlement-backend.md`  
> **Phase thực thi:** Phase 4B (Backend Inventory & Cashflow Settlement)  
> **Agent phụ trách:** Codex  
> **Phụ thuộc (Dependencies):** `story-01`, `story-02`, `story-03`, `story-04`  
> **Quy tắc bất biến áp dụng:** Hard Invariant 6 (Công thức Kết ca Dòng tiền: chỉ cộng `CASH` + `cash_amount` của `SPLIT`, chỉ trừ `CASH_DRAWER` chưa xoá; **FORBIDDEN** cộng `TRANSFER`, **FORBIDDEN** cộng đơn `VOIDED`, **FORBIDDEN** trừ `EXTERNAL`), Hard Invariant 7 (Tự động chuẩn hoá và lưu nguyên liệu mới qua `MdmService.findOrCreate`), Hard Invariant 8 (Phân quyền `cashflow:config`), Hard Invariant 10 (Kiểu tiền tệ `Decimal(12, 2)`)  
> **Tài liệu tham chiếu:** `docs/bmad/01-PRD-Master.md` (§3.4, §3.5), `docs/bmad/03-Edge-Cases-And-Invariants.md` (Phần 2 & `EC-FIN-01`, `EC-FIN-02`, `EC-FIN-03`), `.agents/rules/02-pos-kitchen-and-cashflow-logic.md` (§5, §6), `docs/architecture/03-verified-sequences.mmd` (`SEQ-04`), `docs/architecture/04-audit-report.md` (`DISCREPANCY-FIN-01`)

---

## 1. MỤC TIÊU (OBJECTIVES)

Hiện thực hoá 2 phân hệ quản trị chi phí và dòng tiền cốt lõi của cửa hàng:
1. **`InventoryModule` (Module 3 — Quản lý Nhập hàng Nguyên vật liệu):** Cho phép nhập nhiều dòng nguyên vật liệu trong một lần lưu từ Drawer, tự động chuẩn hoá và lưu nguyên liệu/đơn vị tính mới vào Master Data qua `MdmService.findOrCreate()` (cập nhật luôn `metadata: { default_unit, last_price }`), phân loại rõ nguồn tiền `CASH_DRAWER` (Tiền két thu ngân) và `EXTERNAL` (Quỹ ngoài/Chủ CK), hỗ trợ lọc lịch sử kèm tổng tiền chân bảng và xoá mềm có kiểm soát quyền hạn theo ca/ngày.
2. **`CashflowModule` (Module 4 — Ngân sách, Dòng tiền & Đối soát Kết ca):** Thực thi chính xác 100% **Công thức Kết ca Bất biến (Hard Invariant 6 & `DISCREPANCY-FIN-01`)**, hỗ trợ đếm tiền theo 9 mệnh giá (`500k` → `1k`), bắt buộc nhập ghi chú giải trình khi lệch tiền (`discrepancy_amount !== 0` — `EC-FIN-03`), tính toán số tiền mặt giữ lại két (`opening_budget`) và số tiền mặt rút ra bàn giao cho Chủ quán (`actual_counted_cash - opening_budget`).

---

## 2. DANH SÁCH FILE CHECKLIST (FILE MANIFEST & CHECKLIST)

### 2.1. Module Nhập hàng Kho (`apps/api-server/src/modules/inventory/`)
- [ ] `apps/api-server/src/modules/inventory/inventory.module.ts` — Import `MdmModule` (`// Cross-module: MdmModule needed for MdmService.findOrCreate`).
- [ ] `apps/api-server/src/modules/inventory/inventory.controller.ts`:
  - `GET /api/v1/inventory-imports` — `@RequirePermission('inventory', 'view')`: Lọc lịch sử nhập hàng (`fromDate`, `toDate`, `keyword`, `paymentSource`), phân trang server-side, trả kèm `summary: { totalImportCost, totalCashDrawerCost, totalExternalCost }` cho dòng tổng kết chân bảng.
  - `POST /api/v1/inventory-imports` — `@RequirePermission('inventory', 'create')`: Nhận nhà cung cấp MDM và mảng nhiều dòng hàng từ Drawer, gọi `MdmService.findOrCreate('SUPPLIER', ...)`, `MdmService.findOrCreate('INGREDIENT', ...)` và `MdmService.findOrCreate('UNIT', ...)`, tính `total_cost = ROUND(unit_price * quantity, 2)` bằng `Prisma.Decimal`, lưu ID và tên NCC snapshot trong `$transaction`.
  - `DELETE /api/v1/inventory-imports/:id` — `@RequirePermission('inventory', 'delete')`: Xoá mềm (`is_deleted = true`). Kiểm tra quy tắc bảo mật theo ca/ngày: Thu ngân thường chỉ được xoá phiếu nhập trong ngày/ca hiện tại; xoá phiếu của ngày cũ yêu cầu `user.is_super_admin === true` hoặc Quản lý (nếu không đủ quyền → trả `403 Forbidden` với `ErrorCodes.INVENTORY_PAST_SHIFT_FORBIDDEN`).
- [ ] `apps/api-server/src/modules/inventory/inventory.service.ts`
- [ ] `apps/api-server/src/modules/inventory/dto/`

### 2.2. Module Dòng tiền & Kết ca (`apps/api-server/src/modules/cashflow/`)
- [ ] `apps/api-server/src/modules/cashflow/cashflow.module.ts`
- [ ] `apps/api-server/src/modules/cashflow/cashflow.controller.ts`:
  - `GET /api/v1/cashflow/preview` — `@RequirePermission('cashflow', 'view')`: Xem trước số liệu dòng tiền thời gian thực của ca hiện tại (`openingBudget`, `totalCashSales`, `totalTransferSales`, `totalCashImports`, `expectedCashInDrawer`).
  - `GET /api/v1/cashflow/settlements` — `@RequirePermission('cashflow', 'view')`: Danh sách lịch sử kết ca lọc theo khoảng ngày (`fromDate`, `toDate`), sắp xếp `settlement_date DESC`.
  - `POST /api/v1/cashflow/settle` — `@RequirePermission('cashflow', 'create')`: Thực hiện đối soát và chốt kết ca.
  - `PUT /api/v1/cashflow/default-budget` — `@RequirePermission('cashflow', 'config')`: Cấu hình ngân sách tiền lẻ mặc định đầu ngày (lưu vào bảng cấu hình hệ thống hoặc `master_data` metadata; chỉ Super Admin / người có quyền `cashflow:config` mới gọi được, Thu ngân gọi sẽ nhận `403 Forbidden`).
- [ ] `apps/api-server/src/modules/cashflow/cashflow.service.ts` — Hiện thực hoá công thức kết ca chuẩn xác bằng `Prisma.Decimal`.
- [ ] `apps/api-server/src/modules/cashflow/dto/`

### 2.3. Bộ Kiểm thử Tự động Bắt buộc (`apps/api-server/src/modules/`)
- [ ] `apps/api-server/src/modules/inventory/__tests__/inventory.service.spec.ts` — Test nhập hàng nhiều dòng tự động tạo/cập nhật MDM (`default_unit`, `last_price`), tính đúng `total_cost`, và phân quyền xoá mềm phiếu nhập.
- [ ] `apps/api-server/src/modules/cashflow/__tests__/cashflow.service.spec.ts` — Test đầy đủ các kịch bản bắt buộc trong `.agents/rules/05-testing-strategy.md` (§4.3) và kịch bản hỗn hợp trong `docs/bmad/03-Edge-Cases-And-Invariants.md` (Phần 2).

---

## 3. CHI TIẾT KỸ THUẬT & NGHIỆP VỤ (TECHNICAL SPECIFICATIONS)

### 3.1. Công thức Kết ca Bất biến (Hard Invariant 6 & `DISCREPANCY-FIN-01`)
Trong `CashflowService.settleShift(dto, userId)` (chạy trong `prisma.$transaction()`):
1. **Tính Tổng thu Tiền mặt (`total_cash_sales`):**
   ```sql
   SELECT COALESCE(SUM(
     CASE
       WHEN payment_method = 'CASH' THEN total_amount
       WHEN payment_method = 'SPLIT' THEN cash_amount
       ELSE 0
     END
   ), 0) AS total_cash_sales
   FROM orders
   WHERE status = 'PAID'
     AND payment_method IN ('CASH', 'SPLIT')
     AND paid_at >= :shiftStart AND paid_at <= :shiftEnd;
   ```
   - **QUY TẮC CẤM 1:** Tuyệt đối **KHÔNG** cộng các đơn `payment_method = 'TRANSFER'` hoặc phần `transfer_amount` của đơn `SPLIT` vào `total_cash_sales`.
   - **QUY TẮC CẤM 2 (`EC-FIN-01`):** Tuyệt đối **KHÔNG** cộng các đơn có `status = 'VOIDED'` (dù trước đó đã từng `PAID`).
2. **Tính Tổng thu Chuyển khoản QR (`total_transfer_sales` — chỉ dùng đối soát sao kê ngân hàng):**
   ```sql
   SELECT COALESCE(SUM(
     CASE
       WHEN payment_method = 'TRANSFER' THEN total_amount
       WHEN payment_method = 'SPLIT' THEN transfer_amount
       ELSE 0
     END
   ), 0) AS total_transfer_sales
   FROM orders
   WHERE status = 'PAID'
     AND payment_method IN ('TRANSFER', 'SPLIT')
     AND paid_at >= :shiftStart AND paid_at <= :shiftEnd;
   ```
3. **Tính Tổng chi Tiền két Nhập hàng (`total_cash_imports`):**
   ```sql
   SELECT COALESCE(SUM(total_cost), 0) AS total_cash_imports
   FROM inventory_imports
   WHERE payment_source = 'CASH_DRAWER'
     AND is_deleted = FALSE
     AND created_at >= :shiftStart AND created_at <= :shiftEnd;
   ```
   - **QUY TẮC CẤM 3:** Tuyệt đối **KHÔNG** trừ các phiếu nhập có `payment_source = 'EXTERNAL'` hoặc `is_deleted = TRUE`.
4. **Tính Tiền mặt Lý thuyết trong Két & Chênh lệch (Bằng `Prisma.Decimal`):**
   - `expected_cash_in_drawer = opening_budget.plus(total_cash_sales).minus(total_cash_imports)`
   - Tính `actual_counted_cash` từ `denominations_detail` (`500000 * n_500k + 200000 * n_200k + ... + 1000 * n_1k`) và đối chiếu với `dto.actualCountedCash`.
   - `discrepancy_amount = actual_counted_cash.minus(expected_cash_in_drawer)`
   - Xác định `status`:
     - `discrepancy_amount.isZero()` → `'MATCHED'`
     - `discrepancy_amount.greaterThan(0)` → `'SURPLUS'`
     - `discrepancy_amount.lessThan(0)` → `'SHORTAGE'`
5. **Kiểm tra Ghi chú Giải trình Bắt buộc (`EC-FIN-03`):**
   - Nếu `!discrepancy_amount.isZero()` mà `!dto.note || dto.note.trim().length === 0`: ném lỗi `422 UnprocessableEntityException` (`ErrorCodes.CASHFLOW_DISCREPANCY_NOTE_REQUIRED`: `"Vui lòng nhập ghi chú giải trình khi tiền thực đếm chênh lệch với tiền lý thuyết"`).
6. **Tính Toán Bàn giao Tiền mặt Cuối ca:**
   - Trả về trong response:
     - `cashRetainedInDrawer: opening_budget` (Số tiền lẻ giữ lại trong két cho ca sau).
     - `cashToHandOver: Decimal.max(0, actual_counted_cash.minus(opening_budget))` (Số tiền mặt rút khỏi két nộp cho Chủ quán).

---

## 4. TIÊU CHÍ NGHIỆM THU (ACCEPTANCE CRITERIA)

- [ ] **AC-06.1 (Comprehensive Cashflow Scenario Verification):** Chạy bài test với kịch bản mẫu trong `docs/bmad/03-Edge-Cases-And-Invariants.md` (Phần 2) + thêm 1 đơn `SPLIT` (`cash: 100k, transfer: 200k`) và 1 đơn `VOIDED` (`150k`): kết quả `expected_cash_in_drawer`, `total_cash_sales`, `total_transfer_sales`, `total_cash_imports`, `discrepancy_amount`, và `status` đúng chính xác đến từng đồng (`Decimal(12, 2)`).
- [ ] **AC-06.2 (Discrepancy Explanation Guard `EC-FIN-03`):** Khi `actual_counted_cash !== expected_cash_in_drawer` (`SURPLUS` hoặc `SHORTAGE`) mà không gửi `note` giải trình → API trả về `422` và từ chối lưu kết ca.
- [ ] **AC-06.3 (Inventory Auto-MDM & Metadata Sync):** Khi tạo phiếu nhập với nguyên liệu mới `"  ba chỉ bò mỹ  "`, đơn vị `"Kg"`, đơn giá `180000` → hệ thống tự động tạo bản ghi `master_data` với `name = "Ba Chỉ Bò Mỹ"`, `normalized_name = "ba chi bo my"`, `metadata = { default_unit: "Kg", last_price: 180000 }`.
- [ ] **AC-06.4 (RBAC `cashflow:config` Enforcement):** Tài khoản `cashier01` gọi `POST /api/v1/cashflow/settle` thành công (`201`), nhưng gọi `PUT /api/v1/cashflow/default-budget` bị chặn với `403 Forbidden`.
