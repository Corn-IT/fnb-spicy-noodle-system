# Story 18: Quản lý Mã Giảm giá & Giảm giá Trực tiếp trên Hoá đơn POS (`discounts`)

> **Trạng thái:** Đã triển khai (Completed) · **Tiền đề:** Kế thừa nền tảng Story 01–17 và tuân thủ nghiêm ngặt 10 Hard Invariants trong `AGENTS.md`.

---

## 1. Mục tiêu Nghiệp vụ

Bổ sung hệ thống quản lý mã giảm giá linh hoạt ("động") và áp dụng giảm giá trực tiếp trên đơn hàng POS:

1. **Ma trận Giảm giá 2 × 3:** Hỗ trợ 2 kiểu giá trị (`PERCENT` có tuỳ chọn trần tối đa `maxDiscountAmount` và `FIXED`) × 3 phạm vi (`ORDER` toàn đơn, `CATEGORY` theo danh mục món Tầng 2 MDM, `PRODUCT` giảm trực tiếp từng món). Một mã có thể chọn nhiều danh mục hoặc nhiều sản phẩm (`discount_targets`).
2. **Điều kiện linh hoạt:** Từ ngày–đến ngày (`startsAt`–`endsAt`), bật/tắt thủ công (`isActive`), đơn tối thiểu (`minOrderAmount`), giới hạn tổng lượt (`usageLimit`), khung giờ vàng + ngày trong tuần (`timeWindowStart`–`timeWindowEnd`, `activeWeekdays`, đánh giá theo `Asia/Ho_Chi_Minh`).
3. **Giảm giá thủ công trên POS (Giảm tay):** Cho phép giảm `%` (1–100%) hoặc số tiền `FIXED` (≤ tiền món) trên phạm vi `ORDER`, **bắt buộc lý do**, yêu cầu quyền riêng `pos.manualDiscount` (không fallback từ `pos.create`/`pos.update`), ghi Audit Log.
4. **Tính lại tự động & Bất biến hoá đơn:** Tiền giảm làm tròn **xuống bội 1.000đ** (`floor(raw / 1000) * 1000`), không vượt quá `eligibleSubtotal`. `orders.total_amount` luôn là **số thực thu sau giảm** (`subtotal_amount - discount_amount`), giữ nguyên công thức kết ca Invariant 6, `chk_order_payment_amounts`, và VietQR xoay vòng theo số thực thu.

---

## 2. Các Quyết định Nghiệp vụ & Giả định Đã Khoá (D33–D39, A1–A5)

- **D33 — Phạm vi áp dụng & Không cộng dồn:** Chỉ thu ngân/quản lý thao tác trên POS (chọn từ danh sách đang hiệu lực tại thời điểm áp hoặc nhập mã). Khách QR không tự nhập mã ở GĐ1. Tối đa **1 mã hoặc 1 giảm tay/đơn** — áp mã mới sẽ thay thế mã cũ.
- **D34 — Ngữ nghĩa Giá trị:**
  - `FIXED` + `ORDER`: giảm cố định 1 lần trên tổng đơn.
  - `FIXED` + `CATEGORY` / `PRODUCT`: giảm trực tiếp **trên mỗi suất** (`value × eligibleQty`).
  - `PERCENT`: tính `%` trên `eligibleSubtotal`; nếu có `maxDiscountAmount` thì trần áp cho **tổng tiền giảm** của cả đơn.
  - Món `station = 'COMBO'` khớp theo `productId` và `categoryId` của chính món combo đó.
  - Cơ sở tính là `order_items.unit_price` (đã bao gồm extra price topping/modifier).
