---
trigger: model_decision
description: Vitest unit/integration testing, coverage thresholds, and Playwright E2E testing conventions for FnB.
---

# 05 — Chiến lược Kiểm thử (Testing Strategy Rules)

> Áp dụng cho: Mọi Agent viết và chạy test trên `@fnb/shared`, `@fnb/api-server`, `@fnb/web-app`. Toàn bộ monorepo sử dụng **Vitest** (unit/integration) và **Playwright** (E2E).

---

## 1. Triết lý Testing & Runner Chuẩn

- **MUST** áp dụng TDD (**Red → Green → Refactor**) cho mọi business logic quan trọng và luôn viết regression test khi sửa bug.
- **Test Runner thống nhất toàn monorepo: `Vitest`** (`vi.fn()`, `vi.mock()`, `vi.spyOn()`). **FORBIDDEN** dùng API của Jest (`jest.mock`, `jest.fn`) vì cả 3 packages đều chạy `vitest run`.

## 2. Phân loại Test & Coverage Targets

| Loại | Coverage Target | Vị trí | Tools |
|------|----------------|--------|-------|
| Shared Unit Tests | ≥ 90% | `packages/shared/src/__tests__/*.spec.ts` | Vitest |
| Backend Unit & Service Tests | ≥ 90% (business logic) | `apps/api-server/src/**/__tests__/*.spec.ts` | Vitest + Prisma mocks (`vi.mock`) |
| Frontend Component & Hook Tests | Key interactions & regressions | `apps/web-app/src/**/__tests__/*.{test,spec}.{ts,tsx}` | Vitest + React Testing Library |
| E2E Regression Tests | Critical user journeys | `apps/web-app/e2e/**` | Playwright CLI (`pnpm e2e` / `npx playwright test`) |

## 3. Quy ước Đặt tên Test

- Dùng tên mô tả đọc như specification: `it('should [hành vi mong đợi] when [điều kiện]', ...)` hoặc tiếng Việt rõ ngữ cảnh nghiệp vụ.
- **NEVER** dùng tên mơ hồ: `"should work"`, `"test 1"`.

## 4. Các Kịch bản Test BẮT BUỘC (MANDATORY)

### 4.1. POS, QR Realtime & Discounts:
- `splitKitchen`: chỉ xử lý `kitchen_status = 'NEW'`, phân rã `COMBO` qua `combo_items` về trạm vật lý (`BEP_NAU`, `BEP_CHIEN`, `PHA_CHE`, `BEP_*`), nâng `PENDING → SERVING`, tăng `batch_no`, trả HTTP `200 OK` idempotent `{ tickets: [] }` khi không có món `NEW`.
- `cancelOrModifyItem`: xoá cứng không in phiếu khi còn `NEW`; chuyển `CANCELLED` + in phiếu huỷ khi đã `PRINTED` (`EC-POS-06`).
- `provisionalBill` / `splitProvisionalBill`: giữ `status = 'SERVING'`, xoay vòng `payment_accounts` theo hạn mức Ngày/Tháng/Năm (`+07:00`), fallback priority #1 kèm `qrOverLimit = true` khi tất cả vượt hạn mức.
- `checkout` / `splitCheckout`: enforce `chk_order_payment_amounts` (`CASH`/`TRANSFER`/`SPLIT`), giải phóng bàn về `AVAILABLE` (khi thanh toán trọn đơn), tăng `discounts.used_count` atomic.
- `createOrder`: `TAKEAWAY` (`table_id = NULL`, `takeaway_number ≠ NULL`) vs `DINE_IN` (`table_id ≠ NULL`, `takeaway_number = NULL`).
- `createQrOrder`: chống cross-table IDOR (`403`), hỗ trợ redirect phiên khi đã `MOVE`/`MERGE` (`EC-POS-01`), kiểm tra Wi-Fi/GPS (`QrSecurityService`), và `qr-pending-check` cho Web Push.
- `discounts`: làm tròn xuống bội `1.000đ`, chặn `split-checkout` khi có giảm giá (`409 POS_DISCOUNT_BLOCKS_SPLIT`), hoàn `used_count` khi `VOID`, kiểm tra strict `pos:manualDiscount`.

