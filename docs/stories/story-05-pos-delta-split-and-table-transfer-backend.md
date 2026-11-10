# Story 05: Xây dựng Thuật toán `split-kitchen` (Delta Split 3 Trạm Bếp + Phân rã Combo) & `table-action` (MOVE / MERGE / SWAP Có Khoá Dòng)

> **Story ID:** `STORY-05`  
> **Tên file:** `docs/stories/story-05-pos-delta-split-and-table-transfer-backend.md`  
> **Phase thực thi:** Phase 4B (Backend POS Advanced Concurrency & Kitchen Split)  
> **Agent phụ trách:** Codex  
> **Phụ thuộc (Dependencies):** `story-01`, `story-02`, `story-03`, `story-04`  
> **Quy tắc bất biến áp dụng:** Hard Invariant 3 (Delta Split 3 Bếp & Phân rã Combo, CẤM in lại món `PRINTED`), Hard Invariant 5 (Khoá dòng `SELECT ... FOR UPDATE` theo thứ tự `orders (id ASC)` → `dining_tables (id ASC)` chống AB-BA Deadlock)  
> **Tài liệu tham chiếu:** `.agents/rules/02-pos-kitchen-and-cashflow-logic.md` (§2, §4), `.agents/rules/01-database-and-concurrency.md` (§4, §6), `docs/bmad/03-Edge-Cases-And-Invariants.md` (`EC-POS-02`, `EC-POS-03`, `EC-POS-04`, `EC-POS-05`), `docs/architecture/03-verified-sequences.mmd` (`SEQ-02`, `SEQ-03`), `docs/architecture/04-audit-report.md` (`DISCREPANCY-SM-02`, `DISCREPANCY-SM-04`, `DISCREPANCY-LOCK-01`)

---

## 1. MỤC TIÊU (OBJECTIVES)

Hiện thực hoá 2 nghiệp vụ phức tạp và nhạy cảm nhất về xử lý đồng thời (concurrency) tại quầy POS:
1. **Thuật toán Delta Split 3 Khu vực Bếp (`POST /api/v1/pos/orders/:id/split-kitchen`):** Chỉ lọc các món có `kitchen_status = 'NEW'`, tự động phân rã các sản phẩm `station = 'COMBO'` qua bảng `combo_items` về đúng 3 trạm thực tế (`BEP_NAU`, `BEP_CHIEN`, `PHA_CHE`), tự động nâng trạng thái đơn QR từ `PENDING` lên `SERVING`, gán số lượt gọi `batch_no`, chuyển `kitchen_status` sang `'PRINTED'`, và trả về mảng phiếu in nhiệt 80mm kèm logo nhận diện từng trạm. Đảm bảo tính idempotent (HTTP 200 `{ tickets: [] }`) khi thu ngân double-click (`EC-POS-05`).
2. **Nghiệp vụ Chuyển bàn (`MOVE`), Gộp bàn (`MERGE`), và Hoán đổi bàn (`SWAP`) (`POST /api/v1/pos/orders/:id/table-action`):** Thực thi trong `prisma.$transaction()` với khoá dòng `SELECT ... FOR UPDATE` tuân thủ nghiêm ngặt thứ tự khoá chống AB-BA Deadlock (`orders` theo `id ASC` trước, `dining_tables` theo `id ASC` sau), phát sự kiện WebSocket `order:session_redirected` để tự động chuyển phiên trên điện thoại khách mà không cần quét lại QR, và sinh dữ liệu `kitchenTransferSlip` nếu đơn đã có món `PRINTED` (`EC-POS-04`).

---

## 2. DANH SÁCH FILE CHECKLIST (FILE MANIFEST & CHECKLIST)

