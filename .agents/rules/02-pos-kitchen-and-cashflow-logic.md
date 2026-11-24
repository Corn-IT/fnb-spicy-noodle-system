# 02 — POS, Tách Bếp & Dòng tiền Kết ca (POS, Kitchen Split & Cashflow Logic)

> Áp dụng cho: Codex (Phase 4B), Antigravity (Phase 5). Đây là file rules nghiệp vụ quan trọng nhất.

---

## 1. Ba Nguồn Tạo Đơn trên Màn hình POS Hợp nhất

| Nguồn | order_type | order_source | Status khởi tạo | Mô tả |
|-------|-----------|-------------|-----------------|-------|
| A | `DINE_IN` | `QR_CODE` | `PENDING` | Khách quét QR tại bàn → bàn chuyển màu Cam nhấp nháy + chuông báo thu ngân duyệt |
| B | `DINE_IN` | `POS_COUNTER` | `SERVING` | Thu ngân chọn bàn trống, bấm tạo đơn → bàn chuyển sang `OCCUPIED` |
| C | `TAKEAWAY` | `POS_COUNTER` | `SERVING` | Thu ngân bấm `[+ TẠO ĐƠN MANG VỀ]` → auto-generate `takeaway_number` |

- `takeaway_number` **MUST** bắt đầu từ 1 và tự động reset về 1 vào 00:00:00 đầu mỗi ngày kinh doanh.
- Format hiển thị: `"Mang về #01"`, `"Mang về #02"`...
- Khi `order_type = 'TAKEAWAY'`: `table_id` **MUST** là `NULL` (Không tạo bản ghi bàn `"Mang về"` trong `dining_tables`).
- Khi `order_type = 'DINE_IN'`: `takeaway_number` **MUST** là `NULL`.
- **Tự động điều hướng phiên gọi thêm món từ tab QR cũ (`EC-POS-01`):** Khi khách gửi `POST /api/v1/public/orders/qr` kèm `activeOrderId`:
  - Nếu đơn `activeOrderId` đã được `MOVE` sang bàn mới (`status = 'SERVING'`, `table_id = newTableId`), hệ thống tự động nối `order_items` mới vào đơn đó tại bàn mới.
  - Nếu đơn `activeOrderId` đã được `MERGE` vào đơn đích (`status = 'MERGED'`, `merged_into_order_id = targetOrderId`), hệ thống tự động nối `order_items` mới vào `targetOrderId` tại bàn đích. Tuyệt đối không tạo đơn mới ở bàn cũ trên URL.

## 2. Delta Split 3 Khu vực Bếp & Huỷ/Sửa Món

**API:** `POST /api/v1/pos/orders/:id/split-kitchen`

### Thuật toán (Trong `prisma.$transaction()`):
1. Khoá dòng: `SELECT * FROM orders WHERE id = :id FOR UPDATE` (chống Double-Click Race `EC-POS-05`).
2. Query: `SELECT * FROM order_items WHERE order_id = :id AND kitchen_status = 'NEW'`.
3. Nếu không có món `'NEW'`: Commit và trả về **HTTP 200 OK** `{ tickets: [], message: "Không có món mới cần tách" }` (Idempotent).
4. Với sản phẩm `station = 'COMBO'`: truy vấn bảng `combo_items` để phân rã thành các sub-items (`child_product_id`, nhân số lượng) và gán mỗi sub-item về đúng station thực (`BEP_NAU`, `BEP_CHIEN`, `PHA_CHE`).
5. Tính `batch_no = COALESCE(MAX(existing batch_no for this order), 0) + 1`.
6. Nếu `order.status === 'PENDING'`: tự động nâng `order.status = 'SERVING'` và cập nhật `dining_tables.status = 'OCCUPIED'`.
7. Cập nhật `kitchen_status`: `'NEW'` → `'PRINTED'` và gán `batch_no` cho tất cả items đã xử lý.
8. Trả về mảng tối đa 3 ticket objects (chỉ tạo phiếu cho trạm có món mới):

