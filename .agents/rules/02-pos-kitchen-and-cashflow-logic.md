---
trigger: model_decision
description: Core business logic for POS order creation, takeaway numbering, delta kitchen split printing, discounts, and cash-drawer shift settlement.
---

# 02 — POS, Tách Bếp, Giảm giá & Dòng tiền Kết ca (POS, Kitchen Split, Discounts & Cashflow Logic)

> Áp dụng cho: Mọi Agent chỉnh sửa `PosModule`, `MenuModule`, `DiscountsModule`, `PaymentQrModule`, `InventoryModule`, `CashflowModule` và các màn hình POS/QR/Cashflow tương ứng.

---

## 1. Nguồn Tạo Đơn, Đơn Mang về & Redirect QR

| Nguồn | `order_type` | `order_source` | Status khởi tạo | Mô tả |
|-------|-------------|---------------|-----------------|-------|
| A1 | `DINE_IN` | `QR_CODE` | `PENDING` | Khách quét QR tại bàn (`/q/:token`, `/qr/:token`) → bàn chuyển `PENDING` + cảnh báo đa kênh |
| A2 | `TAKEAWAY` | `QR_CODE` | `PENDING` | Khách quét QR Mang về tại quầy → cấp `guestSessionToken` riêng cho phiên khách |
| B | `DINE_IN` | `POS_COUNTER` | `SERVING` | Thu ngân tạo đơn trên bàn trống → bàn chuyển `OCCUPIED` |
| C | `TAKEAWAY` | `POS_COUNTER` | `SERVING` | Thu ngân tạo đơn mang về → cấp `takeaway_number` tự tăng theo ngày |

- `takeaway_number` bắt đầu từ `1`, reset lúc `00:00:00` mỗi ngày theo giờ Việt Nam (`+07:00`), hiển thị `"Mang về #01"`, `"Mang về #02"`...
- Khi `order_type = 'TAKEAWAY'`: `table_id` **MUST** là `NULL`; khi `DINE_IN`: `takeaway_number` **MUST** là `NULL` (Invariant 2).
- **Bảo mật QR (`QrSecurityService`) & Chống IDOR:**
  - `GET /api/v1/public/menu` và `POST /api/v1/public/orders/qr` kiểm tra khoá Wi-Fi IP và/hoặc GPS Geofence nếu bật (`pos:qrSecurity`).
  - Xác thực `activeOrderId` chỉ cho phép nối món vào đúng đơn thuộc bàn hoặc đơn từng chuyển đi từ bàn đó (`EC-POS-01`), chặn cross-table IDOR bằng `403`.
- **Cảnh báo Đa kênh & Tự động huỷ QR (`QrAutoCancelService`, `WebPushService`):**
  - Đơn QR mới/gọi thêm phát Socket.io + Web Push VAPID (`push_subscriptions`) + âm thanh/giọng nói tiếng Việt.
  - Service Worker (`sw.js`) gọi `GET /api/v1/public/orders/qr-pending-check` (chỉ trả `{ stillPending: boolean }`) để không báo lại thông báo cũ khi điện thoại tỉnh giấc sau Android Doze / iOS Low Power.
  - `QrAutoCancelService` quét mỗi 10s để nhắc quá hạn và tự động huỷ đơn QR `PENDING` hoặc món QR add-on `NEW` quá thời gian cấu hình, phát `order:qr_auto_cancelled`.

---

## 2. Delta Split Đa Trạm Bếp & Huỷ/Sửa Món (Hard Invariant 3)

**API:** `POST /api/v1/pos/orders/:id/split-kitchen` (In lại chủ động dùng `POST /api/v1/pos/orders/:id/reprint-kitchen`)

