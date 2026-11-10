# Story 11: Xây dựng Giao diện Quản lý Hoá đơn (Module 2), Nhập hàng Kho (Module 3) & Đối soát Kết ca Dòng tiền (Module 4)

> **Story ID:** `STORY-11`  
> **Tên file:** `docs/stories/story-11-frontend-invoices-inventory-and-cashflow.md`  
> **Phase thực thi:** Phase 5 (Frontend Operational Modules 2, 3, 4)  
> **Agent phụ trách:** Antigravity  
> **Phụ thuộc (Dependencies):** `story-01`, `story-04`, `story-06`, `story-08`, `story-10`  
> **Quy tắc bất biến áp dụng:** Hard Invariant 1 (Cô lập 3 feature modules `invoices`, `inventory`, `cashflow`), Hard Invariant 6 (Giao diện Kết ca tách bạch Tiền mặt vs Chuyển khoản QR, trừ Tiền két `CASH_DRAWER`, bắt buộc nhập ghi chú khi lệch tiền), Hard Invariant 7 (Combobox Drawer Nhập hàng gọi `/api/v1/mdm/lookup` & tự lưu tên nguyên liệu mới), Hard Invariant 8 (Kiểm soát hiển thị nút `Void` theo `invoices:void` và nút sửa Ngân sách đầu ngày theo `cashflow:config`)  
> **Tài liệu tham chiếu:** `docs/bmad/01-PRD-Master.md` (§3.3, §3.4, §3.5), `.agents/rules/04-frontend-ux-table-and-print.md` (§3, §4), `docs/bmad/03-Edge-Cases-And-Invariants.md` (`EC-FIN-01`, `EC-FIN-02`, `EC-FIN-03`)

---

## 1. MỤC TIÊU (OBJECTIVES)

Hiện thực hoá 3 màn hình quản trị tài chính và kho vận hàng ngày trên nền tảng `BaseTable` (TanStack Table v8) và `Sheet` Drawer (Shadcn/UI):
1. **Module 2 — Quản lý & Tra cứu Hoá đơn (`src/features/invoices/`):** BaseTable **7 cột chuẩn**, tích hợp **Bộ lọc kép tách bạch** (bên trái `DateRangePicker` mặc định `Hôm nay` + bên phải Dropdown tiêu chí `Mã hoá đơn | Số bàn | Ghi chú` kết hợp ô `keyword` theo điều kiện AND), Modal xem chi tiết & in lại hoá đơn (`OfficialReceiptSlip`), và luồng **Huỷ hoá đơn ngoại lệ (`Void` — `EC-FIN-01`)** chỉ hiển thị khi user có quyền `invoices:void` (bắt buộc nhập lý do $\ge 10$ ký tự).
2. **Module 3 — Quản lý Nhập hàng Nguyên vật liệu (`src/features/inventory/`):** BaseTable **9+1 cột** gồm nhà cung cấp, kèm dòng tổng kết chân bảng (`"Tổng tiền nhập hàng trong kỳ: xxx.xxx đ"`). Drawer "Thêm mới" mở từ bên phải hỗ trợ nhiều dòng hàng, bắt buộc chọn NCC từ MDM (`SUPPLIER`) và nguyên liệu (`INGREDIENT`), tự điền ĐVT & giá gần nhất từ metadata; tên mới được chuẩn hoá và lưu vào MDM.
3. **Module 4 — Ngân sách, Dòng tiền & Đối soát Kết ca (`src/features/cashflow/`):** Hiển thị thẻ Ngân sách tiền lẻ đầu ngày (chỉ tài khoản có `cashflow:config` mới mở được modal chỉnh sửa), **Component Lưới Đếm tiền theo 9 Mệnh giá** (`500k` → `1k`), bảng đối soát tự động giữa Tiền lý thuyết trong két (`expected_cash_in_drawer`) và Tiền thực đếm (`actual_counted_cash`), bắt buộc nhập ô **Ghi chú giải trình chênh lệch** khi `discrepancy !== 0` (`EC-FIN-03`), hiển thị bảng tóm tắt bàn giao tiền mặt cuối ca (`Tiền giữ lại két` vs `Tiền mặt rút ra nộp Chủ quán`), và BaseTable Lịch sử Kết ca.

---

## 2. DANH SÁCH FILE CHECKLIST (FILE MANIFEST & CHECKLIST)

