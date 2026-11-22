# Báo Cáo Tổng Kết Kiểm Thử E2E Toàn Diện — Hệ Thống POS Mì Cay

- **Thời điểm hoàn tất:** 2026-11-18
- **Phạm vi:** Toàn site · Toàn module (`M0 → M17`) · `P0` 6 mẫu phiếu in nhiệt 80mm · Ma trận Responsive (`6 viewports × Light/Dark`, quét live đủ cả 15 routes trên `1024×768`, `768×1024`, `390×844`, `375×667`) · Ma trận Phân quyền Vai trò × Route (`superadmin`, `admin`, `adminview`, `thungan`, `qr_guest` + tài khoản mới `qa_e2e_c`) · 4 Luồng Xương Sống (`Flow A–D` chạy live hậu-hotfix) · Audit Bảo mật & Độ chịu lỗi (`SEC-01..10`) · Kiểm tra chéo 10 Hard Invariants.
- **Nguồn sự thật độ phủ:** [e2e-coverage-ledger.md](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/docs/qa/e2e-coverage-ledger.md) (`173/173` mục đạt `PASS` hoặc `FAIL→FIXED`, `0` mục `TODO`, `0` `TODO-trace`).

---

## 1. Tổng Kết Độ Phủ Kiểm Thử

| Nhóm kiểm thử | Tổng mục | PASS / FIXED | TODO | TODO-trace | Trạng thái |
|---------------|----------|--------------|------|------------|------------|
| Module `M0 → M17` (Section 1) | 130 | 130 (20 `FAIL→FIXED`) | 0 | 0 | DONE |
| `P0` — 6 Phiếu in nhiệt 80mm (Section 2) | 6 | 6 (1 `FAIL→FIXED`) | 0 | 0 | DONE |
| Ma trận Responsive `6 viewports × Light/Dark` (Section 3) | 6 | 6 (2 `FAIL→FIXED`) | 0 | 0 | DONE |
| Ma trận Vai trò × Route (`M0–M16` + `/login` + `/qr`) (Section 4) | 17 | 17 (2 `FAIL→FIXED`) | 0 | 0 | DONE |
| Luồng Xương Sống xuyên module `Flow A–D` (Section 5) | 4 | 4 | 0 | 0 | DONE |
| Audit Bảo mật & Độ chịu lỗi `SEC-01..10` (Section 6) | 10 | 10 (2 `FAIL→FIXED`) | 0 | 0 | DONE |

---

## 2. Tổng Hợp Hotfix Đã Thực Hiện & Kiểm Chứng Regression

Tất cả các lỗi phát hiện trong chiến dịch đều được tái hiện thực tế trên trình duyệt/API, viết test hồi quy, vá tối thiểu tuân thủ 10 Hard Invariants và kiểm chứng lại trên trình duyệt thật:

1. **M0 — Validation mật khẩu tiếng Việt & Mobile Navbar / Password Toggle**
   - Vá thông báo Zod v4 & nút mobile `< 44px`, bổ sung `aria-label` tìm kiếm mobile, tách bucket rate-limit `/api/v1/auth/refresh` khỏi `/api/v1/auth/login` để tránh `429` khi F5 đa thiết bị cùng Wi-Fi, chặn storm refresh token khi hết hạn (`401`).
   - Tập tin: `packages/shared/src/schemas/rbac.schema.ts:288-296`, `apps/web-app/src/features/profile/components/login-page.tsx:173,300,335`, `apps/web-app/src/components/ui/password-input.tsx:29,41`, `apps/web-app/src/components/layout/top-navbar.tsx:103,142,163,178`, `apps/web-app/src/lib/api-client.ts:285-305`, `apps/api-server/src/common/security/rate-limit.guard.ts:125-161,299-308`.
2. **M3 — Tìm kiếm nhân sự không dấu, phân quyền checkbox 1-1 & hiển thị lỗi cụ thể**
   - Áp dụng `normalizeVietnameseString` khi tìm kiếm, ẩn checkbox tạo tài khoản 1-1 khỏi `admin` (chỉ `superadmin` được tạo), dùng `resolveErrorMessage` giữ nguyên thông báo lỗi trùng SĐT/CCCD/username.
   - Tập tin: `apps/api-server/src/modules/hr-schedule/employees.service.ts:25,51-77`, `apps/api-server/src/modules/hr-schedule/__tests__/hr-schedule.service.spec.ts:448-478`, `apps/web-app/src/features/employees/components/employees-page.tsx:483`, `apps/web-app/src/features/employees/components/employee-form-drawer.tsx:97-190,275-315`, `packages/shared/src/constants/message-catalog.ts:1780-1797`.
