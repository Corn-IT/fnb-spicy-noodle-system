# Story 04: Xây dựng `MenuModule`, `PosSocketGateway` (Dual-Mode Auth) & `PosModule` Core (3 Nguồn Tạo Đơn, Tạm tính VietQR & Thanh toán)

> **Story ID:** `STORY-04`  
> **Tên file:** `docs/stories/story-04-menu-tables-and-pos-core-backend.md`  
> **Phase thực thi:** Phase 4B (Backend Menu, WebSocket & POS Core)  
> **Agent phụ trách:** Codex  
> **Phụ thuộc (Dependencies):** `story-01`, `story-02`, `story-03`  
> **Quy tắc bất biến áp dụng:** Hard Invariant 2 (TAKEAWAY `table_id = NULL`, `takeaway_number` tự tăng reset theo ngày), Hard Invariant 4 (Tách bạch Tạm tính giữ `SERVING` vs Thanh toán đóng `PAID`), Hard Invariant 5 (Khoá dòng `SELECT ... FOR UPDATE`), Hard Invariant 6 (`chk_order_payment_amounts`), Hard Invariant 10 (`Decimal(12, 2)`)  
> **Tài liệu tham chiếu:** `docs/bmad/01-PRD-Master.md` (§3.1, §3.2, §3.3), `docs/bmad/03-Edge-Cases-And-Invariants.md` (`EC-POS-01`, `EC-POS-06`, `EC-FIN-01`, `EC-FIN-02`), `docs/architecture/02-verified-state-machines.mmd`, `docs/architecture/03-verified-sequences.mmd` (`SEQ-01`, `SEQ-02`), `docs/architecture/04-audit-report.md` (`DISCREPANCY-WS-01`, `DISCREPANCY-FIN-01`)

---

## 1. MỤC TIÊU (OBJECTIVES)

Hiện thực hoá:
1. **`MenuModule` (Module 0):** Quản lý Thực đơn (`products`, `combo_items`, `modifier_groups`, `modifiers`), danh sách bàn (`dining_tables`), và API Public Menu cho khách quét QR tại bàn (`GET /api/v1/public/menu?token=...`).
2. **`PosSocketGateway` (`/pos`):** Gateway thời gian thực duy nhất của hệ thống với cơ chế **Xác thực Hai Chế độ (Dual-Mode Socket Authentication — `DISCREPANCY-WS-01`)** hỗ trợ đồng thời Thu ngân (JWT) và Khách quét QR tại bàn (`qrToken` + `orderId`).
3. **`PosModule` Core (Module 1 & Module 2):** Tiếp nhận 3 nguồn tạo đơn hợp nhất (Khách quét QR `PENDING`, Thu ngân bấm bàn `SERVING`, Đơn mang về `TAKEAWAY` tự cấp `takeaway_number` reset hàng ngày), tự động điều hướng món gọi thêm từ tab QR cũ khi bàn đã chuyển/gộp (`EC-POS-01`), thêm/sửa/huỷ món trước và sau khi tách bếp (`EC-POS-06`), xuất Phiếu tạm tính kèm mã VietQR động giữ nguyên `SERVING` (Hard Invariant 4), chốt Thanh toán 2 bước (`CASH` / `TRANSFER` / `SPLIT` — Hard Invariant 4 & 6), và tra cứu/huỷ Hoá đơn ngoại lệ (`VOIDED` — Module 2 `EC-FIN-01`).

---

## 2. DANH SÁCH FILE CHECKLIST (FILE MANIFEST & CHECKLIST)

### 2.1. Socket.io Gateway (`apps/api-server/src/gateways/`)
- [x] `apps/api-server/src/gateways/pos-socket.gateway.ts` — Namespace `/pos`, thực thi Dual-Mode Auth trong `handleConnection()` và cung cấp các hàm phát sự kiện:
  - `emitQrNewOrder(payload)` → room `pos_cashier_room` (`order:qr_new`) & `table:grid_sync`.
  - `emitQrAddonOrder(payload)` → room `pos_cashier_room` (`order:qr_addon`) & `table:grid_sync`.
  - `emitOrderStatusUpdated(orderId, payload)` → room `order_session_${orderId}` (`order:status_updated`).
  - `emitOrderSessionRedirected(previousOrderId, payload)` → room `order_session_${previousOrderId}` (`order:session_redirected`).
  - `emitTableGridSync(payload)` → room `pos_cashier_room` (`table:grid_sync`).

