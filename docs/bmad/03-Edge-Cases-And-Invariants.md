# BMAD Quy tắc Bất biến & Danh mục Tình huống Biên
# 03-Edge-Cases-And-Invariants.md — 10 Hard Invariants & Edge Cases Catalog

> **Tài liệu:** `docs/bmad/03-Edge-Cases-And-Invariants.md`  
> **Phiên bản:** 2.0.0 (Synced with Production Codebase — Stories 01–21)  
> **Vai trò thực hiện:** BMAD Business Analyst, Principal Architect & QA Specialist  
> **Trạng thái:** FINAL & SYNCED  
> **Ngày phê duyệt gốc:** 2026-11-07 · **Ngày cập nhật đồng bộ:** 2026-11-26  
> **Mục tiêu:** Định hình "Hiến pháp kỹ thuật", loại bỏ 100% mơ hồ nghiệp vụ và rủi ro sập hệ thống trong giờ cao điểm.

---

## PHẦN 1: 10 QUY TẮC BẤT BIẾN (HARD INVARIANTS)

> [!CAUTION]
> **VIOLATION = REJECT.**  
> Mọi dòng code, migration, truy vấn SQL, cấu hình giao diện hay bài test vi phạm bất kỳ quy tắc nào dưới đây đều bị từ chối nghiệm thu ngay lập tức mà không có ngoại lệ.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               10 HARD INVARIANTS CỦA DỰ ÁN                             │
├────┬─────────────────────────────────┬─────────────────────────────────────────────────┤
│ #  │ Tên Quy tắc                     │ Tôn chỉ Bất biến (Non-negotiable Directive)     │
├────┼─────────────────────────────────┼─────────────────────────────────────────────────┤
│ 1  │ Cô lập Module                   │ CẤM import trực tiếp giữa các src/features/*    │
│ 2  │ Đơn Mang về (TAKEAWAY)          │ table_id = NULL, takeaway_number NOT NULL       │
│ 3  │ Delta Split Trạm Bếp            │ CHỈ lọc kitchen_status = 'NEW', CẤM in lại cũ   │
│ 4  │ Tách bạch Tạm tính vs Thanh toán│ In tạm tính giữ SERVING; Thanh toán đóng PAID   │
│ 5  │ Khoá dòng Table Actions         │ Bắt buộc SELECT ... FOR UPDATE trong $trans     │
│ 6  │ Công thức Kết ca Dòng tiền      │ CASH + SPLIT.cash - CASH_DRAWER; CẤM cộng QR    │
│ 7  │ MDM Chuẩn hoá Chuỗi             │ trim() -> Title Case -> strip diacritics -> low │
│ 8  │ RBAC 401 vs 403                 │ 401 khi lỗi Auth/Session; 403 khi thiếu Quyền   │
│ 9  │ Giữ UI Preferences khi Logout   │ Xoá token & data cache; CẤM xoá ui_preferences  │
│ 10 │ Kiểu Tiền tệ NUMERIC(12, 2)     │ Bắt buộc NUMERIC / Decimal; CẤM FLOAT / INT     │
└────┴─────────────────────────────────┴─────────────────────────────────────────────────┘
```

---

### INVARIANT 1: CÔ LẬP MODULE (FEATURE ISOLATION)
- **Đặc tả:** Frontend (`apps/web-app/src/features/*`, hiện có 16 features) tuân thủ `bulletproof-react`. Mỗi thư mục feature là một Bounded Context đóng kín:
  - Sole Public API là file barrel `index.ts`.
  - **NGHIÊM CẤM** import trực tiếp giữa các thư mục feature (kể cả trong Touch Shell `/pos/touch/*`, việc gắn trang chỉ đi qua `React.lazy()` ở `router.tsx` / `route-prefetch.ts`).
  - Mọi thành phần chia sẻ đặt trong `packages/shared/` (`@fnb/shared`), `apps/web-app/src/components/`, `src/hooks/`, `src/lib/` hoặc `src/utils/`.

---

### INVARIANT 2: ĐƠN MANG VỀ (TAKEAWAY VS DINE-IN ENFORCEMENT)
- **Đặc tả:** Được enforce bởi CHECK Constraint `chk_order_type_target` trong PostgreSQL:
  ```sql
  ALTER TABLE orders ADD CONSTRAINT chk_order_type_target CHECK (
    (order_type = 'DINE_IN' AND table_id IS NOT NULL AND takeaway_number IS NULL) OR
    (order_type = 'TAKEAWAY' AND table_id IS NULL AND takeaway_number IS NOT NULL)
  );
  ```
- Bảng `dining_tables` **CHỈ** lưu các bàn ăn vật lý (`Bàn 01`..`Bàn N`), **CẤM** tạo bản ghi bàn `"Mang về"` trong `dining_tables`.
- `takeaway_number` tự tăng từ `1` và reset mỗi ngày mới theo giờ Việt Nam (`+07:00`).

---

### INVARIANT 3: DELTA SPLIT TRẠM BẾP (IN TÁCH BẾP MÓN MỚI)
- **Đặc tả:** `POST /api/v1/pos/orders/:id/split-kitchen`:
  1. **CHỈ** lọc `order_items` có `kitchen_status = 'NEW'`.
  2. Món `station = 'COMBO'` bắt buộc phân rã qua `combo_items` về đúng trạm vật lý (`BEP_NAU`, `BEP_CHIEN`, `PHA_CHE`, `BEP_*`) — **CẤM** gửi chữ `COMBO` xuống bếp.
  3. Nâng `order.status` từ `'PENDING'` → `'SERVING'` (và `dining_tables.status` → `'OCCUPIED'`) nếu là đơn QR mới, chuyển món sang `'PRINTED'` và gán `batch_no = MAX(batch_no) + 1`.
  4. Khi không có món `'NEW'`, trả về **HTTP 200 OK idempotent** (`{ tickets: [] }`). **CẤM** in lại món đã `PRINTED` qua endpoint này (việc in lại chủ động đi qua endpoint riêng `POST /pos/orders/:id/reprint-kitchen`).

---

### INVARIANT 4: TÁCH BẠCH TẠM TÍNH VÀ THANH TOÁN (BILLING FLOW INTEGRITY)
- **Nút "In tạm tính" (`provisional-bill`, `split-provisional-bill`):**
  - Giữ nguyên `order.status = 'SERVING'` và `dining_tables.status = 'OCCUPIED'`.
  - Xoay vòng mã QR thanh toán (`payment_accounts`) và sinh mã VietQR động.
  - **CẤM TUYỆT ĐỐI** chuyển trạng thái sang `'PAID'`.
- **Nút "Thanh toán" (`checkout`, `split-checkout`):**
  - Bắt buộc xác nhận 2 bước (`CASH` / `TRANSFER` / `SPLIT`), kiểm tra `chk_order_payment_amounts`.
  - Chuyển sang `'PAID'`, ghi `paid_at = NOW()`, và giải phóng bàn về `'AVAILABLE'` (khi thanh toán trọn đơn).

---

### INVARIANT 5: KHOÁ DÒNG CHO TABLE ACTIONS & ORDER MUTATIONS (CONCURRENCY CONTROL)
- **Đặc tả:** Mọi thao tác `MOVE` / `MERGE` / `SWAP` / `TO_TAKEAWAY`, `split-kitchen`, `checkout`, `split-checkout` **BẮT BUỘC** bọc trong `prisma.$transaction()` dùng `SELECT ... FOR UPDATE`.
- **Thứ tự khoá chống AB-BA Deadlock:** **ALWAYS** khoá bảng `orders` (`ORDER BY id ASC FOR UPDATE`) trước, sau đó mới khoá bảng `dining_tables` (`ORDER BY id ASC FOR UPDATE`).
- **CẤM** gọi API bên ngoài (VietQR, Web Push HTTP, LAN printer TCP) trong lúc đang giữ khoá DB.

---

### INVARIANT 6: CÔNG THỨC KẾT CA DÒNG TIỀN (CASHFLOW SETTLEMENT)
- **Đặc tả:**
  ```sql
  expected_cash_in_drawer = opening_budget
    + SUM(CASE WHEN payment_method = 'CASH'  THEN total_amount
               WHEN payment_method = 'SPLIT' THEN cash_amount
               ELSE 0 END
          WHERE status = 'PAID' AND payment_method IN ('CASH', 'SPLIT'))
    - SUM(total_cost WHERE payment_source = 'CASH_DRAWER' AND is_deleted = FALSE)

  discrepancy_amount = actual_counted_cash - expected_cash_in_drawer
  ```
- **QUY TẮC CẤM:**
  1. **FORBIDDEN** cộng doanh thu chuyển khoản (`TRANSFER` hoặc `transfer_amount` của đơn `SPLIT`) vào `expected_cash_in_drawer`.
  2. **FORBIDDEN** cộng hoá đơn đã huỷ (`VOIDED`) hoặc trừ phiếu nhập hàng `EXTERNAL` / đã xoá mềm (`is_deleted = TRUE`).

---

### INVARIANT 7: MASTER DATA CHUẨN HOÁ CHUỖI (DATA NORMALIZATION)
- `MdmService.findOrCreate()` luôn thực hiện: `trim()` → Title Case → bỏ dấu tiếng Việt + `đ/Đ -> d` + lowercase (`normalized_name`) → đối chiếu `UNIQUE(category, normalized_name)` trước khi INSERT.
- Hàm PostgreSQL `f_search_norm()` (dùng `unaccent`, gộp `y -> i`) chỉ phục vụ tìm kiếm mờ, không thay thế cột `normalized_name`.

---

### INVARIANT 8: PHÂN ĐỊNH MÃ LỖI RBAC 401 VS 403 & MỞ MDM LOOKUP
- **`401 Unauthorized`:** Thiếu token, token hỏng/hết hạn, sai mật khẩu, hoặc phiên single-session bị thu hồi (`AUTH_SESSION_REVOKED`). **CẤM** trả `403`.
- **`403 Forbidden`:** Đã xác thực hợp lệ nhưng thiếu quyền hoặc không phải Super Admin. **CẤM** trả `401`.
- **`GET /api/v1/mdm/lookup`:** Mở cho mọi tài khoản đã đăng nhập (`JwtAuthGuard`), không đòi quyền `mdm:*`.

---

### INVARIANT 9: GIỮ NGUYÊN CẤU HÌNH GIAO DIỆN KHI ĐĂNG XUẤT
- Khi bấm Đăng xuất: gọi `queryClient.clear()`, xoá Access/Refresh Token và Auth State.
- **CẤM** xoá `ui_preferences` (`theme`, `sidebarWidth`, `columnWidths`, `displayScale`, `navOrder`, `navGroupOrder`, `sidebarCollapsed`, `voiceAlertEnabled`) khỏi `localStorage` và `users.ui_preferences` trên DB.
- Khi tài khoản cập nhật thiết lập cá nhân, đồng bộ sang các thiết bị khác qua sự kiện `account:preferences_updated` (và có nút Reset cài đặt cá nhân chủ động trong `/profile`).

---

### INVARIANT 10: KIỂU TIỀN TỆ BẮT BUỘC `NUMERIC(12, 2)` / `Decimal`
- 100% cột tiền tệ trên `products`, `modifiers`, `orders` (`cash_amount`, `transfer_amount`, `subtotal_amount`, `discount_amount`, `total_amount`), `order_items`, `payment_accounts`, `discounts`, `inventory_imports`, `cash_drawer_settlements` dùng `NUMERIC(12, 2)` / `@db.Decimal(12, 2)`. **CẤM** dùng `FLOAT`, `DOUBLE`, `REAL`, hoặc `INT`.

---

## PHẦN 2: MINH HOẠ KỊCH BẢN KẾT CA HỖN HỢP (CASH + TRANSFER + SPLIT)

### Dữ liệu Đầu vào trong Ca
1. **Ngân sách đầu ca (`opening_budget`):** `1.000.000 đ`
2. **Doanh thu bán hàng (`status = 'PAID'`):**
   - Đơn `HD001`: `150.000 đ` (`CASH`) → Tiền mặt `+150.000 đ`
   - Đơn `HD002`: `220.000 đ` (`TRANSFER`) → Ngân hàng `+220.000 đ` (không cộng két)
   - Đơn `HD003`: `300.000 đ` (`SPLIT`: `cash_amount = 100.000 đ`, `transfer_amount = 200.000 đ`) → Tiền mặt `+100.000 đ`, Ngân hàng `+200.000 đ`
   - Đơn `HD004`: `105.000 đ` (`CASH`) → Tiền mặt `+105.000 đ`
   - Đơn `HD005`: `180.000 đ` (`VOIDED`) → Bị loại trừ hoàn toàn (`0 đ`)
   - *Tổng thu tiền mặt vào két:* `150.000 + 100.000 + 105.000 = 355.000 đ`
   - *Tổng thu chuyển khoản đối soát ngân hàng:* `220.000 + 200.000 = 420.000 đ`
3. **Chi nhập hàng trong ca (Module Nhập hàng):**
   - Phiếu 1: Mua đá bi & rau nấm: `120.000 đ` (`CASH_DRAWER`) → Trừ két `-120.000 đ`
   - Phiếu 2: Nhập mì Koreno: `570.000 đ` (`EXTERNAL`) → Không trừ két (`0 đ`)
4. **Tiền thực đếm (`actual_counted_cash` từ lưới 9 mệnh giá):** `1.235.000 đ`

### Kết quả Chuẩn
$$\text{expected\_cash\_in\_drawer} = 1.000.000 + 355.000 - 120.000 = 1.235.000\text{ đ}$$
$$\text{discrepancy\_amount} = 1.235.000 - 1.235.000 = 0\text{ đ} \implies \text{status} = \text{'MATCHED'}$$
$$\text{cashRetainedInDrawer} = 1.000.000\text{ đ}, \quad \text{cashToHandOver} = 235.000\text{ đ}$$

---

## PHẦN 3: DANH MỤC TÌNH HUỐNG BIÊN TOÀN DIỆN (DETAILED EDGE CASES CATALOG)

### 3.1. Nhóm POS, Đặt món QR & Tách Bếp

#### `EC-POS-01`: Khách quét QR ở Bàn 01, dọn sang Bàn 07 và gọi thêm từ Tab cũ
- `sessionStorage` giữ `activeOrderId` + WebSocket `order:session_redirected` tự đổi nhãn sang `Bàn 07`; backend kiểm tra đơn theo `activeOrderId` (kể cả khi đã `MOVE` hoặc `MERGE` sang `merged_into_order_id`) để nối món vào đúng Bàn 07, không tạo đơn ảo tại Bàn 01.

#### `EC-POS-02`: Bàn đích khi `MOVE` đang có khách (`OCCUPIED`)
- Backend kiểm tra trong `$transaction` và trả `409 Conflict` (`POS_TABLE_NOT_AVAILABLE`), rollback toàn bộ giao dịch.

#### `EC-POS-03`: Chuyển đổi 2 chiều giữa Đơn Mang về (`TAKEAWAY`) và Đơn Tại bàn (`DINE_IN`)
- **`MOVE` (Mang về → Bàn trống):** Đổi `order_type = 'DINE_IN'`, gắn `table_id`, `takeaway_number = NULL`, đánh dấu các món hiện có `is_takeaway = TRUE`.
- **`MERGE` (Mang về → Bàn đang ăn):** Chuyển toàn bộ `order_items` sang đơn đích với `is_takeaway = TRUE`, giữ nguyên `kitchen_status`, đóng đơn nguồn `status = 'MERGED'`.
- **`TO_TAKEAWAY` (Tại bàn → Mang về):** Giải phóng bàn nguồn (`AVAILABLE`, `active_order_id = NULL`), đổi `order_type = 'TAKEAWAY'`, cấp `takeaway_number`, reset `is_takeaway = FALSE`.
- **Cấm `SWAP` với đơn `TAKEAWAY`:** Trả `409 Conflict` (`POS_TAKEAWAY_CANNOT_MERGE`).

#### `EC-POS-04`: Chuyển/Gộp bàn khi đơn ĐÃ CÓ món gửi bếp (`kitchen_status = 'PRINTED'`)
- Trả cờ `requireKitchenNoticePrint = true` cùng `kitchenTransferSlip` để tự động in phiếu `THÔNG BÁO ĐỔI BÀN` xuống các trạm bếp bị ảnh hưởng.

#### `EC-POS-05`: Thu ngân Double-Click liên tiếp vào nút "Tách đơn"
- Frontend disable nút khi `isPending = true`; Backend khoá dòng `FOR UPDATE`, request thứ 2+ thấy 0 món `NEW` và trả HTTP `200 OK` idempotent `{ tickets: [] }`.

#### `EC-POS-06`: Huỷ/Sửa món TRƯỚC vs SAU khi bấm "Tách đơn"
- **Nhánh A (`NEW`):** Hard delete hoặc sửa trực tiếp trong DB, không in phiếu báo bếp.
- **Nhánh B (`PRINTED`):** Chuyển sang `CANCELLED`, tính lại tổng tiền (và giảm giá nếu có), tự động in `PHIẾU BÁO HUỶ MÓN` xuống trạm bếp tương ứng.

#### `EC-POS-07`: Bảo mật QR (Wi-Fi/GPS), QR Auto-Cancel & Chống phát lại Web Push cũ khi tỉnh giấc
- **Wi-Fi / GPS Lock:** `QrSecurityService` xác thực IP mạng quán và/hoặc khoảng cách GPS trước khi cho xem menu hoặc gửi đơn QR.
- **QR Auto-Cancel:** `QrAutoCancelService` định kỳ quét (mỗi 10s) để đẩy nhắc quá hạn và tự động huỷ đơn QR `PENDING` hoặc món QR add-on `NEW` quá thời gian cấu hình, phát `order:qr_auto_cancelled`.
- **Stale Push Prevention:** Khi điện thoại nhận Web Push trễ sau Android Doze / iOS Low Power, Service Worker (`sw.js`) gọi `GET /api/v1/public/orders/qr-pending-check` (chỉ trả `{ stillPending: boolean }`) để bỏ qua thông báo nếu thu ngân đã xử lý đơn.

---

### 3.2. Nhóm Hoá đơn, Giảm giá, Mã QR Thanh toán & Dòng tiền

#### `EC-FIN-01`: Huỷ hoá đơn đã thanh toán (`status = 'PAID'` → `'VOIDED'`)
- Bắt buộc quyền `invoices:void` và `voidReason` ≥ 10 ký tự; tự động loại trừ khỏi doanh thu Kết ca và hạn mức Mã QR.

#### `EC-FIN-02`: Thanh toán Hỗn hợp (`SPLIT`)
- Ràng buộc cứng `chk_order_payment_amounts`: `cash_amount > 0`, `transfer_amount > 0`, `cash_amount + transfer_amount = total_amount`. Kết ca chỉ cộng `cash_amount` vào tiền mặt két.

#### `EC-FIN-03`: Thừa (`SURPLUS`) / Thiếu (`SHORTAGE`) tiền két khi Kết ca & Bù chênh lệch
- Khi `discrepancy_amount ≠ 0`, ràng buộc DB `chk_settlement_note_required` bắt buộc có ghi chú giải trình. Quản lý/thu ngân có quyền `cashflow:compensate` có thể thực hiện bù chênh lệch (`POST /cashflow/settlements/:id/compensate`) kèm lý do tối thiểu 3 ký tự.

#### `EC-FIN-04`: Xoay vòng Mã QR Thanh toán khi tất cả đều vượt hạn mức & Khoá sửa tài khoản đã dùng
- Nếu tất cả `payment_accounts` đang bật đều vượt hạn mức, fallback về mã có `priority` cao nhất kèm cảnh báo `qrOverLimit = true` và ghi `AuditLog` (không chặn bán hàng). Nếu không có mã nào đang bật → `409 PAYMENT_QR_NOT_CONFIGURED`.
- Mã QR đã gắn với ít nhất 1 hoá đơn bị khoá sửa `bankCode`/`accountNo` (`409 PAYMENT_QR_LOCKED_FIELD`) và cấm xoá (`409 PAYMENT_QR_IN_USE`).

#### `EC-FIN-05`: Chỉnh sửa PTTT Hoá đơn 2 bước & Blind Mode Kết ca
- Nhân viên chỉ có `invoices:update` (không có `invoices:approve`) khi sửa PTTT hoá đơn `PAID` chỉ ghi nhận vào `pending_payment_edit` chờ quản lý duyệt/từ chối (`POST /invoices/:id/payment-method/review`).
- `GET /api/v1/cashflow/preview` bật `blindMode = true` (trả `null` cho số lý thuyết) với mọi tài khoản không phải `isSuperAdmin`.

#### `EC-FIN-06`: Giảm giá Mã vs Giảm tay & Tính lại khi thay đổi món
- Mọi đơn hàng thoả mãn `chk_order_discount_amounts`: `discount_amount >= 0`, `discount_amount <= subtotal_amount`, `total_amount = subtotal_amount - discount_amount`.
- Khi thêm/bớt/huỷ món trên đơn đang áp mã giảm giá, hệ thống tự động tính lại `discount_amount` (hoặc cảnh báo `NOT_APPLICABLE` / `MIN_ORDER_NOT_MET`). Giảm tay `MANUAL` bắt buộc quyền riêng `pos:manualDiscount`.

---

### 3.3. Nhóm Nhân sự, Lịch làm việc & Bảng lương

#### `EC-HR-01`: Xung đột trùng tên viết tắt (`short_name`)
- Tự động đổi từ `V.Anh` sang `N.V.Anh (#12)` và `T.V.Anh (#15)` để phân biệt rõ trên ma trận bảng công.

#### `EC-HR-02`: Nhân viên bị ngưng hoạt động (`is_deleted = true`) giữa tuần làm việc
- Lịch tuần và bảng lương vẫn truy vấn được bản ghi nhân sự đã nghỉ, hiển thị trạng thái xám mờ `(Đã nghỉ)` không gây crash.

#### `EC-HR-03`: Quên bấm "Lưu" trên Ma trận Lịch làm việc
- Bảo vệ 2 lớp (`beforeunload` + React Router Navigation Blocker) bật modal xác nhận trước khi rời trang.

---

### 3.4. Nhóm Xác thực, Giao diện & Trải nghiệm

#### `EC-AUTH-01`: Đăng nhập đè phiên đang online (Single-Session Conflict) & Đá phiên từ xa
- Nếu tài khoản đang có kết nối socket online trên thiết bị khác và đăng nhập mới không truyền `force: true` → trả `409 AUTH_SESSION_CONFLICT_ONLINE`.
- Khi xác nhận `force: true` hoặc Super Admin gọi `POST /users/:id/revoke-session` → cập nhật `active_session_id` + `last_revoked_notice`, phát `session:revoked` buộc phiên cũ đăng xuất tức thì và hiển thị rõ lý do.

#### `EC-UI-01`: Đăng xuất sạch trên Máy Quầy dùng chung (Hard Invariant 9)
- Gọi `queryClient.clear()`, xoá token/auth state, nhưng giữ nguyên `ui_preferences` trong `localStorage` và DB.

#### `EC-UI-02`: Command Palette (`Ctrl + K`) & Touch Hub lọc tuyệt đối theo RBAC
- Mọi mục điều hướng trong Sidebar, Command Palette và Touch Hub (`/pos/touch/hub`) chỉ hiển thị các màn hình tài khoản có quyền `view === true` (hoặc `isSuperAdmin`).

---

## PHẦN 4: MA TRẬN TRUY VẾT PHÂN HỆ ĐẾN 10 INVARIANTS (TRACEABILITY MATRIX)

| Phân hệ | Inv 1 (Cô lập) | Inv 2 (Takeaway) | Inv 3 (Delta Split) | Inv 4 (Tạm tính) | Inv 5 (Khoá dòng) | Inv 6 (Kết ca) | Inv 7 (MDM) | Inv 8 (401/403) | Inv 9 (UI Prefs) | Inv 10 (Numeric) |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Dashboard (`/dashboard`)** | ✅ | ✅ | — | — | — | ✅ | — | ✅ | — | ✅ |
| **Menu & Bàn (`/menu`)** | ✅ | ✅ | ✅ | — | — | — | ✅ | ✅ | — | ✅ |
| **POS Quầy & Touch (`/pos`, `/pos/touch/*`)** | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | ✅ | ✅ |
| **QR Khách (`/q/:token`, `/qr/:token`)** | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — | — | ✅ |
| **Mã giảm giá (`/discounts`)** | ✅ | — | — | ✅ | ✅ | — | — | ✅ | — | ✅ |
| **Hoá đơn (`/invoices`)** | ✅ | ✅ | — | ✅ | — | ✅ | — | ✅ | — | ✅ |
| **Nhập hàng (`/inventory`)** | ✅ | — | — | — | — | ✅ | ✅ | ✅ | — | ✅ |
| **Dòng tiền (`/cashflow`)** | ✅ | — | — | — | ✅ | ✅ | — | ✅ | — | ✅ |
| **Mã QR Thanh toán (`/payment-qr`)** | ✅ | — | — | ✅ | — | ✅ | — | ✅ | — | ✅ |
| **Nhân sự (`/employees`)** | ✅ | — | — | — | — | — | ✅ | ✅ | — | — |
| **Bảng công (`/schedules`)** | ✅ | — | — | — | — | — | — | ✅ | — | — |
| **Bảng lương (`/payroll`)** | ✅ | — | — | — | — | — | — | ✅ | — | ✅ |
| **Master Data (`/master-data`)** | ✅ | — | — | — | — | — | ✅ | ✅ | — | — |
| **Phân quyền (`/rbac`)** | ✅ | — | — | — | — | — | — | ✅ | — | — |
| **Cài đặt Cửa hàng (`/settings`)** | ✅ | — | — | — | — | — | ✅ | ✅ | ✅ | — |
| **Hồ sơ & Layout (`/profile`)** | ✅ | — | — | — | — | — | — | ✅ | ✅ | — |

---

> **Tài liệu `03-Edge-Cases-And-Invariants.md` (v2.0.0) đã được đồng bộ 100% với mã nguồn thực tế (Stories 01–21).**