```typescript
interface KitchenTicket {
  station: 'BEP_NAU' | 'BEP_CHIEN' | 'PHA_CHE';
  stationTitle: string;    // "BẾP NẤU (MÌ CAY)" | "BẾP CHIÊN" | "QUẦY NƯỚC UỐNG"
  logoType: string;        // "CHEF_HAT_NOODLE" | "FRENCH_FRIES" | "DRINK_CUP"
  items: { name: string; qty: number; modifiers: string[]; note: string; }[];
}
```

### Quy tắc Cứng & Xử lý Huỷ/Sửa Món (`EC-POS-06`):
- **NEVER** in lại items đã ở trạng thái `PRINTED` — chỉ lọc `NEW`.
- Items có `station = 'COMBO'` **MUST** được phân rã — **NEVER** gửi `COMBO` trực tiếp xuống bếp.
- Nếu `batch_no > 1` (gọi thêm): in dòng chữ `"[GỌI THÊM - LƯỢT {batch_no}]"` trên phiếu.
- Nếu đơn vừa chuyển bàn: in dòng `"[GHI CHÚ ĐỔI BÀN: Chuyển từ BÀN 01 sang BÀN 07]"` trên phiếu.
- **Huỷ/Sửa món TRƯỚC khi tách bếp (`kitchen_status = 'NEW'` — Nhánh A):** Cho phép sửa trực tiếp số lượng/cấp độ cay hoặc xoá cứng (`DELETE FROM order_items`), cập nhật lại `orders.total_amount`, **KHÔNG** in phiếu báo bếp.
- **Huỷ/Sửa món SAU khi tách bếp (`kitchen_status = 'PRINTED'` — Nhánh B):** Khi bấm `"Huỷ món bếp"`, chuyển `kitchen_status` sang `'CANCELLED'`, trừ tiền món khỏi `orders.total_amount`, và tự động sinh `"PHIẾU BÁO HUỶ MÓN"` bắn xuống máy in trạm bếp tương ứng.

## 3. Tách bạch Tạm tính vs Thanh toán (CRITICAL — Hard Invariant 4)

### "In tạm tính (Kèm VietQR động & Xoay vòng mã QR tự động)" (`POST /api/v1/pos/orders/:id/provisional-bill` & `POST /api/v1/pos/orders/:id/split-provisional-bill`):
- **MUST** giữ `order.status = 'SERVING'` và bàn `'OCCUPIED'` — **NEVER** chuyển sang `PAID`.
- **Thuật toán chọn mã QR xoay vòng theo hạn mức (`PaymentQrService.selectActivePaymentAccountForBill`):**
  1. Lấy danh sách `payment_accounts` có `is_active = TRUE` sắp xếp theo `priority ASC, id ASC`. Nếu không có mã nào đang bật → trả `409 Conflict` (`PAYMENT_QR_NOT_CONFIGURED`).
  2. Tính doanh thu chuyển khoản đã thu của từng mã theo Ngày / Tháng / Năm lịch Việt Nam (`Asia/Ho_Chi_Minh`, `+07:00`) từ bảng `orders` (`status = 'PAID'`, `payment_method = 'TRANSFER'` lấy `total_amount`, `payment_method = 'SPLIT'` lấy `transfer_amount`).
  3. Kiểm tra trước khi in: chọn mã QR đầu tiên thoả mãn `used + billAmount <= limit` cho cả 3 ngưỡng `daily_limit`, `monthly_limit`, `yearly_limit` (`NULL` = không giới hạn). Nếu mã ưu tiên cao hơn đã chạm hạn mức thì tự động xoay vòng sang mã tiếp theo (`qrRotated = true`, ghi `AuditLog`). Khi bước sang ngày/tháng/năm mới, mã ưu tiên cao tự động được ưu tiên trở lại.
  4. Fallback an toàn: nếu tất cả mã đang bật đều vượt hạn mức với `billAmount` hiện tại, vẫn dùng mã `priority` cao nhất acompañado `qrOverLimit = true` và cảnh báo thu ngân (không chặn bán hàng).
  5. Ghi nhận `orders.payment_account_id = selected.id` khi in tạm tính toàn đơn (lần in sau ghi đè lần in trước). Với in tạm tính tách đơn (`split-provisional-bill`), trả về `paymentAccount.id` để gắn vào đơn con khi `split-checkout`.