### 2.2. Module Menu & Bàn ăn (`apps/api-server/src/modules/menu/`)
- [x] `apps/api-server/src/modules/menu/menu.module.ts`
- [x] `apps/api-server/src/modules/menu/menu.controller.ts`:
  - `GET /api/v1/public/menu?token=:qrToken` — Public endpoint: xác thực `qr_token` trong `dining_tables` (nếu sai trả `404`), trả về thông tin bàn (`tableId`, `tableName`, `status`, `activeOrderId`) và danh sách `products` (`is_available = true`) kèm `modifier_groups`, `modifiers`, `combo_items`.
  - `GET /api/v1/menu/products` — `@RequirePermission('pos', 'view')`: Lấy toàn bộ danh sách sản phẩm, combo, modifiers cho POS và màn hình cấu hình.
  - `POST /api/v1/menu/products` & `PUT /api/v1/menu/products/:id` — `@RequirePermission('pos', 'update')`: Tạo/cập nhật món ăn, cấu hình `combo_items` (kiểm tra chống tự tham chiếu `parent_product_id !== child_product_id`), `modifier_groups` và `modifiers`.
- [x] `apps/api-server/src/modules/menu/menu.service.ts`
- [x] DTO hợp đồng dùng từ `@fnb/shared` để tránh định nghĩa trùng trong module.

### 2.3. Module POS Core & Quản lý Hoá đơn (`apps/api-server/src/modules/pos/`)
- [x] `apps/api-server/src/modules/pos/pos.module.ts`
- [x] `apps/api-server/src/modules/pos/pos.controller.ts` — Các endpoints nghiệp vụ POS & QR:
  - `GET /api/v1/pos/tables` — `@RequirePermission('pos', 'view')`: Trả về danh sách 30 bàn vật lý kèm thông tin đơn đang mở (`active_order_id`) VÀ danh sách các đơn `TAKEAWAY` đang phục vụ (`status = 'SERVING'`).
  - `POST /api/v1/public/orders/qr` — Public (kèm `qrToken` hợp lệ): Khách đặt món lần đầu hoặc gọi thêm món (`EC-POS-01`).
  - `POST /api/v1/pos/orders` — `@RequirePermission('pos', 'create')`: Thu ngân tạo đơn `DINE_IN` hoặc `TAKEAWAY` tại quầy.
  - `GET /api/v1/pos/orders/:id` — `@RequirePermission('pos', 'view')`: Xem chi tiết đơn hàng trực tiếp trên Live Invoice (nhóm theo `batch_no`).
  - `POST /api/v1/pos/orders/:id/approve` — `@RequirePermission('pos', 'update')`: Thu ngân duyệt đơn QR từ `PENDING` → `SERVING` (hoặc từ chối đơn QR ảo → `VOIDED`, giải phóng bàn về `AVAILABLE`).
  - `PATCH /api/v1/pos/orders/:id/items` — `@RequirePermission('pos', 'update')`: Thêm món mới vào đơn đang mở, hoặc sửa/huỷ món theo đúng 2 nhánh của `EC-POS-06` (`NEW` vs `PRINTED`).
  - `GET /api/v1/pos/orders/:id/provisional-bill` — `@RequirePermission('pos', 'view')`: Xuất dữ liệu Phiếu tạm tính kèm URL VietQR động chuẩn Napas247; **BẮT BUỘC GIỮ NGUYÊN** `order.status = 'SERVING'` và `dining_tables.status = 'OCCUPIED'` (Hard Invariant 4).
  - `POST /api/v1/pos/orders/:id/checkout` — `@RequirePermission('pos', 'checkout')`: Chốt thanh toán 2 bước (`CASH` / `TRANSFER` / `SPLIT`), chuyển `status = 'PAID'`, giải phóng bàn về `'AVAILABLE'` (Hard Invariant 4, 5, 6).