### 4.2. Table Transfer (`MOVE` / `MERGE` / `SWAP` / `TO_TAKEAWAY`):
- `MOVE`: `DINE_IN → AVAILABLE` và `TAKEAWAY → AVAILABLE` (`is_takeaway = true`); bàn đích đang `OCCUPIED` → `409 POS_TABLE_NOT_AVAILABLE`.
- `MERGE`: `DINE_IN → OCCUPIED` và `TAKEAWAY → OCCUPIED` (`is_takeaway = true`, giữ nguyên `kitchen_status = 'PRINTED'`, gỡ giảm giá đơn nguồn, tính lại tổng đơn đích).
- `SWAP`: hoán đổi 2 bàn `DINE_IN`; đơn `TAKEAWAY` gọi `SWAP` → `409 POS_TAKEAWAY_CANNOT_MERGE`.
- `TO_TAKEAWAY`: giải phóng bàn nguồn về `AVAILABLE`, cấp `takeaway_number` mới, reset `is_takeaway = false`.
- Khoá dòng `SELECT ... FOR UPDATE` theo thứ tự `orders (id ASC)` → `dining_tables (id ASC)`; emit `order:session_redirected` + sinh `kitchenTransferSlip` nếu có món `PRINTED`.

### 4.3. Cashflow & Invoices:
- Kết ca: chỉ cộng `CASH` và `SPLIT.cash_amount`, loại trừ `TRANSFER`, `SPLIT.transfer_amount`, `VOIDED`; chỉ trừ `CASH_DRAWER` (`is_deleted = false`), loại trừ `EXTERNAL`.
- `preview`: bật `blindMode = true` (ẩn tiền lý thuyết) với tài khoản non-SuperAdmin.
- `discrepancy`: `=0 MATCHED`, `>0 SURPLUS`, `<0 SHORTAGE` (bắt buộc `note`), hỗ trợ `compensate` (`cashflow:compensate`).
- Invoices: cấm in lại hoá đơn `VOIDED` (`409`); quy trình sửa PTTT 2 bước (`invoices:update` → `pending_payment_edit` → `invoices:approve`).

### 4.4. Auth, Single-Session, RBAC & WebSocket:
- Chưa xác thực / token hết hạn / phiên bị thu hồi → `401` (KHÔNG phải `403`).
- Thiếu quyền / gọi `@SuperAdminOnly` → `403` (KHÔNG phải `401`); Super Admin bypass toàn bộ.
- `GET /api/v1/mdm/lookup` mở cho mọi `authenticated` user.
- Single-Session: đăng nhập đè phiên đang online không có `force: true` → `409 AUTH_SESSION_CONFLICT_ONLINE`; có `force: true` → phát `session:revoked`.
- `PosSocketGateway`: Staff JWT kiểm tra `activeSessionId`, QR Guest chỉ join `table_session_*` / `order_session_*` (cấm `pos_cashier_room`).

### 4.5. MDM, HR, Schedules, Payroll & UI Preferences:
- MDM `findOrCreate`: `trim()` → Title Case → bỏ dấu + `đ/Đ -> d` + lowercase; tìm kiếm mờ dùng `f_search_norm()`.
- HR: `short_name` & chống trùng `N.V.Anh (#12)`; nhân viên `is_deleted = true` vẫn render xám mờ `(Đã nghỉ)` trên `/schedules` và `/payroll`.
- Logout: gọi `queryClient.clear()`, xoá token/auth state, **giữ nguyên `ui_preferences`**.

## 5. Pre-Completion Checklist

**TRƯỚC KHI** báo cáo hoàn thành bất kỳ thay đổi code nào, Agent **MUST** chạy:

```bash
pnpm -r typecheck
pnpm -r test
pnpm -r lint
```

Và đảm bảo không để lại comment `// TODO`, `// FIXME`, `// placeholder` trong mã nguồn đã sửa.