### 2.1. Backend Services & Controllers (`apps/api-server/src/modules/pos/`)
- [x] `apps/api-server/src/modules/pos/kitchen-split.service.ts` — Hiện thực hoá thuật toán `splitKitchen(orderId, userId)` với `prisma.$transaction` và `SELECT ... FOR UPDATE`.
- [x] `apps/api-server/src/modules/pos/table-transfer.service.ts` — Hiện thực hoá thuật toán `executeTableAction(orderId, dto, userId)` hỗ trợ đủ 3 hành động `MOVE`, `MERGE`, `SWAP` với khoá dòng chống AB-BA Deadlock.
- [x] `apps/api-server/src/modules/pos/pos.controller.ts` — Gắn 2 endpoints:
  - `POST /api/v1/pos/orders/:id/split-kitchen` (`@RequirePermission('pos', 'splitKitchen')`)
  - `POST /api/v1/pos/orders/:id/table-action` (`@RequirePermission('pos', 'tableAction')`)
- [x] `apps/api-server/src/modules/pos/pos.module.ts` — Đăng ký `KitchenSplitService` và `TableTransferService`.

### 2.2. Bộ Kiểm thử Tự động Bắt buộc (`apps/api-server/src/modules/pos/__tests__/`)
- [x] `apps/api-server/src/modules/pos/__tests__/kitchen-split.spec.ts` — Unit & Integration tests cho Delta Split, Combo Explosion, Batch numbering, `PENDING -> SERVING` auto-promotion, và Double-Click Race (`EC-POS-05`).
- [x] `apps/api-server/src/modules/pos/__tests__/table-transfer.spec.ts` — Unit & Integration tests cho `MOVE`, `MERGE`, `SWAP`, chặn merge `TAKEAWAY` (`EC-POS-03`), chặn move vào bàn `OCCUPIED` (`EC-POS-02`), sinh `kitchenTransferSlip` (`EC-POS-04`), emit `order:session_redirected`, và test chống AB-BA Deadlock khi chạy đồng thời (`DISCREPANCY-LOCK-01`).

---

## 3. CHI TIẾT KỸ THUẬT & NGHIỆP VỤ (TECHNICAL SPECIFICATIONS)

### 3.1. Thuật toán Delta Split 3 Bếp (`POST /api/v1/pos/orders/:id/split-kitchen` — Hard Invariant 3)
Thực thi bên trong `await this.prisma.$transaction(async (tx) => { ... })`:
1. **Khoá dòng đơn hàng (Chống Double-Click Race `EC-POS-05`):**
   ```typescript
   const lockedOrders = await tx.$queryRaw<Array<{ id: number; status: string; table_id: number | null }>>`
     SELECT id, status, table_id FROM orders WHERE id = ${orderId} FOR UPDATE
   `;
   ```
   Nếu đơn không tồn tại → `404 NotFoundException`. Nếu `status` không thuộc `'PENDING' | 'SERVING'` → `409 ConflictException` (`ErrorCodes.POS_ORDER_NOT_ACTIVE`).
2. **Truy vấn CHỈ các món có `kitchen_status = 'NEW'`:**
   - Lấy danh sách `order_items` có `order_id = orderId AND kitchen_status = 'NEW'` kèm thông tin `product` và `combo_items` (nếu `product.station === 'COMBO'`).
3. **Kiểm tra Idempotent (`DISCREPANCY-SM-04` & `EC-POS-05`):**
   - Nếu danh sách món `'NEW'` rỗng (`newItems.length === 0`): kết thúc transaction và trả về **HTTP 200 OK**:
     ```json
     { "batchNo": null, "tickets": [], "message": "Không có món mới cần tách" }
     ```
   - **CẤM TUYỆT ĐỐI** ném lỗi 400 hoặc in lại các món đã `PRINTED`.
4. **Tính số thứ tự lượt gọi (`batch_no`):**
   - Truy vấn `MAX(batch_no)` của các món đã `'PRINTED'` trong đơn:
     - Nếu chưa có món nào `'PRINTED'` trước đó → `currentBatch = 1`.
     - Nếu đã có → `currentBatch = maxPrintedBatch + 1`.
5. **Phân rã Món Combo (`Combo Explosion` — `FR-0.4`):**
   - Với mỗi `order_item` có `product.station === 'COMBO'`:
     - Duyệt qua `product.comboItems` (`child_product_id`, `quantity`), nhân số lượng: `subItemQty = orderItem.quantity * comboItem.quantity`.
     - Đưa từng món con về đúng trạm thực tế của nó (`BEP_NAU`, `BEP_CHIEN`, hoặc `PHA_CHE`), giữ nguyên `modifiers_snapshot` và `item_note` từ dòng combo cha.
     - **NEVER** sinh ticket có `station = 'COMBO'`.