- **D35 — Vòng đời Kiểm tra Điều kiện & Trừ lượt:**
  - Lúc **áp mã** (trên đơn `SERVING`): kiểm tra `isActive`, `!isArchived`, `startsAt`/`endsAt`, `timeWindow`, `activeWeekdays`, `usedCount < usageLimit`, `minOrderAmount`, và có món hợp lệ. Lưu bất biến vào `orders.discount_snapshot`.
  - Khi **thêm/sửa/huỷ món**: chỉ cần hàm `recomputeOrderTotals(tx, orderId)` đọc lại `discount_snapshot` để tính lại `subtotal_amount`, `discount_amount`, `total_amount` (không bị ảnh hưởng nếu mã vừa hết giờ khuyến mãi hoặc vừa bị sửa sau đó).
  - **A1 (Huỷ món làm rớt điều kiện):** Nếu sau khi huỷ/sửa món mà đơn tụt dưới `minOrderAmount` hoặc không còn món khớp phạm vi → mã vẫn gắn trên đơn, `discount_amount = 0`, kèm cảnh báo vàng (`MIN_ORDER_NOT_MET` / `NOT_APPLICABLE`). Thanh toán khi `discount_amount = 0` thì **không trừ lượt**.
  - Lúc **checkout (`PAID`)**: khoá dòng `orders -> dining_tables -> discounts` (`FOR UPDATE`), kiểm tra lại `usageLimit` (atomic SQL `used_count = used_count + 1 ... WHERE used_count < usage_limit`, 0 rows → `409 DISCOUNT_USAGE_EXHAUSTED`) và `minOrderAmount` nếu có giảm (`> 0`).
  - Lúc **VOID hoá đơn (`PAID -> VOIDED`)**: khoá `orders -> discounts`, giảm `used_count = GREATEST(used_count - 1, 0)` nếu đơn có `discount_id` và `discount_amount > 0`.
- **D36 — Tương tác Nghiệp vụ POS:**
  - Đơn đã gắn giảm giá (`discount_snapshot IS NOT NULL`): **CHẶN** `split-checkout` và `split-provisional-bill` (`409 POS_DISCOUNT_BLOCKS_SPLIT`). Muốn tách phải gỡ mã trước.
  - `MERGE` bàn: đơn nguồn tự động bị **gỡ giảm giá** (UI hiển thị cảnh báo xác nhận trước khi gộp); đơn đích giữ nguyên giảm giá của mình và gọi `recomputeOrderTotals` sau khi nhận toàn bộ món.
  - `MOVE` / `SWAP`: giảm giá đi theo đơn hàng.
  - Sau khi `PAID`: **không sửa** giảm giá (muốn điều chỉnh phải `VOID`).
- **D37 — Chính sách Sửa/Xoá Mã Giảm giá:**
  - Code lưu `UPPERCASE`, regex `^[A-Z0-9_-]{3,32}$`, unique (A2).
  - Khi `usedCount > 0`: **chặn sửa** `code`, `valueType`, `value`, `maxDiscountAmount`, `scope`, `targetCategoryIds`, `targetProductIds`, `minOrderAmount` (`409 DISCOUNT_LOCKED_FIELDS`); chỉ cho sửa `name`, `startsAt`, `endsAt`, `activeWeekdays`, `timeWindowStart`, `timeWindowEnd`, `usageLimit` (phải ≥ `usedCount`), `isActive`.
  - Khi `usedCount > 0`: `DELETE /api/v1/discounts/:id` chuyển thành lưu trữ (`isArchived = true, isActive = false`) thay vì xoá cứng.
- **D38 — Phiếu in Nhiệt 80mm & A5:** Cả `ProvisionalVietQrSlip` và `OfficialReceiptSlip` tự động render 3 dòng `TỔNG CỘNG TIỀN MÓN`, `GIẢM GIÁ (<Tên/Mã>)`, `TỔNG THANH TOÁN` khi `discountAmount > 0`. Cờ `blocks.discountLine` (Story 16) được giữ trong schema để tương thích ngược nhưng bị bỏ qua để không ẩn mất số liệu giảm giá thật.
- **D39 — Phân quyền RBAC:**
  - Module mới `discounts`: `{ view, create, update, delete }`.
  - Sub-permission mới trong `pos`: `manualDiscount` (**strict**, không fallback từ `pos.create`/`pos.update`).
  - Áp/gỡ mã có sẵn trên POS dùng quyền `pos.checkout`.

---

## 3. Hợp đồng Dữ liệu & API