- Sinh ảnh VietQR động chuẩn Napas247 nhúng tài khoản `paymentAccount` được chọn, `amount = total_amount`, `addInfo = "TT " + tableCode + " " + order_code`.
- Mục đích: khách kiểm tra món và quét QR trả tiền — KHÔNG phải chốt đơn.

### "Thanh toán → Xác nhận" (`POST /api/v1/pos/orders/:id/checkout`):
- Hiển thị dialog xác nhận 2 bước (`Xác nhận & In hoá đơn` / `Xác nhận & Không in` / `Huỷ bỏ`) — chống bấm nhầm.
- Khi xác nhận (bọc trong `$transaction` với `FOR UPDATE` trên `orders` rồi `dining_tables`):
  1. Cập nhật `status` → `'PAID'`, ghi `paid_at = NOW()`.
  2. Ghi `payment_method` và số tiền tuân thủ nghiêm ngặt CHECK constraint `chk_order_payment_amounts`:
     - `'CASH'`: `cash_amount = total_amount`, `transfer_amount = 0`, và đặt `payment_account_id = NULL`.
     - `'TRANSFER'`: `transfer_amount = total_amount`, `cash_amount = 0`. Nếu `payment_account_id IS NULL` (chưa in tạm tính mà thanh toán thẳng), tự động chọn và gắn mã QR đang active theo hạn mức.
     - `'SPLIT'` (`EC-FIN-02`): `cash_amount > 0`, `transfer_amount > 0`, và `cash_amount + transfer_amount === total_amount`. Nếu `payment_account_id IS NULL`, tự động chọn và gắn mã QR đang active theo `transfer_amount`.
  3. Giải phóng bàn (nếu `DINE_IN`): `dining_tables.status = 'AVAILABLE'`, `active_order_id = NULL`.
  4. Emit Socket.io: `order:status_updated` (tới `order_session_{orderId}`) và `table:grid_sync` (tới `pos_cashier_room`).

## 4. Table Transfer Actions (MOVE / MERGE / SWAP / TO_TAKEAWAY — Hard Invariant 5)

**API:** `POST /api/v1/pos/orders/:id/table-action`

```typescript
interface TableActionRequest {
  action: 'MOVE' | 'MERGE' | 'SWAP' | 'TO_TAKEAWAY';
  targetTableId: number | null;
  reason: string;
}
```

**MUST** bọc trong `prisma.$transaction()` với thứ tự khoá dòng chống AB-BA Deadlock:
1. Khoá các bản ghi `orders` liên quan theo `ORDER BY id ASC FOR UPDATE`.
2. Khoá các bản ghi `dining_tables` liên quan theo `ORDER BY id ASC FOR UPDATE`.

### MOVE (Chuyển sang bàn trống — hỗ trợ cả `DINE_IN` và `TAKEAWAY` → `DINE_IN`):
- Precondition: bàn đích **MUST** là `AVAILABLE` (nếu `OCCUPIED` → trả `409 Conflict` `POS_TABLE_NOT_AVAILABLE`).
- Steps:
  - Nếu đơn nguồn là `DINE_IN`: cập nhật `order.table_id` → `targetTableId`, bàn nguồn → `AVAILABLE` (`active_order_id = NULL`), bàn đích → `OCCUPIED` (`active_order_id = order.id`).
  - Nếu đơn nguồn là `TAKEAWAY` (`EC-POS-03`): cập nhật `order_type = 'DINE_IN'`, `table_id = targetTableId`, `takeaway_number = NULL`, đánh dấu các món hiện có `is_takeaway = TRUE`, bàn đích → `OCCUPIED` (hoặc `PENDING` nếu đơn đang `PENDING`).
- Ghi log vào `order.table_transfer_logs`.
- Nếu đơn có ít nhất 1 món `kitchen_status = 'PRINTED'` → `requireKitchenNoticePrint = true`, sinh `kitchenTransferSlip` để máy in nhiệt in ngay `"PHIẾU THÔNG BÁO CHUYỂN BÀN"` (`EC-POS-04`).