3. **M4 — Màu tag chuyên môn từ `specialtyCode`, giữ badge `(Đã nghỉ)` & guard chuyển tuần chưa lưu**
   - Khớp contract backend `specialtyCode`, bảo toàn tag `(Đã nghỉ)` cho nhân viên đã soft-delete khi gộp `cell.employees`, bổ sung dialog xác nhận chưa lưu khi bấm chuyển tuần (`Tuần trước`/`Tuần sau`/`Tuần hiện tại`).
   - Tập tin: `apps/web-app/src/features/schedules/api/schedules.api.ts:11-26`, `apps/web-app/src/features/schedules/components/schedule-cell-multiselect.tsx:120-124,251,270-296`, `apps/web-app/src/features/schedules/components/schedules-matrix-page.tsx:105-120,248-255,317-325,408-452`.
4. **M5 — Tìm kiếm bảng lương không dấu (`PayrollService`)**
   - Dùng `normalizeVietnameseString` để lọc theo tên/mã nhân viên không dấu (`"van anh"` trả đủ bản ghi).
   - Tập tin: `apps/api-server/src/modules/hr-schedule/payroll.service.ts:19,243-249`, `apps/api-server/src/modules/hr-schedule/__tests__/payroll.service.spec.ts:147-184`.
5. **M7 — Tìm kiếm không dấu & khoá chặt RBAC `menu.import`**
   - Chuẩn hoá tìm kiếm tiếng Việt cho `MenuManagementPage`, `StationManageDialog`, `CategoryManageDialog`; khoá `POST /api/v1/menu/products/import-excel` yêu cầu `menu.import` thay vì `menu.update`.
   - Tập tin: `apps/web-app/src/features/menu/components/menu-management-page.tsx:33,49,74,145-146`, `apps/web-app/src/features/menu/components/station-manage-dialog.tsx:16,65`, `apps/web-app/src/features/menu/components/category-manage-dialog.tsx:22,63`, `apps/api-server/src/modules/menu/menu.controller.ts:74-76`, `apps/api-server/src/modules/menu/__tests__/menu.controller.spec.ts:74-129`.
6. **M8 & M9 — Tìm kiếm không dấu tại `/discounts` và `/payment-qr`**
   - Nâng cấp `DiscountsService`, `DiscountFormDrawer` (`targetFilter`), `PaymentQrPage` dùng chuẩn hoá không dấu Unicode + regression test.
   - Tập tin: `apps/api-server/src/modules/discounts/discounts.service.ts:33,109-139,545-589`, `apps/web-app/src/features/discounts/components/discount-form-drawer.tsx:25,172-177`, `apps/api-server/src/modules/discounts/__tests__/discounts.service.spec.ts:357-373`, `apps/web-app/src/features/payment-qr/components/payment-qr-page.tsx:38,175-194`.
7. **M10-1 — Khoá chặt UI read-only cho `adminview` trên `/pos`**
   - Ẩn toàn bộ nút ghi (`TẠO ĐƠN MANG VỀ`, `Cấu hình Thực đơn`, thao tác món/bàn/thanh toán) theo quyền `pos.*` và `menu.*`, đồng bộ API `403`.
   - Tập tin: `apps/web-app/src/features/pos-counter/components/table-grid-panel.tsx:54,318-336`, `apps/web-app/src/features/pos-counter/components/pos-menu-panel.tsx`, `apps/web-app/src/features/pos-counter/components/pos-unified-page.tsx`, `apps/web-app/src/features/pos-counter/components/live-invoice-panel.tsx`, `apps/web-app/src/features/pos-counter/__tests__/pos-counter.test.tsx:1357-1480`.