- [x] `apps/api-server/src/modules/pos/invoices.controller.ts` — Các endpoints Quản lý Hoá đơn (Module 2):
  - `GET /api/v1/invoices` — `@RequirePermission('invoices', 'view')`: Lọc hoá đơn với **Bộ lọc kép tách bạch** (`fromDate`, `toDate` mặc định hôm nay + `searchField: 'order_code' | 'table' | 'note'` kết hợp `keyword` theo điều kiện AND), phân trang server-side.
  - `GET /api/v1/invoices/:id` — `@RequirePermission('invoices', 'view')`: Xem chi tiết hoá đơn, danh sách món theo lượt (`batch_no`), lịch sử chuyển/gộp bàn (`table_transfer_logs`), hỗ trợ in lại hoá đơn (`invoices:reprint`).
  - `POST /api/v1/invoices/:id/void` — `@RequirePermission('invoices', 'void')`: Huỷ hoá đơn đã thanh toán (`PAID` → `VOIDED`), bắt buộc `voidReason >= 10` ký tự (`EC-FIN-01`).
- [x] `apps/api-server/src/modules/pos/pos.service.ts` & `apps/api-server/src/modules/pos/invoices.service.ts`
- [x] POS tests: `pos.service.spec.ts`, `pos.controller.spec.ts`, `invoices.service.spec.ts`, và `pos-socket.gateway.spec.ts`.

---

## 3. CHI TIẾT KỸ THUẬT & NGHIỆP VỤ (TECHNICAL SPECIFICATIONS)

### 3.1. Dual-Mode Socket Authentication (`PosSocketGateway` — `DISCREPANCY-WS-01`)
Trong `handleConnection(client: Socket)`:
1. **Nhánh 1 — Staff/Cashier (`client.handshake.auth?.token`):**
   - Xác thực JWT bằng `JwtService.verifyAsync(token)`.
   - Nếu hợp lệ: lưu `client.data.user`, cho phép client `client.join('pos_cashier_room')`.
   - Nếu JWT hết hạn hoặc không hợp lệ: gọi `client.disconnect(true)` ngay lập tức.
2. **Nhánh 2 — QR Guest (`client.handshake.auth?.qrToken`):**
   - Kiểm tra `qrToken` có tồn tại trong `dining_tables` không.
   - Nếu hợp lệ và có `auth.orderId`: **CHỈ** cho phép `client.join(\`order_session_\${orderId}\`)`. **CẤM TUYỆT ĐỐI** cho join vào `pos_cashier_room`.
3. **Nhánh 3 — Không có cả hai:** Gọi `client.disconnect(true)` ngay lập tức.

### 3.2. Ba Nguồn Tạo Đơn & Điều hướng Tự động Phiên QR (`EC-POS-01`)
1. **Sinh mã hoá đơn `order_code`:** Định dạng `'HD-YYYYMMDD-NNNN'` (ví dụ `'HD-20261107-0001'`), tự tăng trong ngày.
2. **Đơn Mang về (`order_type = 'TAKEAWAY'` — Hard Invariant 2):**
   - `table_id` **MUST** là `null`.
   - `takeaway_number` tính bằng `COALESCE(MAX(takeaway_number) trong ngày hiện tại, 0) + 1` (bắt đầu từ `1` và reset về `1` lúc `00:00:00` mỗi ngày).
   - Khởi tạo ở trạng thái `status = 'SERVING'`.
3. **Khách quét QR đặt món & Gọi thêm món (`POST /api/v1/public/orders/qr` — `SEQ-01` & `EC-POS-01`):**
   - Bọc trong `prisma.$transaction()` với khoá dòng `SELECT ... FOR UPDATE`.
   - Nếu khách gửi kèm `activeOrderId` (từ `sessionStorage` của tab trình duyệt cũ):
     - Khoá và kiểm tra đơn `activeOrderId`:
       - Nếu đơn đang mở (`status IN ('PENDING', 'SERVING')`) dù `table_id` đã được `MOVE` sang bàn mới (ví dụ Bàn 07): tự động nối `order_items` mới vào đúng đơn `activeOrderId` tại bàn mới.
       - Nếu đơn đã được `MERGE` (`status = 'MERGED'` và `merged_into_order_id = targetOrderId`): khoá tiếp `targetOrderId` và tự động nối `order_items` mới vào `targetOrderId` tại bàn đích.
       - **TUYỆT ĐỐI KHÔNG** tạo đơn mới ở bàn cũ trên URL.
   - Nếu bàn chưa có đơn mở: tạo `orders` mới với `status = 'PENDING'`, cập nhật `dining_tables.status = 'PENDING'`, `active_order_id = newOrder.id`, và emit `order:qr_new`.