### MERGE (Gộp vào bàn đang ăn — hỗ trợ cả `DINE_IN` và `TAKEAWAY` → `DINE_IN`):
- Precondition: bàn đích **MUST** là `OCCUPIED` (nếu `AVAILABLE` → trả `409 Conflict` `POS_TABLE_NOT_OCCUPIED`).
- Steps: chuyển **TẤT CẢ** `order_items` từ đơn nguồn → đơn đích (`UPDATE order_items SET order_id = targetOrderId`, giữ nguyên `kitchen_status`; nếu đơn nguồn là `TAKEAWAY` thì đặt `is_takeaway = TRUE` cho các món chuyển sang), tính lại `total_amount` đơn đích, đơn nguồn → `status = 'MERGED'`, `merged_into_order_id = targetOrderId`, `total_amount = 0`, giải phóng bàn nguồn (nếu có) về `AVAILABLE` (`active_order_id = NULL`).
- Nếu có món `PRINTED` → `requireKitchenNoticePrint = true`, sinh `kitchenTransferSlip`.

### SWAP (Hoán đổi 2 bàn):
- Precondition: cả 2 đơn đều là `DINE_IN` và cả 2 bàn **MUST** đang `OCCUPIED` có đơn đang mở.
- Steps: hoán đổi `table_id` giữa 2 đơn, hoán đổi `active_order_id` trên `dining_tables`.
- Ghi log vào **CẢ HAI** đơn và sinh `kitchenTransferSlip` nếu có món `PRINTED`.

### TO_TAKEAWAY (Chuyển đơn Tại bàn sang Mang về — `EC-POS-03`):
- Precondition: đơn nguồn là `DINE_IN` (`targetTableId = null`).
- Steps: giải phóng bàn nguồn về `AVAILABLE` (`active_order_id = NULL`), cấp số `takeaway_number` mới trong ngày (`MAX(takeaway_number) + 1`), cập nhật `order_type = 'TAKEAWAY'`, `table_id = NULL`, reset `is_takeaway = FALSE` trên các món của đơn.
- Ghi log vào `order.table_transfer_logs` và sinh `kitchenTransferSlip` (`Bàn XX → Mang về #YY`) nếu có món `PRINTED`.

### WebSocket khi Transfer:
- Emit `order:session_redirected` tới room `order_session_{orderId}`:
```json
{
  "previousOrderId": 538,
  "newActiveOrderId": 540,
  "previousTableLabel": "Bàn 01",
  "newTableId": 7,
  "newTableLabel": "Bàn 07",
  "message": "Đơn hàng của bạn đã được chuyển sang Bàn 07."
}
```
- Đảm bảo điện thoại khách (đang mở tab QR cũ) tự redirect sang đơn/bàn mới **mà không cần quét lại QR**.

## 5. Công thức Kết ca (Cashflow Settlement — Module 4, Hard Invariant 6)

> ⚠️ Đây là GAP nghiêm trọng nhất được phát hiện trong review thiết kế. **MUST** implement đúng 100%, bao gồm cả xử lý đơn thanh toán hỗn hợp (`SPLIT` — `EC-FIN-02`) và loại trừ đơn đã huỷ (`VOIDED` — `EC-FIN-01`).

```
total_cash_sales = SUM(
  CASE
    WHEN orders.payment_method = 'CASH' THEN orders.total_amount
    WHEN orders.payment_method = 'SPLIT' THEN orders.cash_amount
    ELSE 0
  END
  WHERE orders.status = 'PAID'
    AND orders.payment_method IN ('CASH', 'SPLIT')
    AND orders.paid_at WITHIN shift
)

total_transfer_sales = SUM(
  CASE
    WHEN orders.payment_method = 'TRANSFER' THEN orders.total_amount
    WHEN orders.payment_method = 'SPLIT' THEN orders.transfer_amount
    ELSE 0
  END
  WHERE orders.status = 'PAID'
    AND orders.payment_method IN ('TRANSFER', 'SPLIT')
    AND orders.paid_at WITHIN shift
)

total_cash_imports = SUM(
  inventory_imports.total_cost
  WHERE inventory_imports.payment_source = 'CASH_DRAWER'
    AND inventory_imports.import_date WITHIN shift
    AND inventory_imports.is_deleted = FALSE
)

expected_cash_in_drawer = opening_budget + total_cash_sales - total_cash_imports

discrepancy_amount = actual_counted_cash - expected_cash_in_drawer

status = CASE
  WHEN discrepancy_amount = 0 THEN 'MATCHED'
  WHEN discrepancy_amount > 0 THEN 'SURPLUS'
  ELSE 'SHORTAGE'
END
```