8. **M10-2 — Khoá nút thao tác trên `LiveInvoicePanel` khi đơn chuyển `PAID`/`VOIDED`/`MERGED` từ tab khác**
   - **Lỗi phát hiện khi test live 2 tab thu ngân bắn đồng thời `POST /checkout` (`Bàn 04`):** Tab còn lại sau khi thua `409 Conflict` nhận realtime badge `"Đã thanh toán"`, nhưng nút `"Đổi / Gộp bàn"` (`btn-table-action`) và `"Huỷ món bếp"` chưa bị khoá/ẩn theo `isOrderActive`.
   - **Hotfix:** Bổ sung `isOrderActive = order.status === 'PENDING' || order.status === 'SERVING'` để khoá `btn-table-action`, `btn-split-kitchen` và ẩn các nút sửa/huỷ món/huỷ đơn khi đơn không còn mở; kiểm chứng live qua HMR & Vitest.
   - Tập tin: `apps/web-app/src/features/pos-counter/components/live-invoice-panel.tsx:283,288,491,690,720,745`, `apps/web-app/src/features/pos-counter/__tests__/pos-counter.test.tsx:1481-1548`.
9. **M11 — Không kẹt nút gửi & không tự replay ngầm khi Offline (`networkMode: 'always'`)**
   - Bật `networkMode: 'always'` trên TanStack Query `queries` & `mutations` để khi mất mạng, thao tác từ chối tức thì bằng toast lỗi rõ ràng và bảo toàn giỏ hàng.
   - Tập tin: `apps/web-app/src/providers/query-provider.tsx:42-52`, `apps/web-app/src/features/qr-order/__tests__/qr-order-messages.test.tsx:365-445`.
10. **M12 & P0-(5) — Chặn in lại hoá đơn đã huỷ (`VOIDED`)**
    - Bổ sung kiểm tra `detail.status !== 'PAID'` trong `InvoicesService.reprint()` trả `409 Conflict` (`POS_INVOICE_VOIDED`), ẩn nút `"In lại hoá đơn"` trên `InvoiceDetailModal` khi `status === 'VOIDED'`.
    - Tập tin: `apps/api-server/src/modules/pos/invoices.service.ts:242-254`, `apps/web-app/src/features/invoices/components/invoice-detail-modal.tsx:369-388`, `apps/api-server/src/modules/pos/__tests__/invoices.service.spec.ts:384-415`.
11. **M17-1 — A11y `aria-label` cho nút icon**
    - Bổ sung `aria-label` rõ nghĩa cho nút phân trang trong `AuditHistoryDrawer`, nút giảm/tăng/xoá dòng trên `LiveInvoicePanel` và nút xoá dòng trong `InventoryImportDrawer`.
    - Tập tin: `apps/web-app/src/components/audit-history-drawer/audit-history-drawer.tsx:549-569`, `apps/web-app/src/features/pos-counter/components/live-invoice-panel.tsx:174-205,491-528`, `apps/web-app/src/features/inventory/components/inventory-import-drawer.tsx:302`, `apps/web-app/src/components/audit-history-drawer/__tests__/audit-history-drawer.spec.tsx:99-100`.
12. **SEC-06 — Vá lỗ hổng IDOR `createQrOrder` (Cross-Table & Takeaway Hijacking)**
    - **Lỗi phát hiện:** `POST /api/v1/public/orders/qr` trước đó chấp nhận `activeOrderId` bất kỳ từ client dù gửi kèm `qrToken` bàn khác (ví dụ `qrToken` `Bàn 02` + `activeOrderId` `Bàn 01` → `201 Created`).
    - **Hotfix:** Bổ sung `PosService.isQrOrderAccessibleFromTable()` xác thực đơn chỉ được phép truy cập nếu `order.id === qrTable.activeOrderId`, `order.tableId === qrTable.id`, hoặc `order.tableTransferLogs` có chuyển đi từ `qrTable.name` (`MOVE`/`MERGE`/`SWAP`); từ chối IDOR bằng `403 Forbidden`.
    - Tập tin: `apps/api-server/src/modules/pos/pos.service.ts:265-267,2254-2270`, `apps/api-server/src/modules/pos/__tests__/pos.service.spec.ts:332-336,414-439`.

---

## 3. Kết Quả Kiểm Chứng E2E Bổ Sung Toàn Diện