### 3.3. Huỷ/Sửa Món Trước vs Sau Khi Tách Bếp (`EC-POS-06`)
Trong `PATCH /api/v1/pos/orders/:id/items`:
- **Nhánh A (`orderItem.kitchen_status === 'NEW'`):** Cho phép sửa trực tiếp `quantity`, `modifiers_snapshot`, `item_note` hoặc xoá cứng (`DELETE FROM order_items WHERE id = :itemId`), tính lại `orders.total_amount`, `requireCancellationSlip = false`.
- **Nhánh B (`orderItem.kitchen_status === 'PRINTED'`):** **CẤM** xoá cứng. Chuyển `kitchen_status = 'CANCELLED'`, trừ tiền món khỏi `orders.total_amount`, trả về `requireCancellationSlip = true` kèm payload `kitchenCancellationSlip` (`"PHIẾU BÁO HUỶ MÓN: BÀN 07 - HUỶ 01 MÌ BÒ CẤP 3"`) để máy in nhiệt in xuống trạm bếp tương ứng.

### 3.4. Tạm tính VietQR vs Chốt Thanh toán (Hard Invariant 4, 5, 6)
- **`GET /api/v1/pos/orders/:id/provisional-bill`:**
  - Chỉ đọc dữ liệu và sinh URL VietQR động chuẩn Napas247 (`amount = total_amount`, `addInfo = "TT " + order_code`).
  - **MUST** giữ nguyên `order.status = 'SERVING'` và `dining_tables.status = 'OCCUPIED'`.
- **`POST /api/v1/pos/orders/:id/checkout`:**
  - Bọc trong `prisma.$transaction()`:
    1. Khoá `SELECT * FROM orders WHERE id = :id FOR UPDATE`.
    2. Nếu `DINE_IN`, khoá tiếp `SELECT * FROM dining_tables WHERE id = :tableId FOR UPDATE`.
    3. Kiểm tra và gán số tiền theo đúng `chk_order_payment_amounts`:
       - `CASH`: `cash_amount = total_amount`, `transfer_amount = 0`.
       - `TRANSFER`: `transfer_amount = total_amount`, `cash_amount = 0`.
       - `SPLIT`: kiểm tra `cashAmount > 0 && transferAmount > 0 && cashAmount + transferAmount === total_amount`.
    4. Cập nhật `orders`: `status = 'PAID'`, `paid_at = new Date()`, `cashier_id = user.id`.
    5. Nếu `DINE_IN`: cập nhật `dining_tables` về `status = 'AVAILABLE'`, `active_order_id = null`.
    6. Sau khi commit: emit `order:status_updated` (`status: 'PAID'`) và `table:grid_sync`.

---

## 4. TIÊU CHÍ NGHIỆM THU (ACCEPTANCE CRITERIA)

- [x] **AC-04.1 (Takeaway Invariant 2):** Tạo đơn `TAKEAWAY` sinh ra `table_id = null`, `takeaway_number` tăng trong ngày và tính lại theo ngày kinh doanh.
- [x] **AC-04.2 (QR Add-on Session Redirect `EC-POS-01`):** Món gọi thêm từ phiên QR cũ được gắn vào đúng đơn đang phục vụ sau khi chuyển hoặc gộp bàn.
- [x] **AC-04.3 (Provisional Bill Keeps SERVING — Invariant 4):** Phiếu tạm tính tạo URL VietQR theo tổng tiền/mã đơn mà không đổi trạng thái đơn hoặc bàn.
- [x] **AC-04.4 (Checkout & Split Payment — Invariant 4 & 6):** Thanh toán `CASH`, `TRANSFER`, `SPLIT` lưu đúng các khoản, chuyển đơn sang `'PAID'` và giải phóng bàn.
- [x] **AC-04.5 (Dual-Mode WebSocket Auth):** JWT thu ngân và `qrToken` khách được giới hạn vào room tương ứng; kết nối không xác thực bị từ chối.