### 2.1. Feature Quản lý Hoá đơn — Module 2 (`apps/web-app/src/features/invoices/`)
- [x] `apps/web-app/src/features/invoices/api/invoices.api.ts` — Query & Mutation hooks cho `/api/v1/invoices` và `/api/v1/invoices/:id/void`.
- [x] `apps/web-app/src/features/invoices/components/invoices-page.tsx` — BaseTable 7 cột chuẩn:
  1. `STT`
  2. `Mã HĐ (HD-YYYYMMDD-NNNN)`
  3. `Bàn / Hình thức` (Badge `"Bàn 05"` hoặc `"Mang về #02"`)
  4. `Thời điểm tạo` (`DD/MM/YYYY HH:mm:ss`)
  5. `Tổng tiền & PTTT` (Số tiền + Badge màu: Xanh lá `CASH`, Xanh dương `TRANSFER`, Tím `SPLIT`)
  6. `Ghi chú & Trạng thái` (`SERVING`, `PAID`, `MERGED`, `VOIDED`)
  7. `Thao tác` (Icon `Eye` xem chi tiết & in lại bill; Nút `Huỷ đơn (Void)` chỉ hiện khi có `invoices:void`).
- [x] `apps/web-app/src/features/invoices/components/invoice-dual-filter-bar.tsx` — Bộ lọc kép tách bạch: Trái = `DateRangePicker` (mặc định `Hôm nay`), Phải = Select (`Mã hoá đơn`, `Số bàn`, `Ghi chú`) + Input `keyword`.
- [x] `apps/web-app/src/features/invoices/components/invoice-detail-modal.tsx` — Xem chi tiết món theo từng `batch_no`, lịch sử chuyển/gộp bàn (`table_transfer_logs`), nút `[In lại hoá đơn]` kết nối với `useThermalPrinter()`.
- [x] `apps/web-app/src/features/invoices/components/void-invoice-dialog.tsx` — Dialog xác nhận huỷ hoá đơn đã thu tiền (`EC-FIN-01`), validate `voidReason` tối thiểu 10 ký tự bằng Zod schema từ `@fnb/shared`.
- [x] `apps/web-app/src/features/invoices/index.ts` — Barrel export duy nhất (Hard Invariant 1).

### 2.2. Feature Quản lý Nhập hàng — Module 3 (`apps/web-app/src/features/inventory/`)
- [x] `apps/web-app/src/features/inventory/api/inventory.api.ts` — Hooks gọi `/api/v1/inventory-imports` và `/api/v1/mdm/lookup?category=SUPPLIER|INGREDIENT|UNIT`.
- [x] `apps/web-app/src/features/inventory/components/inventory-page.tsx` — BaseTable 9+1 cột:
  1. `STT`, 2. `Ngày nhập`, 3. `Tên món hàng`, 4. `Nhà cung cấp`, 5. `ĐVT`, 6. `Đơn giá`, 7. `Số lượng`, 8. `Thành tiền`, 9. `Nguồn tiền & Ghi chú`, 10. `Thao tác` + dòng tổng kết chân bảng.
- [x] `apps/web-app/src/features/inventory/components/inventory-import-drawer.tsx` — Drawer (`Sheet` mở từ bên phải) cho phép nhập nhiều dòng nguyên vật liệu cùng lúc, chọn nguồn tiền `CASH_DRAWER` (mặc định) hoặc `EXTERNAL`, tự động tính `Thành tiền = Đơn giá × Số lượng`.
- [x] `apps/web-app/src/features/inventory/components/ingredient-mdm-combobox.tsx` — Smart Combobox tìm kiếm autocomplete từ `/api/v1/mdm/lookup?category=INGREDIENT`: nếu chọn món có sẵn thì tự điền `default_unit` và gợi ý `last_price`; nếu gõ tên mới chưa có trong danh sách thì hiển thị nhãn `"+ Tạo mới nguyên liệu: '...'"` để gửi lên Backend tự lưu MDM.
- [x] `apps/web-app/src/features/inventory/components/supplier-mdm-combobox.tsx` — Combobox chọn NCC đang hoạt động từ `/api/v1/mdm/lookup?category=SUPPLIER` hoặc ghi tên mới để Backend chuẩn hoá, lưu MDM.
- [x] `apps/web-app/src/features/inventory/index.ts` — Barrel export duy nhất (Hard Invariant 1).