### Database (`discounts`, `discount_targets`, mở rộng `orders`)
- Bảng `discounts`: `id`, `code`, `name`, `value_type`, `value`, `max_discount_amount`, `scope`, `min_order_amount`, `starts_at`, `ends_at`, `active_weekdays` (JSONB), `time_window_start`, `time_window_end`, `usage_limit`, `used_count`, `is_active`, `is_archived`, `created_by`, `created_at`, `updated_at`.
- Bảng `discount_targets`: `id`, `discount_id`, `category_id` (→ `master_data`), `product_id` (→ `products`).
- Mở rộng `orders`: `subtotal_amount`, `discount_amount`, `discount_id` (FK → `discounts`), `discount_snapshot` (JSONB).
- Backfill: `UPDATE orders SET subtotal_amount = total_amount, discount_amount = 0`.
- CHECK constraints: `chk_order_discount_amounts`, `chk_discount_value`, `chk_discount_usage`, `chk_discount_target_one`.

### Endpoints
- `GET /api/v1/discounts` (`discounts.view`) — Danh sách kèm thống kê (`usedCount`, `remaining`, `totalDiscounted`).
- `POST /api/v1/discounts` (`discounts.create`) — Tạo mã.
- `PUT /api/v1/discounts/:id` (`discounts.update`) — Cập nhật mã (khoá trường giá trị/phạm vi khi `usedCount > 0`).
- `PATCH /api/v1/discounts/:id/status` (`discounts.update`) — Bật/tắt `isActive`.
- `DELETE /api/v1/discounts/:id` (`discounts.delete`) — Xoá cứng nếu `usedCount === 0`, lưu trữ nếu `usedCount > 0`.
- `GET /api/v1/pos/orders/:id/applicable-discounts` (`pos.checkout`) — Danh sách mã đang hiệu lực + số tiền giảm dự kiến cho đơn hiện tại.
- `POST /api/v1/pos/orders/:id/discount` (`pos.checkout` + `pos.manualDiscount` nếu manual) — Áp mã / giảm tay.
- `DELETE /api/v1/pos/orders/:id/discount` (`pos.checkout`) — Gỡ giảm giá khỏi đơn.

---

## 4. Tiêu chí Nghiệm thu (Acceptance Criteria)

- **AC-18.1**: Thuật toán `calculateOrderDiscount` trong `@fnb/shared` pass 100% unit test cho ma trận 2×3, trần `%`, làm tròn xuống bội 1.000đ, giới hạn không vượt tiền món hợp lệ, COMBO, điều kiện tối thiểu, và cảnh báo A1.
- **AC-18.2**: Migration PostgreSQL tạo sạch bảng `discounts`, `discount_targets`, các cột mới trên `orders`, 4 CHECK constraints, và backfill toàn bộ đơn cũ không lỗi; vi phạm CHECK bị DB từ chối.
- **AC-18.3**: API `/api/v1/discounts` đáp ứng CRUD, lock trường sau khi đã phát sinh lượt dùng, archive khi xoá mã đã dùng, thống kê `totalDiscounted`, và thực thi RBAC 401/403 đúng Hard Invariant 8.
- **AC-18.4**: Trên POS, `recomputeOrderTotals` được dùng thống nhất mọi điểm biến động món; áp/gỡ giảm giá cập nhật VietQR tạm tính & đồng bộ `table:grid_sync`; Checkout cộng `used_count` an toàn trước race condition; Void hoàn `used_count`; Split bị chặn `409 POS_DISCOUNT_BLOCKS_SPLIT`; Merge gỡ giảm giá nguồn và tính lại đơn đích.
- **AC-18.5**: Trang `/discounts` dùng `BaseTable` + Drawer tạo/sửa; Popup giảm giá trên POS hỗ trợ chọn mã, gõ mã, giảm tay (ẩn nếu thiếu quyền), cảnh báo A1/Merge; Phiếu tạm tính & Hoá đơn 80mm in đúng 3 dòng; `/invoices` hiển thị & lọc theo mã giảm giá; RBAC quản lý được `discounts.*` & `pos.manualDiscount`.