### Quy tắc Cứng:
- **FORBIDDEN** cộng doanh thu chuyển khoản (`TRANSFER` hoặc `transfer_amount` của đơn `SPLIT`) vào `expected_cash_in_drawer` (tiền chuyển khoản nằm trong tài khoản ngân hàng, KHÔNG nằm trong két vật lý).
- **FORBIDDEN** cộng các hoá đơn có `status = 'VOIDED'` (đã huỷ bởi Quản lý/Admin qua `POST /api/v1/invoices/:id/void`).
- **FORBIDDEN** trừ phiếu nhập `EXTERNAL` khỏi tiền két (những khoản này thanh toán bên ngoài quầy).
- `opening_budget` mặc định cấu hình bởi Admin qua `PUT /api/v1/cashflow/default-budget` (quyền `cashflow:config`).
- UI đếm tiền: lưới nút mệnh giá (`500k, 200k, 100k, 50k, 20k, 10k, 5k, 2k, 1k`) × ô nhập số tờ → lưu vào `denominations_detail` JSONB.
- Khi `discrepancy_amount !== 0` (`SURPLUS` hoặc `SHORTAGE`): **MUST** yêu cầu thu ngân nhập trường `note` (ghi chú giải trình chênh lệch — `EC-FIN-03`).
- Bàn giao cuối ca: hiển thị rõ số tiền giữ lại két (`opening_budget`) và số tiền mặt rút ra nộp cho Chủ quán (`actual_counted_cash - opening_budget`).

## 6. MDM Auto-Save & Chuẩn hoá Chuỗi (Module 3, 5, 7 — Hard Invariant 7)

### `MdmService.findOrCreate(category: string, rawInput: string, metadata?: Record<string, unknown>)`:
```typescript
async findOrCreate(category: string, rawInput: string, metadata: Record<string, unknown> = {}) {
  const trimmed = rawInput.trim();
  if (!trimmed) throw new BadRequestException('Tên danh mục không được để trống');

  const titleCased = toTitleCase(trimmed);
  const normalized = normalizeVietnameseString(trimmed);

  const existing = await this.prisma.masterData.findFirst({
    where: { category, normalized_name: normalized, is_active: true },
  });
  if (existing) {
    if (Object.keys(metadata).length > 0) {
      return this.prisma.masterData.update({
        where: { id: existing.id },
        data: { metadata: { ...(existing.metadata as object), ...metadata } },
      });
    }
    return existing;
  }

  return this.prisma.masterData.create({
    data: { category, name: titleCased, normalized_name: normalized, metadata, is_active: true },
  });
}
```

### Vietnamese Diacritics Removal:
- `á à ả ã ạ ă ắ ằ ẳ ẵ ặ â ấ ầ ẩ ẫ ậ` → `a`
- `é è ẻ ẽ ẹ ê ế ề ể ễ ệ` → `e`
- `í ì ỉ ĩ ị` → `i`
- `ó ò ỏ õ ọ ô ố ồ ổ ỗ ộ ơ ớ ờ ở ỡ ợ` → `o`
- `ú ù ủ ũ ụ ư ứ ừ ử ữ ự` → `u`
- `ý ỳ ỷ ỹ ỵ` → `y`
- `đ` → `d`

### Contexts sử dụng:
- Module 3: tên nguyên liệu nhập hàng (Drawer Combobox autocomplete)
- Module 5: chức vụ, chuyên môn nhân viên
- Module 7: quản trị trực tiếp danh mục MDM

## 7. WebSocket Events Contract