### Thuật toán (Trong `prisma.$transaction()`):
1. Khoá dòng: `SELECT * FROM orders WHERE id = :id FOR UPDATE` (chống Double-Click Race `EC-POS-05`).
2. Lọc các `order_items` có `kitchen_status = 'NEW'`. Nếu rỗng → Commit & trả **HTTP 200 OK** `{ tickets: [], message: "Không có món mới cần tách" }` (Idempotent).
3. Với sản phẩm `station = 'COMBO'`: phân rã qua `combo_items` về đúng trạm vật lý (`BEP_NAU`, `BEP_CHIEN`, `PHA_CHE`, hoặc trạm mở rộng `BEP_*`) — **NEVER** gửi chữ `COMBO` xuống bếp.
4. Tính `batch_no = COALESCE(MAX(batch_no), 0) + 1`.
5. Nếu `order.status === 'PENDING'`: nâng `order.status = 'SERVING'` và `dining_tables.status = 'OCCUPIED'`.
6. Cập nhật `kitchen_status = 'PRINTED'`, gắn `batch_no`, ghi `AuditLog`, và trả về mảng tickets (kèm cờ `isTakeaway` từng món nếu khách gói mang về).

### Quy tắc Huỷ/Sửa Món (`EC-POS-06`):
- **Món còn `NEW` (Nhánh A):** Sửa trực tiếp hoặc xoá cứng (`DELETE FROM order_items`), tính lại tổng qua `recomputeOrderTotals()`, **KHÔNG** in phiếu báo bếp.
- **Món đã `PRINTED` (Nhánh B):** Chuyển `kitchen_status = 'CANCELLED'`, tính lại tổng qua `recomputeOrderTotals()`, tự động sinh **`PHIẾU BÁO HUỶ MÓN`** gửi trạm bếp tương ứng.

---

## 3. Tách bạch Tạm tính (Xoay vòng VietQR) vs Thanh toán / Tách Thanh toán (Hard Invariant 4)

### In tạm tính (`GET/POST /api/v1/pos/orders/:id/provisional-bill` & `POST /api/v1/pos/orders/:id/split-provisional-bill`):
- **MUST** giữ `order.status = 'SERVING'` và bàn `'OCCUPIED'`.
- `PaymentQrService.selectActivePaymentAccountForBill`: duyệt `payment_accounts` (`is_active = TRUE`, `priority ASC, id ASC`), tính doanh thu `PAID` theo Ngày/Tháng/Năm múi giờ `+07:00`, chọn mã đầu tiên thoả `used + billAmount <= limit`. Nếu tất cả vượt hạn mức → fallback về mã ưu tiên cao nhất kèm `qrOverLimit = true` + `AuditLog` (không chặn bán hàng). Không có mã nào bật → `409 PAYMENT_QR_NOT_CONFIGURED`.
- Lưu `orders.payment_account_id` và sinh URL VietQR Napas247 chuẩn số tiền sau giảm giá.

### Thanh toán (`POST /api/v1/pos/orders/:id/checkout` & `POST /api/v1/pos/orders/:id/split-checkout`):
- Dialog xác nhận 2 bước; bọc `$transaction` khoá `orders` → `dining_tables` → `discounts` (`ORDER BY id ASC FOR UPDATE`).
- Enforce `chk_order_payment_amounts`:
  - `CASH`: `cash_amount = total_amount`, `transfer_amount = 0`, `payment_account_id = NULL`.
  - `TRANSFER`: `transfer_amount = total_amount`, `cash_amount = 0`, gắn `payment_account_id` nếu chưa có.
  - `SPLIT`: `cash_amount > 0`, `transfer_amount > 0`, `cash_amount + transfer_amount = total_amount`, gắn `payment_account_id` nếu chưa có.
- `checkout` toàn đơn: chuyển `PAID`, `paid_at = NOW()`, giải phóng bàn (`AVAILABLE`, `active_order_id = NULL`), emit `order:status_updated` + `table:grid_sync`.
- `split-checkout`: tách nhóm món đã chọn thành hoá đơn con `PAID`, giữ đơn gốc `SERVING` và tính lại tổng còn lại.

---

## 4. Table Transfer Actions (`MOVE` / `MERGE` / `SWAP` / `TO_TAKEAWAY` — Hard Invariant 5)

**API:** `POST /api/v1/pos/orders/:id/table-action` (`{ action, targetTableId, reason }`)