6. **Tự động nâng trạng thái đơn QR (`DISCREPANCY-SM-02`):**
   - Nếu `order.status === 'PENDING'`:
     - Nếu `order.table_id !== null`, khoá dòng bàn `SELECT id FROM dining_tables WHERE id = ${order.table_id} FOR UPDATE`.
     - Cập nhật `orders.status = 'SERVING'` và `dining_tables.status = 'OCCUPIED'`.
7. **Cập nhật trạng thái món ăn:**
   - `UPDATE order_items SET kitchen_status = 'PRINTED', batch_no = ${currentBatch} WHERE id IN (...)`.
8. **Đóng gói 3 mẫu Ticket trả về:**
   - Map cấu hình tiêu đề và logo chuẩn:
     - `BEP_NAU`: `{ stationTitle: 'BẾP NẤU (MÌ CAY)', logoType: 'CHEF_HAT_NOODLE' }`
     - `BEP_CHIEN`: `{ stationTitle: 'BẾP CHIÊN', logoType: 'FRENCH_FRIES' }`
     - `PHA_CHE`: `{ stationTitle: 'QUẦY NƯỚC UỐNG', logoType: 'DRINK_CUP' }`
   - Nếu `currentBatch > 1`: đính kèm nhãn `batchLabel: "[GỌI THÊM - LƯỢT " + currentBatch + "]"`.
   - Nếu `order.table_transfer_logs` có lịch sử chuyển bàn: đính kèm `transferNotice: "[GHI CHÚ ĐỔI BÀN: Chuyển từ BÀN XX sang BÀN YY]"`.
9. **Phát sự kiện WebSocket sau khi commit:**
   - Emit `order:status_updated` (`{ status: 'SERVING', message: 'Bếp đang chế biến' }`) tới `order_session_${orderId}` và `table:grid_sync` tới `pos_cashier_room`.

### 3.2. Thuật toán Chuyển/Gộp/Hoán đổi Bàn (`POST /api/v1/pos/orders/:id/table-action` — Hard Invariant 5)
1. **Thứ tự Khoá dòng Chống AB-BA Deadlock (`DISCREPANCY-LOCK-01`):**
   - Bắt buộc xác định toàn bộ `orderIds` (đơn nguồn + đơn đích nếu `MERGE`/`SWAP`) và `tableIds` (bàn nguồn + bàn đích) cần tham gia.
   - **Bước 1:** Khoá bảng `orders` theo thứ tự `ORDER BY id ASC FOR UPDATE`:
     ```typescript
     await tx.$queryRaw`SELECT * FROM orders WHERE id IN (${Prisma.join(sortedOrderIds)}) ORDER BY id ASC FOR UPDATE`;
     ```
   - **Bước 2:** Khoá bảng `dining_tables` theo thứ tự `ORDER BY id ASC FOR UPDATE`:
     ```typescript
     await tx.$queryRaw`SELECT * FROM dining_tables WHERE id IN (${Prisma.join(sortedTableIds)}) ORDER BY id ASC FOR UPDATE`;
     ```