- **Quét Responsive & Theme toàn site (`15 routes × 4 non-desktop viewports × 2 themes = 120 lượt` + `/qr/:token` trên `1024×768`, `768×1024`, `390×844`, `375×667`):** `overflowFailures: []`, `clippedFailures: []`, `0` console error xuyên suốt toàn bộ `15` route (`/dashboard`..`/profile`), mở Nav Drawer `768px` (`14` link) sạch sẽ.
- **Đua tranh đồng thời thực tế (`SEC-10`):**
  - Bắn song song `2x POST /api/v1/public/orders/qr` (`Promise.all`) trên `Bàn 04` trống → cả 2 gộp vào đúng `1` đơn `orderId=100` (`HD-20261118-0010`, `batch 1 + batch 2`, tổng `10.000 đ`).
  - Bắn song song trên 2 trình duyệt cô lập (`superadmin` + `thungan`) nút `"Xác nhận & Không in"` `POST /checkout` → đúng `1` phiên thắng (`201`), `1` phiên thua sạch (`409 Conflict: Đơn hàng không còn mở để thanh toán`).
- **6 Phiếu in nhiệt 80mm (`@media print` CSS & Network):** Xác nhận rule `@media print { @page { margin: 0px; } body * { visibility: hidden; } #thermal-print-container ... width: 80mm; padding: 0px 4mm }` và kiểm tra Network `TableQrSlip` chỉ dùng `data:image/svg+xml;utf8,...` offline (`0` request mạng ngoài).
- **Flow A, Flow B, Flow C, Flow D đối soát thực tế tới thời điểm kết thúc:**
  - `6` hoá đơn `PAID` (`HD-0001` `253k`, `HD-0005` `50k`, `HD-0006` `15k`, `HD-0009` `117k`, `HD-0010` `10k`, `HD-0011` `15k`) = **`460.000 đ`** (`190.000 đ` Tiền mặt + `270.000 đ` VietQR; `VOIDED` loại trừ).
  - Kho: `CASH_DRAWER = 120.000 đ`, `EXTERNAL = 80.000 đ`, xoá mềm `35.000 đ`.
  - Nhân sự mới Flow C (`Lê Bảo Ngọc` / `qa_e2e_c`, `Part-time` `4h` Thứ 4): đăng nhập thật chỉ thấy `4` trang được cấp, trả `403` đủ `6` trang cấm; Bảng lương & Dashboard trừ đúng quỹ lương `-100.000 đ` → Lãi ròng sau nhập & lương **`+160.000 đ` (`Biên 34.8%`)**.
  - Đối soát két Invariant 6 khớp 100% giữa `/cashflow` và `/dashboard`: `1.000.000 + 190.000 - 120.000 = 1.070.000 đ`.

---

## 4. Kết Quả Lệnh DoD Bắt Buộc (Sau Lần Sửa Code Cuối Cùng)

| STT | Lệnh DoD | Kết quả chi tiết | Exit Code |
|-----|----------|------------------|-----------|
| 1 | `pnpm -r lint` | `packages/shared`, `apps/api-server`, `apps/web-app` — 0 lỗi ESLint | `0` |
| 2 | `pnpm -r typecheck` | `tsc --noEmit` trên `@fnb/shared`, `@fnb/api-server` (`tsconfig.json` & `tsconfig.spec.json`), `@fnb/web-app` PASS | `0` |
| 3 | `pnpm --filter @fnb/web-app build` | `tsc -p tsconfig.json --noEmit && vite build` (2549 modules, built in `3.33s`) | `0` |
| 4 | `pnpm --filter @fnb/api-server exec tsc -p tsconfig.json` | Biên dịch NestJS backend sạch lỗi | `0` |
| 5 | `pnpm -r --workspace-concurrency=1 test` | `@fnb/shared`: `5` files / `53` tests (`1.31s`); `@fnb/api-server`: `40` files / `364` tests (`23.46s`); `@fnb/web-app`: `40` files / `205` tests (`35.52s`) — Tổng `85` files / `622` tests PASS (`0` fail, `0` skip) | `0` |
| — | Kiểm tra vệ sinh mã nguồn & sổ | `0` comment `// TODO` / `// placeholder`; `0` mục `TODO` / `TODO-trace` / `IN_PROGRESS` / `BLOCKED` trong sổ (`173/173` PASS/FIXED) | `0` |