- Khoá dòng theo `ORDER BY id ASC FOR UPDATE`: `orders` trước → `dining_tables` sau.
- **`MOVE`:** Bàn đích phải `AVAILABLE` (nếu không → `409 POS_TABLE_NOT_AVAILABLE`). Hỗ trợ cả `DINE_IN → DINE_IN` và `TAKEAWAY → DINE_IN` (gán `is_takeaway = TRUE` trên các món sẵn có).
- **`MERGE`:** Bàn đích phải `OCCUPIED` (nếu không → `409 POS_TABLE_NOT_OCCUPIED`). Hỗ trợ cả `DINE_IN → DINE_IN` và `TAKEAWAY → DINE_IN` (gán `is_takeaway = TRUE`). Giữ nguyên `kitchen_status` của mọi món; gỡ giảm giá đơn nguồn, tính lại tổng đơn đích; đơn nguồn chuyển `MERGED`.
- **`SWAP`:** Chỉ cho 2 đơn `DINE_IN` đang mở (cấm `SWAP` với `TAKEAWAY` → `409 POS_TAKEAWAY_CANNOT_MERGE`).
- **`TO_TAKEAWAY`:** Chuyển đơn `DINE_IN` sang `TAKEAWAY` (giải phóng bàn về `AVAILABLE`, cấp `takeaway_number` mới trong ngày, reset `is_takeaway = FALSE`).
- Nếu có món đã `PRINTED` → `requireKitchenNoticePrint = true` + `kitchenTransferSlip`. Emit `order:session_redirected` + `qr:order_notice` tới khách và `table:grid_sync` tới POS.

---

## 5. Công thức Kết ca, Blind Mode & Bù chênh lệch (Hard Invariant 6)

```
total_cash_sales     = SUM(CASE WHEN payment_method='CASH' THEN total_amount
                                WHEN payment_method='SPLIT' THEN cash_amount ELSE 0 END
                           WHERE status='PAID' AND payment_method IN ('CASH', 'SPLIT'))
total_transfer_sales = SUM(CASE WHEN payment_method='TRANSFER' THEN total_amount
                                WHEN payment_method='SPLIT' THEN transfer_amount ELSE 0 END
                           WHERE status='PAID' AND payment_method IN ('TRANSFER', 'SPLIT'))
total_cash_imports   = SUM(total_cost WHERE payment_source='CASH_DRAWER' AND is_deleted=FALSE)

expected_cash_in_drawer = opening_budget + total_cash_sales - total_cash_imports
discrepancy_amount      = actual_counted_cash - expected_cash_in_drawer
status                  = MATCHED (=0) | SURPLUS (>0) | SHORTAGE (<0)
```

- **FORBIDDEN** cộng `TRANSFER`, `SPLIT.transfer_amount`, `VOIDED`, hoặc trừ phiếu nhập `EXTERNAL` / `is_deleted = TRUE`.
- **Blind Mode (`GET /api/v1/cashflow/preview`):** Với mọi user không phải `isSuperAdmin`, trả `blindMode = true` và ẩn các trường tổng tiền lý thuyết (`null`) để thu ngân đếm thực tế khách quan qua bảng 9 mệnh giá (`500k`..`1k`).
- Khi `discrepancy_amount !== 0`: bắt buộc có `note` giải trình (`chk_settlement_note_required`).
- **Bù chênh lệch (`POST /api/v1/cashflow/settlements/:id/compensate`):** Yêu cầu quyền `cashflow:compensate` + ghi chú tối thiểu 3 ký tự, ghi `AuditLog`.
- **Ngân sách đầu ca (`PUT /api/v1/cashflow/default-budget`):** Yêu cầu quyền `cashflow:config`.

---

## 6. MDM Auto-Save & Chuẩn hoá Chuỗi (Hard Invariant 7)

- `MdmService.findOrCreate(category, rawInput, metadata)` luôn thực hiện `trim()` → `toTitleCase()` → `normalizeVietnameseString()` (NFD bỏ dấu + `đ/Đ -> d` + lowercase) → kiểm tra `UNIQUE(category, normalized_name)` trước khi INSERT.
- 7 danh mục người dùng: `POSITION`, `SPECIALTY`, `INGREDIENT`, `UNIT`, `SUPPLIER`, `MENU_CATEGORY`, `KITCHEN_STATION` (cộng nhóm nội bộ `SYSTEM_CONFIG`).