### 2.3. Feature Ngân sách & Kết ca Dòng tiền — Module 4 (`apps/web-app/src/features/cashflow/`)
- [x] `apps/web-app/src/features/cashflow/api/cashflow.api.ts` — Hooks gọi `/api/v1/cashflow/preview`, `/api/v1/cashflow/settlements`, `/api/v1/cashflow/settle`, và `/api/v1/cashflow/default-budget`.
- [x] `apps/web-app/src/features/cashflow/components/cashflow-page.tsx` — Bố cục tổng hợp gồm: Khu vực cấu hình Ngân sách đầu ngày, Khu vực Đếm tiền & Kết ca, Thẻ Bàn giao tiền mặt cuối ca, và BaseTable Lịch sử Kết ca.
- [x] `apps/web-app/src/features/cashflow/components/denomination-counter-grid.tsx` — Lưới đếm tiền gồm 9 mệnh giá (`500.000đ`, `200.000đ`, `100.000đ`, `50.000đ`, `20.000đ`, `10.000đ`, `5.000đ`, `2.000đ`, `1.000đ`) × ô nhập số tờ, tự động nhân và cộng dồn ra `actualCountedCash`.
- [x] `apps/web-app/src/features/cashflow/components/settlement-summary-card.tsx` — Hiển thị công thức đối soát tường minh (`Ngân sách đầu ca + Thu tiền mặt - Chi tiền két = Tiền lý thuyết trong két`), hiển thị tách biệt `Doanh thu Chuyển khoản QR (Đối soát NH - Không cộng vào két)`, badge trạng thái (`Chuẩn` Xanh / `Dư` Vàng / `Thiếu` Đỏ), bắt buộc nhập `Ghi chú giải trình chênh lệch` khi `discrepancyAmount !== 0` (`EC-FIN-03`), và hiển thị rõ 2 con số bàn giao:
  1. **Tiền mặt giữ lại trong két cho ca sau:** `= opening_budget`
  2. **Tiền mặt rút ra nộp Chủ quán:** `= actual_counted_cash - opening_budget`
- [x] `apps/web-app/src/features/cashflow/components/default-budget-dialog.tsx` — Modal sửa ngân sách mặc định đầu ngày (chỉ render nút mở khi `user.is_super_admin || user.permissions.cashflow?.config`).
- [x] `apps/web-app/src/features/cashflow/index.ts` — Barrel export duy nhất (Hard Invariant 1).
- [x] `apps/web-app/src/features/__tests__/invoices-inventory-cashflow.test.tsx` — Bộ test Vitest cho Bộ lọc kép Module 2, Drawer Combobox Module 3, và Lưới đếm tiền + Giải trình chênh lệch Module 4.

---

## 3. CHI TIẾT KỸ THUẬT & NGHIỆP VỤ (TECHNICAL SPECIFICATIONS)

### 3.1. Phân tách Tuyệt đối 2 Cơ chế Tìm kiếm ở Module 3 (`.agents/rules/04` §4)
- **Thanh tìm kiếm trên `BaseTable` Module 3:** Chỉ dùng để lọc lịch sử các phiếu đã nhập theo khoảng ngày và từ khoá, đồng thời cập nhật dòng tổng kết chân bảng `"Tổng tiền nhập hàng trong kỳ: xxx.xxx đ"`.
- **Smart Combobox bên trong Drawer "Thêm mới":** Dùng để chọn/nhập NCC (`category=SUPPLIER`) và tra cứu hoặc thêm nguyên vật liệu (`category=INGREDIENT`) khi lập phiếu nhập kho.

### 3.2. Ràng buộc Giải trình Chênh lệch Kết ca (`EC-FIN-03`)
- Trên `SettlementSummaryCard`: Khi `actualCountedCash - expectedCashInDrawer !== 0`, ô `Textarea` `"Ghi chú giải trình chênh lệch (Bắt buộc)"` tự động chuyển sang trạng thái required màu cam/đỏ và nút `[Xác nhận Kết ca]` bị disable cho đến khi thu ngân nhập lý do giải trình hợp lệ.

---

## 4. TIÊU CHÍ NGHIỆM THU (ACCEPTANCE CRITERIA)

- [x] **AC-11.1 (Module 2 Dual Filter & Void Guard):** Bộ lọc kép trên màn hình Hoá đơn mặc định chọn `Hôm nay` và kết hợp chính xác với tiêu chí tìm kiếm bên phải; nút `Huỷ đơn (Void)` hoàn toàn ẩn đối với `cashier01` nhưng hiển thị và yêu cầu nhập lý do $\ge 10$ ký tự đối với Quản lý / Super Admin.
- [x] **AC-11.2 (Module 3 9+1 Columns, Supplier & Ingredient MDM Combobox):** Bảng Nhập hàng hiển thị nhà cung cấp và tổng tiền chân bảng; Drawer yêu cầu chọn NCC từ MDM, chọn nguyên liệu tự điền ĐVT & giá gợi ý gần nhất, hoặc gõ tên mới để hệ thống lưu MDM.
- [x] **AC-11.3 (Module 4 Denomination Grid & Handover Summary):** Nhập số tờ trên lưới 9 mệnh giá tự tính đúng `actual_counted_cash`; không cộng doanh thu QR vào tiền lý thuyết trong két; khi lệch tiền bắt buộc nhập ghi chú giải trình mới cho bấm Kết ca; hiển thị rõ số tiền giữ lại két và số tiền nộp Chủ quán.
- [x] **AC-11.4 (Feature Isolation Invariant 1):** Không có bất kỳ import trực tiếp nào giữa `invoices`, `inventory`, và `cashflow`; `pnpm -r typecheck` và `pnpm -r test` pass 100%.
