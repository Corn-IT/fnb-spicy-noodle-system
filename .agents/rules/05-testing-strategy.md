# 05 — Chiến lược Kiểm thử (Testing Strategy Rules)

> Áp dụng cho: Codex (Phase 4B — viết test), Antigravity (Phase 5 — frontend tests). Kết hợp skill: `test-driven-development`.

---

## 1. Triết lý Testing

- **MUST** áp dụng TDD (Test-Driven Development) cho **MỌI** business logic quan trọng.
- Chu trình: **Red → Green → Refactor** — viết test TRƯỚC, implement SAU, refactor CUỐI.
- Tham chiếu: built-in skill `test-driven-development` + `obra/superpowers:test-driven-development`.

## 2. Phân loại Test & Coverage Targets

| Loại | Coverage Target | Vị trí | Tools |
|------|----------------|--------|-------|
| Unit Tests | ≥ 90% (business logic) | `apps/api-server/src/modules/**/*.spec.ts` | Jest + Prisma mocks |
| Integration Tests | ≥ 80% (API endpoints) | `apps/api-server/test/**/*.e2e-spec.ts` | Jest + Supertest + Test DB |
| Frontend Tests | Key interactions | `apps/web-app/src/**/*.test.tsx` | Vitest + React Testing Library |

## 3. Quy ước Đặt tên Test

```typescript
describe('[ModuleName]Service', () => {
  describe('methodName', () => {
    it('should [hành vi mong đợi] when [điều kiện]', () => {});
    it('should throw [ErrorType] when [điều kiện không hợp lệ]', () => {});
  });
});
```

- **MUST** dùng tên mô tả đọc như specification.
- **NEVER** dùng tên mơ hồ: `"should work"`, `"test 1"`, `"handles edge case"`.

## 4. Các Kịch bản Test BẮT BUỘC (MANDATORY)

> Mỗi nhóm test dưới đây **MUST** tồn tại và pass TRƯỚC KHI code được coi là hoàn thành.

### 4.1 POS Module Tests:

```
✓ splitKitchen: chỉ xử lý items có kitchen_status='NEW', bỏ qua 'PRINTED'
✓ splitKitchen: phân rã COMBO qua combo_items thành sub-items đúng station (BEP_NAU, BEP_CHIEN, PHA_CHE)
✓ splitKitchen: trả về HTTP 200 OK idempotent ({ tickets: [] }) khi không có items NEW (EC-POS-05)
✓ splitKitchen: tự động nâng order.status từ 'PENDING' sang 'SERVING' và bàn sang 'OCCUPIED' (DISCREPANCY-SM-02)
✓ splitKitchen: batch_no tăng dần (Lượt 1, 2, 3)
✓ cancelOrModifyItem: xoá cứng không in phiếu khi còn 'NEW', chuyển sang 'CANCELLED' + in phiếu huỷ khi đã 'PRINTED' (EC-POS-06)
✓ provisionalBill: giữ order.status = 'SERVING' (KHÔNG đổi sang PAID)
✓ checkout: chuyển status → 'PAID', kiểm tra chk_order_payment_amounts (CASH/TRANSFER/SPLIT), giải phóng bàn → 'AVAILABLE'
✓ createOrder(TAKEAWAY): table_id = NULL, takeaway_number ≠ NULL
✓ createOrder(DINE_IN): table_id ≠ NULL, takeaway_number = NULL
✓ qrOrderAddon: tự động điều hướng món gọi thêm từ tab QR cũ sang bàn mới khi đơn đã MOVE hoặc MERGE (EC-POS-01)
```

### 4.2 Table Transfer Tests:

```
✓ MOVE: bàn nguồn → AVAILABLE, bàn đích → OCCUPIED, sinh kitchenTransferSlip nếu đã có món PRINTED (EC-POS-04)
✓ MOVE: bàn đích đã occupied → trả 409 Conflict (POS_TABLE_NOT_AVAILABLE)
✓ MERGE: chuyển tất cả items sang đơn đích (giữ nguyên kitchen_status), đơn nguồn → MERGED
✓ MERGE: đơn TAKEAWAY → trả 409 Conflict (POS_TAKEAWAY_CANNOT_MERGE)
✓ SWAP: hoán đổi table_id giữa 2 đơn đúng cách
✓ Concurrent MOVE/MERGE/SWAP + QR addon: SELECT ... FOR UPDATE theo thứ tự orders (id ASC) -> dining_tables (id ASC) ngăn deadlock & data corruption (DISCREPANCY-LOCK-01)
✓ WebSocket: emit 'order:session_redirected' sau MOVE/MERGE
```