---

## 7. WebSocket Events Contract (15 Events — Namespace `/pos`)

| Event | Hướng | Room | Khi nào |
|-------|-------|------|---------|
| `order:qr_new` | Server → POS | `pos_cashier_room` | Khách gửi đơn QR mới |
| `order:qr_addon` | Server → POS | `pos_cashier_room` | Khách gọi thêm món QR |
| `order:qr_auto_cancelled` | Server → POS & Khách | `pos_cashier_room`, `order_session_{id}` | `QrAutoCancelService` tự huỷ đơn/món QR quá hạn |
| `order:session_redirected` | Server → Khách | `order_session_{id}` | Thu ngân `MOVE`/`MERGE`/`SWAP`/`TO_TAKEAWAY` |
| `order:status_updated` | Server → Khách | `order_session_{id}` | Duyệt đơn, tách bếp (`SERVING`), thanh toán (`PAID`), huỷ (`VOIDED`) |
| `qr:order_notice` | Server → Khách | `table_session_{id}`, `order_session_{id}` | Thông báo tức thời POS → khách (sửa/huỷ món, giảm giá, tạm tính...) |
| `table:qr_rotated` | Server → Khách | `table_session_{id}`, `order_session_{id}` | Thu ngân xoay mã QR bàn → khoá phiên QR cũ |
| `table:grid_sync` | Server → POS | `pos_cashier_room` | Đồng bộ sơ đồ bàn & danh sách đơn realtime |
| `menu:updated` | Server → Broadcast | Toàn namespace `/pos` | Cập nhật món/giá/tạm hết/trạm/danh mục |
| `schedule:updated` | Server → POS/Staff | `pos_cashier_room` | Lưu hoặc sao chép bảng công tuần |
| `payroll:updated` | Server → POS/Staff | `pos_cashier_room` | Cập nhật cấu hình hoặc bảng lương nhân viên |
| `store-settings:updated` | Server → Broadcast | Toàn namespace `/pos` | Cập nhật `/settings`, ảnh thương hiệu, thông báo hoặc QR Security |
| `session:revoked` | Server → Thiết bị cũ | `user_session_{sessionId}` | Đăng nhập đè / thu hồi phiên / đổi mật khẩu / khoá tài khoản |
| `account:permissions_updated` | Server → User | `user_account_{userId}` | Admin cập nhật phân quyền tài khoản tức thì |
| `account:preferences_updated` | Server → User | `user_account_{userId}` | Đồng bộ `ui_preferences` cá nhân giữa các thiết bị |

---

## 8. Nghiệp vụ Giảm giá trên Đơn POS (Story 18)

- **Tính lại thống nhất (`recomputeOrderTotals(tx, orderId)`):** Mọi biến động món đều tính lại `subtotal_amount`, `discount_amount` (làm tròn xuống bội `1.000đ`, không vượt `eligibleSubtotal`), và `total_amount = subtotal_amount - discount_amount`.
- **Ma trận 2 × 3:** `FIXED` + `ORDER` (1 lần), `FIXED` + `CATEGORY`/`PRODUCT` (trên mỗi suất `value × eligibleQty`), `PERCENT` (trên `eligibleSubtotal`, giới hạn bởi `maxDiscountAmount`).
- **Vòng đời lượt dùng:** Checkout (`PAID`) khoá `orders → dining_tables → discounts` và tăng `used_count` atomic (`WHERE used_count < usage_limit`, 0 dòng → `409 DISCOUNT_USAGE_EXHAUSTED`); `VOID` hoàn trả `used_count = GREATEST(used_count - 1, 0)`.
- **Tương tác Split/Merge:** Đơn đang có giảm giá **MUST** bị chặn khi gọi `split-checkout` / `split-provisional-bill` (`409 POS_DISCOUNT_BLOCKS_SPLIT`); khi `MERGE`, gỡ giảm giá đơn nguồn và tính lại trên đơn đích.