| Event | Hướng | Room | Khi nào |
|-------|-------|------|---------|
| `order:qr_new` | Server → Thu ngân | `pos_cashier_room` | Khách quét QR lần đầu → chuông + bàn nhấp nháy cam |
| `order:qr_addon` | Server → Thu ngân | `pos_cashier_room` | Khách gọi thêm món (Lượt 2+) |
| `order:session_redirected` | Server → Khách | `order_session_{orderId}` | Thu ngân chuyển/gộp bàn |
| `order:status_updated` | Server → Khách | `order_session_{orderId}` | Tách đơn (SERVING) hoặc Thanh toán (PAID) |
| `table:grid_sync` | Server → Thu ngân | `pos_cashier_room` | Đồng bộ sơ đồ bàn (multi-tab) |

## 8. Nghiệp vụ Giảm giá trên Đơn POS (Story 18)

- **Tính lại thống nhất (`recomputeOrderTotals(tx, orderId)`):** Mọi biến động món (`createOrder`, `createQrOrder`, `patchOrderItems`, `appendItems`, `cancelOrder`, `approveQrOrder`, `MERGE`, phần còn lại của `splitCheckout`) **MUST** tính lại `subtotal_amount`, `discount_amount`, và `total_amount = subtotal_amount - discount_amount` thông qua một hàm duy nhất dựa trên `orders.discount_snapshot`.
- **Làm tròn & Trần:** Cơ sở tính là `order_items.unit_price` (đã gồm modifier/topping) của các món không `CANCELLED`. Tiền giảm làm tròn **xuống bội 1.000đ** (`floor(raw / 1000) * 1000`) và **NEVER** vượt quá `eligibleSubtotal`. `orders.total_amount` luôn là **số thực thu sau giảm** → giữ nguyên toàn bộ công thức kết ca (Invariant 6) và kiểm tra `chk_order_payment_amounts`.
- **Ma trận 2 × 3 & Ngữ nghĩa:**
  - `FIXED` + `ORDER`: giảm cố định 1 lần.
  - `FIXED` + `CATEGORY` / `PRODUCT`: giảm **trên mỗi suất** (`value × eligibleQty`).
  - `PERCENT`: tính theo `%` trên `eligibleSubtotal`, giới hạn tối đa bởi `maxDiscountAmount` (trần cho tổng tiền giảm cả đơn) nếu có.
  - `COMBO`: khớp theo `productId` / `categoryId` của chính món combo đó.
- **Vòng đời & Điều kiện:**
  - Thời hạn ngày (`startsAt`/`endsAt`), khung giờ & ngày trong tuần (`Asia/Ho_Chi_Minh`) kiểm tra tại **lúc áp mã**.
  - Khi thêm/huỷ món làm đơn rớt dưới `minOrderAmount` hoặc 0 món hợp lệ: giữ nguyên `discount_snapshot`, gán `discount_amount = 0` và trả cảnh báo (`MIN_ORDER_NOT_MET` / `NOT_APPLICABLE`). Checkout với `discount_amount = 0` **KHÔNG** trừ `used_count`.
  - Lúc `checkout` (`PAID`): khoá `orders -> dining_tables -> discounts` (`FOR UPDATE`), cộng `used_count` bằng câu lệnh atomic `WHERE used_count < usage_limit` (0 dòng → `409 DISCOUNT_USAGE_EXHAUSTED`).
  - Lúc `VOID`: khoá `orders -> discounts`, hoàn trả `used_count = GREATEST(used_count - 1, 0)` nếu đơn từng được giảm (`discount_amount > 0` và `discount_id IS NOT NULL`).
- **Tương tác Split / Merge / Move / Swap:**
  - **Split:** Đơn đang có giảm giá (`discount_snapshot IS NOT NULL`) **MUST** bị chặn khi gọi `split-checkout` và `split-provisional-bill` với `409 POS_DISCOUNT_BLOCKS_SPLIT`.
  - **MERGE:** Gỡ bỏ giảm giá của đơn nguồn (`discount_id = NULL, discount_snapshot = NULL, discount_amount = 0`), giữ nguyên giảm giá của đơn đích và tính lại tổng sau khi gộp món.
  - **MOVE / SWAP:** Giảm giá đi theo đơn hàng.