### 4.3 Cashflow Tests (QUAN TRỌNG NHẤT):

```
✓ Settlement: CHỈ tính CASH và phần cash_amount của đơn SPLIT, loại trừ TRANSFER và phần transfer_amount của đơn SPLIT (EC-FIN-02)
✓ Settlement: loại trừ hoàn toàn các hoá đơn đã huỷ status='VOIDED' (EC-FIN-01)
✓ Settlement: CHỈ trừ CASH_DRAWER imports (is_deleted=false), loại trừ EXTERNAL
✓ Discrepancy = 0 → status 'MATCHED'
✓ Discrepancy > 0 → status 'SURPLUS' (bắt buộc có note giải trình - EC-FIN-03)
✓ Discrepancy < 0 → status 'SHORTAGE' (bắt buộc có note giải trình - EC-FIN-03)
✓ Mixed scenario: đơn CASH + đơn TRANSFER + đơn SPLIT + đơn VOIDED + import CASH_DRAWER + import EXTERNAL
  → verify exact expected_cash_in_drawer & discrepancy_amount value
```

### 4.4 RBAC & WebSocket Auth Tests:

```
✓ Request chưa authenticated → 401 (KHÔNG phải 403)
✓ User authenticated nhưng thiếu quyền → 403 (KHÔNG phải 401)
✓ Super Admin bypass tất cả permission checks
✓ MDM lookup accessible cho mọi authenticated user (không cần quyền MDM)
✓ PosSocketGateway Dual-Mode Auth: JWT hợp lệ join 'pos_cashier_room', qrToken hợp lệ chỉ được join 'order_session_{orderId}' (DISCREPANCY-WS-01)
```

### 4.5 MDM Tests:

```
✓ findOrCreate: trả về record hiện có (và cập nhật metadata nếu có) khi category + normalized_name match
✓ findOrCreate: tạo record mới khi không match
✓ Vietnamese diacritics removal: "Bún bò Huế" → "bun bo hue", "Đá bi" → "da bi"
✓ trim() loại bỏ whitespace đầu/cuối và toTitleCase() chuẩn hoá chữ hoa đầu từ
```

### 4.6 HR & Schedule Tests:

```
✓ Short name: "Nguyễn Văn Anh" → "V.Anh"
✓ Short name collision: "V.Anh" trùng → "N.V.Anh (#12)"
✓ Soft-deleted employee không xuất hiện trong danh sách active nhưng hiển thị xám mờ trong lịch tuần mà không crash (EC-HR-02)
✓ Bulk schedule save lưu đủ 7 ngày (day_of_week 0..6)
```

## 5. Mocking Strategy

| Target | Unit Test | Integration Test |
|--------|-----------|------------------|
| Prisma | `jest.mock()` với `@prisma/client` | Real test database |
| Socket.io | Mock gateway emit calls | Real WebSocket connections |
| VietQR | **ALWAYS** mock | **ALWAYS** mock |
| JWT | Provide test tokens | Real JWT middleware |

- Integration tests: chạy migration trước test suite, truncate tables giữa các tests.
- Test database: dùng schema riêng hoặc separate PostgreSQL database.

## 6. Pre-Completion Checklist

**TRƯỚC KHI** đánh dấu bất kỳ story nào là hoàn thành, Agent **MUST** chạy:

```bash
# 1. Zero type errors
pnpm -r typecheck

# 2. All tests pass
pnpm -r test

# 3. Coverage thresholds met
pnpm -r test:coverage

# 4. No placeholder code
grep -r "// TODO\|// FIXME\|// placeholder\|// hack" apps/ packages/ --include="*.ts" --include="*.tsx"
# Expected output: empty (no matches)
```

- Nếu bất kỳ bước nào fail → story **CHƯA** hoàn thành. Fix trước khi báo cáo.