2. **Xử lý theo từng `action`:**
   - **`MOVE` (Chuyển sang bàn trống):**
     - Kiểm tra đơn nguồn là `DINE_IN` và bàn đích có `status === 'AVAILABLE'` (nếu bàn đích đang `OCCUPIED` hoặc `PENDING` → ném `409 ConflictException` với `code: ErrorCodes.POS_TABLE_NOT_AVAILABLE` — `EC-POS-02`).
     - Cập nhật `order.table_id = targetTableId`, nối log vào `table_transfer_logs`.
     - Bàn nguồn → `status = 'AVAILABLE'`, `active_order_id = null`.
     - Bàn đích → `status = 'OCCUPIED'`, `active_order_id = order.id`.
   - **`MERGE` (Gộp vào bàn đang có khách):**
     - Nếu đơn nguồn có `order_type === 'TAKEAWAY'` → ném `409 ConflictException` với `code: ErrorCodes.POS_TAKEAWAY_CANNOT_MERGE` (`EC-POS-03`).
     - Nếu bàn đích không ở trạng thái `OCCUPIED` (hoặc không có `active_order_id`) → ném `409 ConflictException` với `code: ErrorCodes.POS_TABLE_NOT_OCCUPIED`.
     - Chuyển toàn bộ `order_items` từ `sourceOrder.id` sang `targetOrder.id` (`UPDATE order_items SET order_id = targetOrderId WHERE order_id = sourceOrderId`), **BẮT BUỘC GIỮ NGUYÊN** `kitchen_status` (`'PRINTED'` hoặc `'NEW'`) của từng món để không bao giờ in nấu lại món cũ.
     - Cộng dồn `total_amount` sang `targetOrder`, ghi `table_transfer_logs`.
     - Đơn nguồn → `status = 'MERGED'`, `merged_into_order_id = targetOrder.id`, `total_amount = 0`, `table_id = null`.
     - Bàn nguồn → `status = 'AVAILABLE'`, `active_order_id = null`.
   - **`SWAP` (Hoán đổi 2 bàn đang ăn):**
     - Cả 2 bàn đều phải đang `OCCUPIED` và có `active_order_id`.
     - Hoán đổi `table_id` của 2 đơn (lưu ý cập nhật an toàn đối với Partial Unique Index `idx_one_active_order_per_table`) và hoán đổi `active_order_id` trên 2 bàn. Ghi log vào cả 2 đơn.
3. **Kiểm tra sinh Phiếu Thông báo Chuyển bàn (`EC-POS-04`):**
   - Nếu đơn vừa thao tác có ít nhất 1 dòng `order_items` ở trạng thái `kitchen_status = 'PRINTED'`, đặt `requireKitchenNoticePrint = true` và trả về đối tượng `kitchenTransferSlip` chứa `fromLabel`, `toLabel`, `orderCode`, `affectedStations`.
4. **Phát sự kiện Redirect Phiên Điện thoại Khách:**
   - Emit `order:session_redirected` tới room `order_session_${sourceOrderId}` với đầy đủ `{ previousOrderId, newActiveOrderId, previousTableLabel, newTableId, newTableLabel, message }`.

---

## 4. TIÊU CHÍ NGHIỆM THU (ACCEPTANCE CRITERIA)

- [x] **AC-05.1 (Delta Split Only NEW Items):** Đơn có 2 món ở Lượt 1 đã `PRINTED`. Khi khách gọi thêm 1 món ở Lượt 2 (`NEW`) và bấm `split-kitchen`, hệ thống CHỈ trả về phiếu in chứa 1 món của Lượt 2 với `batchNo = 2` và nhãn `"[GỌI THÊM - LƯỢT 2]"`.
- [x] **AC-05.2 (Combo Explosion):** Khi tách đơn có món `Combo Đôi` (`station = 'COMBO'`), kết quả trả về phân rã chính xác thành các món con thuộc `BEP_NAU`, `BEP_CHIEN`, `PHA_CHE`; tuyệt đối không có ticket nào mang `station = 'COMBO'`.
- [x] **AC-05.3 (Double-Click Idempotency `EC-POS-05`):** Gọi `split-kitchen` lần 2 ngay sau lần 1 (khi không có món `NEW` mới) trả về HTTP `200 OK` với `tickets: []`.
- [x] **AC-05.4 (Table Action Guards `EC-POS-02` & `EC-POS-03`):** Gọi `MOVE` tới bàn đang `OCCUPIED` trả về `409 POS_TABLE_NOT_AVAILABLE`; gọi `MERGE` đơn `TAKEAWAY` trả về `409 POS_TAKEAWAY_CANNOT_MERGE`.
- [x] **AC-05.5 (Kitchen Notice & WS Session Redirect `EC-POS-04`):** Khi `MOVE` hoặc `MERGE` đơn đã có món `PRINTED`, response trả về `requireKitchenNoticePrint: true` kèm `kitchenTransferSlip`, và Socket.io phát sự kiện `order:session_redirected` tới room của đơn cũ.
