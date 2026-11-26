# BMAD Product Requirements Document (PRD) — Master Specification
# Hệ thống POS & Quản trị Vận hành Cửa hàng Mì Cay (`fnb-spicy-noodle-system`)

> **Tài liệu:** `docs/bmad/01-PRD-Master.md`  
> **Phiên bản:** 2.0.0 (Synced with Production Codebase — Stories 01–21)  
> **Vai trò thực hiện:** BMAD Business Analyst & Product Manager  
> **Trạng thái:** FINAL & SYNCED  
> **Ngày phê duyệt gốc:** 2026-11-07 · **Ngày cập nhật đồng bộ:** 2026-11-26  
> **Phạm vi:** Toàn bộ 16 phân hệ thực tế (Dashboard, POS Quầy & Cảm ứng Touch Shell, QR Mobile, Thực đơn 3 tầng, Mã giảm giá, Hoá đơn, Nhập hàng, Dòng tiền Kết ca, Mã QR Thanh toán, Nhân sự, Lịch làm việc, Bảng tính lương, Master Data, Phân quyền & Phiên, Cài đặt Cửa hàng, Hồ sơ & Giao diện)  
> **Quy chuẩn tuân thủ:** 10 Hard Invariants tại `AGENTS.md` và `.agents/rules/*.md`

---

## 1. TỔNG QUAN SẢN PHẨM & BỐI CẢNH DOANH NGHIỆP

### 1.1. Bối cảnh & Điểm đau Vận hành (Pain Points)
Cửa hàng kinh doanh F&B ẩm thực đặc thù: **Mì cay nhiều cấp độ, đồ ăn vặt chiên nóng, và quầy pha chế nước uống**.
- **Quy mô hoạt động:** 20–30 bàn ăn tại chỗ, khu vực tiếp đón khách mua mang về (tại quầy và QR Mang về), lưu lượng 200–600 đơn hàng/ngày. Giờ cao điểm tập trung từ 18:00 đến 21:30.
- **Mô hình chế biến tách biệt theo trạm bếp (Stations):**
  1. `BEP_NAU`: Mì cay (cấp độ 0–7), bánh mì chảo, lẩu, món nóng.
  2. `BEP_CHIEN`: Khoai tây chiên, cá viên, phô mai que, gà rán, đồ ăn vặt.
  3. `PHA_CHE`: Trà sữa, trà trái cây, sinh tố, đá xay, nước ngọt (hỗ trợ Size M/L).
  4. **Mở rộng động (`BEP_*`):** Chủ quán có thể quản trị thêm trạm bếp vật lý mới qua MDM `KITCHEN_STATION` (định dạng `BEP_[A-Z0-9_]{1,12}`) và cấu hình món `COMBO` tự động phân rã về đúng các trạm thực tế.
- **Điểm nghẽn cũ:** Ghi giấy note tay rồi chép lại thành 3 mẩu giấy gửi xuống 3 bếp → dễ thất lạc, nấu trùng khi gọi thêm món, nhầm bàn khi khách chuyển chỗ; lẫn lộn doanh thu chuyển khoản QR với tiền mặt két; khó thao tác trên máy POS cảm ứng toàn màn hình.

### 1.2. Tầm nhìn & Mục tiêu Sản phẩm (Vision & Objectives)
Xây dựng một hệ thống phần mềm **POS & Quản trị Vận hành (Mini ERP) khép kín, siêu nhẹ, thời gian thực** theo kiến trúc **Modular Monolith trong Turborepo**:
1. **Triệt tiêu 100% giấy note thủ công:** Khách tự quét QR (`/q/:token` hoặc `/qr/:token`, tại bàn hoặc mang về) hoặc nhân viên bấm order trên POS Desktop (`/pos`) / POS Cảm ứng kiểu iPOS (`/pos/touch`); hệ thống tự động phân tách (Delta Split) các món `NEW` xuống đúng trạm bếp trên máy in nhiệt 80mm (Browser `--kiosk-printing`, Android POS USB RawBT `iMin D3-505`, hoặc LAN ESC/POS `:9100` `iPOS.vn iTP6`).
2. **Đối soát Dòng tiền chính xác tuyệt đối:** Công thức kết ca tách bạch Tiền mặt (`CASH` + phần mặt của `SPLIT`) với Chuyển khoản QR (`TRANSFER` + phần CK của `SPLIT`), trừ tự động phiếu chi két (`CASH_DRAWER`), hỗ trợ **Blind Mode** khi đếm tiền, **Bù chênh lệch**, và **Tự động xoay vòng nhiều mã QR thanh toán** theo hạn mức Ngày/Tháng/Năm.
3. **Quản trị Nhân sự, Bảng công & Tính lương tự động:** Bảng công ma trận tuần dạng Excel (`FULL_SHIFT` / `CUSTOM_HOURS`) liên kết trực tiếp sang **Bảng tính lương (`/payroll`)** hỗ trợ `FULL_TIME` và `PART_TIME`.
4. **Cá nhân hoá sâu & Bảo mật vận hành:** Cài đặt cửa hàng động (`/settings`: thương hiệu, logo/favicon, màu sắc, 5 mẫu phiếu in 80mm, danh mục thông báo tuỳ chỉnh, tỷ lệ hiển thị), **Single-Session Login**, **Audit Logs 13 phân hệ**, và cảnh báo đơn QR đa kênh (**Socket.io + Giọng nói tiếng Việt + Web Push VAPID + Tự động huỷ quá hạn**).

---

## 2. CHÂN DUNG NGƯỜI DÙNG & HÀNH TRÌNH TRẢI NGHIỆM (PERSONAS & USER JOURNEYS)

### 2.1. Danh mục Nhân vật (Personas)
1. **Khách hàng QR (`QR_GUEST`):** Quét mã QR dán tại bàn hoặc tại quầy mang về (`/q/:token`, `/qr/:token`), xem thực đơn 3 tầng, chọn cấp độ cay / Size M-L / bỏ đồ mặc định / đổi món chính / thêm topping, theo dõi trạng thái realtime và nhận thông báo tức thời khi thu ngân thao tác trên đơn.
2. **Khách mua mang về / Vãng lai (`WALK_IN_GUEST`):** Gọi trực tiếp tại quầy POS hoặc quét QR Mang về, được cấp số `Mang về #01`, `#02`... tự tăng theo ngày.
3. **Nhân viên Thu ngân (`CASHIER`):** Thao tác trên POS Desktop (`/pos`) hoặc máy POS cảm ứng toàn màn hình (`/pos/touch` + `/pos/touch/hub`). Nhận cảnh báo âm thanh / giọng nói / Web Push khi có đơn QR mới, duyệt đơn, tách bếp, xử lý chuyển/gộp/đổi bàn/chuyển mang về, áp mã giảm giá, in tạm tính VietQR, tách thanh toán, chốt thanh toán, bung két RJ11, nhập hàng và kết ca.
4. **Nhân viên Bếp / Pha chế (`STATION_CHEF`):** Nhận phiếu in nhiệt 80mm tự động cắt rời theo trạm, kèm logo trạm, lượt gọi (`GỌI THÊM - LƯỢT 2`), nhãn `Mang về` cho món gói riêng, phiếu báo đổi bàn và phiếu báo huỷ món.
5. **Quản lý Cửa hàng (`ADMIN` / `ADMIN_VIEW`) & Chủ quán (`SUPER_ADMIN`):** Xem Dashboard tổng quan doanh thu/lợi nhuận/cảnh báo, quản trị thực đơn, mã giảm giá, mã QR thanh toán, duyệt yêu cầu sửa PTTT hoá đơn, huỷ hoá đơn ngoại lệ (`invoices:void`), xếp lịch & tính lương, cấu hình cửa hàng động (`/settings`), quản trị tài khoản & thu hồi phiên từ xa (`/rbac`).

### 2.2. Hành trình Người dùng Cốt lõi (User Journeys)

#### UJ-01: Khách quét QR đặt món, Bảo mật QR, Cảnh báo Đa kênh & Gọi thêm món
```mermaid
sequenceDiagram
    autonumber
    actor Guest as Khách hàng (Bàn 05 / Mang về QR)
    participant Phone as Mobile Web (/q/:token)
    participant Server as NestJS API & Socket.io / WebPush
    actor Cashier as Thu ngân (/pos hoặc /pos/touch)
    participant Printer as Máy in nhiệt 80mm

    Guest->>Phone: Quét mã QR rút gọn /q/:qrToken
    Phone->>Server: GET /api/v1/public/menu?token=qrToken (kèm lat/lng nếu bật GPS)
    Server-->>Phone: Kiểm tra Wi-Fi/GPS -> Trả về Menu 3 tầng + Tuỳ chọn + Store Settings
    Guest->>Phone: Chọn món (Cấp cay / Size M-L / Bỏ đồ mặc định / Đổi món chính) -> Gửi đơn
    Phone->>Server: POST /api/v1/public/orders/qr
    Server->>Server: Tạo đơn status=PENDING (item_source=QR_CODE)
    Server-->>Cashier: Socket.io order:qr_new + Web Push VAPID + Giọng nói tiếng Việt
    Note over Server,Cashier: Nếu thu ngân chưa duyệt quá hạn -> Nhắc định kỳ & QrAutoCancelService tự huỷ
    Cashier->>Server: Bấm [Duyệt đơn] hoặc [Tách đơn] (POST /pos/orders/:id/split-kitchen)
    Server->>Server: Nâng PENDING -> SERVING; Lọc items NEW -> PRINTED, batch_no=1
    Server-->>Printer: In cắt rời phiếu từng trạm (Browser / RawBT USB / LAN :9100)
    Server-->>Phone: Socket.io order:status_updated + qr:order_notice ("Bếp đang chế biến")
```

#### UJ-02: Chuyển / Gộp / Đổi bàn & Chuyển đổi 2 chiều Mang về (`MOVE / MERGE / SWAP / TO_TAKEAWAY`)
- Thực thi qua `POST /api/v1/pos/orders/:id/table-action` trong `prisma.$transaction()` với khoá dòng `SELECT ... FOR UPDATE` (`orders` trước, `dining_tables` sau theo `id ASC` — **Hard Invariant 5**).
- Hỗ trợ đầy đủ 4 hành động:
  - `MOVE`: Bàn → Bàn trống, hoặc Mang về → Bàn trống (gán `is_takeaway = true` trên món sẵn có).
  - `MERGE`: Bàn → Bàn đang ăn, hoặc Mang về → Bàn đang ăn (gán `is_takeaway = true`, giữ nguyên `kitchen_status = 'PRINTED'`).
  - `SWAP`: Hoán đổi 2 bàn đang mở (cấm `SWAP` với đơn `TAKEAWAY` → `409`).
  - `TO_TAKEAWAY`: Chuyển đơn đang ngồi bàn sang Mang về (cấp `takeaway_number`, giải phóng bàn).
- Tự động phát `order:session_redirected` xuống điện thoại khách và in phiếu `THÔNG BÁO ĐỔI BÀN` xuống các trạm bếp nếu đã có món `PRINTED`.

#### UJ-03: Áp Giảm giá, In Tạm tính Xoay vòng VietQR & Thanh toán (Đủ bill hoặc Tách bill)
- Thu ngân có thể áp **Mã giảm giá** (`CODE`) hoặc **Giảm giá thủ công** (`MANUAL`, bắt buộc quyền `pos:manualDiscount`).
- Bấm **In tạm tính** (`POST /api/v1/pos/orders/:id/provisional-bill` hoặc `/split-provisional-bill`):
  - Đơn **giữ nguyên `SERVING`**, bàn giữ nguyên `OCCUPIED` (**Hard Invariant 4**).
  - Tự động xoay vòng `payment_accounts` đang bật theo `priority ASC` và hạn mức Ngày/Tháng/Năm (`+07:00`).
  - Sinh mã VietQR Napas247 chuẩn số tiền sau giảm giá.
- Bấm **Thanh toán** (`POST /api/v1/pos/orders/:id/checkout`) hoặc **Tách thanh toán** (`/split-checkout`):
  - Xác nhận 2 bước, chọn `CASH` / `TRANSFER` / `SPLIT` (ràng buộc `chk_order_payment_amounts`).
  - Chuyển đơn sang `PAID`, giải phóng bàn về `AVAILABLE` (với `checkout` toàn đơn), tăng `discounts.used_count`, và gửi lệnh mở két `RJ11` nếu thanh toán tiền mặt có bật tự động bung két.

---

## 3. ĐẶC TẢ CHI TIẾT 16 PHÂN HỆ THỰC TẾ (FUNCTIONAL REQUIREMENTS)

### 3.1. Phân hệ 1: Bảng điều khiển Tổng quan (`dashboard` — `/dashboard`, `/pos/touch/dashboard`)
- API: `GET /api/v1/dashboard/overview?preset=today|yesterday|7d|month|custom&fromDate=&toDate=` (tối đa 366 ngày).
- **Lọc dữ liệu theo quyền RBAC (`DashboardScope`):** Tự động ẩn/hiện từng khối KPI tùy quyền (`pos`, `invoices`, `inventory`, `cashflow`, `paymentQr`, `discounts`, `schedules`, `payroll`, `dashboard:viewProfit`).
- **Cảnh báo vận hành thời gian thực (`alerts`):** Bàn có đơn QR chờ duyệt quá hạn, yêu cầu sửa PTTT hoá đơn đang chờ duyệt, tài khoản QR sắp/đã chạm hạn mức ngày.
- **Nhóm KPI & Biểu đồ:** Doanh thu thuần & tăng trưởng so với kỳ trước, Két tiền mặt (tuân thủ Blind Mode), Doanh thu chuyển khoản theo từng mã QR, Chi phí nhập kho & tỷ lệ chi phí/doanh thu, Bàn đang mở & món chưa in bếp, Lợi nhuận gộp & ước tính chi phí lương (`dashboard:viewProfit`), Biểu đồ doanh thu theo giờ/ngày & khung giờ cao điểm, Thống kê trạm bếp & cấp độ cay (0–7), Top món bán chạy & topping, Rủi ro (huỷ đơn, huỷ món đã in, giảm giá tay, chuyển/gộp bàn), Nhân sự trực ca hôm nay và Audit Logs gần nhất.

### 3.2. Phân hệ 2: Quản trị Thực đơn 3 tầng động (`menu` — `/menu`, `/pos/touch/menu`, `/pos/touch/stock-status`)
- **Cấu trúc 3 tầng động:**
  1. **Tầng 1 — Khu vực Bếp (`station`):** `BEP_NAU`, `BEP_CHIEN`, `PHA_CHE`, `COMBO` và các trạm mở rộng `BEP_*` quản trị qua `KITCHEN_STATION` (`/api/v1/menu/stations`).
  2. **Tầng 2 — Danh mục món (`category_id`):** Quản trị qua `MENU_CATEGORY` (`/api/v1/menu/categories`), gắn trạm bếp mặc định.
  3. **Tầng 3 — Sản phẩm (`products`):** `name`, `subtitle` (mô tả phụ động), `price` (`NUMERIC(12,2)`), `station`, `is_available` (báo tạm hết 1 chạm), `image_url`, `sort_order`, `combo_items` (phân rã Combo).
- **Engine Tuỳ chọn Món động (`modifier_groups` & `modifiers`):**
  - Nhóm bắt buộc chọn 1 (Cấp độ cay 0–7, Size M / Size L `+5.000đ` tự động cho nhóm đồ uống).
  - Nhóm **Auto-Check (`is_auto_select`)**: Tự tích sẵn đồ ăn mặc định (0đ); bỏ tích sẽ in rõ `Không ...` xuống bếp.
  - Nhóm **Đổi món chính (`allow_substitution` + `default_substitute_name`)**: Bỏ tích món chính (VD: Tôm/Ngao/Mực) tự suy luận đổi sang món thay thế hoặc khoá sang món duy nhất còn lại.
  - Nhóm **Thêm Topping (`extra_price > 0`)**: Có cờ `is_available` riêng cho từng topping để báo tạm hết nguyên liệu thành phần.
- **Nhập / Xuất Excel thực đơn:** `POST /api/v1/menu/products/import-excel` (`menu:import`) và xuất Excel (`menu:export`).
- **Màn Báo hết món 1 chạm (`/pos/touch/stock-status`):** Tối ưu cảm ứng cho quầy POS để bật/tắt `is_available` của món và topping ngay trong giờ cao điểm.

### 3.3. Phân hệ 3: Bán hàng POS Desktop & POS Cảm ứng Touch Shell (`pos-counter` — `/pos`, `/pos/touch/*`)
- **POS Desktop (`/pos`):** Giao diện Split-View (Sơ đồ bàn + Đơn mang về / Thực đơn nhanh + Live Invoice).
- **POS Cảm ứng Touch Shell (`/pos/touch/*` — Stories 20 & 21):**
  - Toàn màn hình kiosk (`data-pos-touch="true"`, Screen Wake Lock), 3 tab sơ đồ bàn (**Tất cả** — đưa ô `+ Đơn mang về mới` & đơn mang về lên đầu trước Bàn 01, **Phòng bàn**, **Mang về**).
  - **Thanh điều hướng đáy 4 nút** (`Bán hàng · Hoá đơn · Kết ca · Quản lý`) tự ẩn khi đang ở màn gọi món/tính tiền (`TouchOrderScreen`).
  - **Trung tâm Quản lý Hub (`/pos/touch/hub`):** Truy cập nhanh 10 màn vận hành quầy ngay trong Touch Shell (`/pos/touch/dashboard`, `/pos/touch/invoices`, `/pos/touch/cashflow`, `/pos/touch/inventory`, `/pos/touch/menu`, `/pos/touch/stock-status`, `/pos/touch/discounts`, `/pos/touch/payment-qr`, `/pos/touch/printer`, `/pos/touch/settings`, `/pos/touch/profile`).
- **Quản lý Bàn & Mã QR:** Thêm/sửa/xoá bàn vật lý (`POST/PUT/DELETE /api/v1/pos/tables`), xoay mã QR từng bàn (`POST /api/v1/pos/tables/:id/rotate-qr`), xoay mã QR Mang về (`POST /api/v1/pos/takeaway-qr/rotate`), rút gọn mã QR cũ (`POST /api/v1/pos/tables/shorten-qr`), xuất/in thẻ QR theo thiết kế động (`qrCard`).
- **Nghiệp vụ Đơn hàng đầy đủ:**
  - 3 nguồn tạo đơn (QR tại bàn / QR mang về → `PENDING`; POS tại bàn / POS mang về → `SERVING`), đánh dấu từng món gói mang về (`order_items.is_takeaway`).
  - Duyệt/từ chối đơn QR (`approve`, `cancel`), chỉnh sửa món (`PATCH /pos/orders/:id/items`), Delta Split 3+ bếp (`split-kitchen`), in lại phiếu bếp (`reprint-kitchen`), thao tác bàn 4 chế độ (`MOVE`, `MERGE`, `SWAP`, `TO_TAKEAWAY`), áp/gỡ giảm giá, in tạm tính / tạm tính tách đơn, thanh toán / tách thanh toán (`checkout`, `split-checkout`).
- **Cảnh báo Đơn QR Đa kênh & Bảo mật QR:**
  - Web Push VAPID (`/api/v1/pos/push/*`) + Service Worker kiểm tra 1-bit `GET /api/v1/public/orders/qr-pending-check` tránh báo lại đơn đã xử lý khi điện thoại tỉnh giấc.
  - Phát giọng nói tiếng Việt (`/api/v1/public/tts` + audio keep-alive mobile).
  - Nhắc quá hạn định kỳ và tự động huỷ đơn/món QR quá hạn (`QrAutoCancelService`).
  - Cấu hình bảo mật QR (`GET/PUT /api/v1/pos/qr-security-config`, quyền `pos:qrSecurity`): khoá theo IP Wi-Fi quán và/hoặc toạ độ GPS Geofence.

### 3.4. Phân hệ 4: Khách Quét QR Gọi món (`qr-order` — `/q/:token`, `/qr/:token`)
- Hỗ trợ cả đường dẫn rút gọn `/q/:token` và `/qr/:token`, cho cả **Bàn vật lý** và **QR Mang về** (dùng `guestSessionToken` riêng cho từng phiên mang về).
- Kết nối Socket.io Dual-Mode (`table_session_{tableId}`, `order_session_{orderId}`) nhận realtime trạng thái đơn, thông báo tức thời từ thu ngân (`qr:order_notice`), tự động đồng bộ chuyển/gộp/đổi bàn (`order:session_redirected`), tự động khoá khi đổi mã QR bàn (`table:qr_rotated`), cập nhật thực đơn (`menu:updated`) và cấu hình cửa hàng (`store-settings:updated`).

### 3.5. Phân hệ 5: Quản lý Mã Giảm giá (`discounts` — `/discounts`, `/pos/touch/discounts`)
- API: `/api/v1/discounts` (`GET`, `POST`, `PUT :id`, `PATCH :id/status`, `DELETE :id`) và POS `/api/v1/pos/orders/:id/applicable-discounts`, `POST/DELETE /api/v1/pos/orders/:id/discount`.
- Loại giá trị: `PERCENT` (có trần `max_discount_amount`) hoặc `FIXED`.
- Phạm vi áp dụng (`scope`): Toàn đơn (`ORDER`), theo Danh mục món (`CATEGORY`), hoặc theo Món ăn cụ thể (`PRODUCT`) qua bảng `discount_targets`.
- Điều kiện linh hoạt: Giá trị đơn tối thiểu (`min_order_amount`), khoảng ngày (`starts_at`–`ends_at`), thứ trong tuần (`active_weekdays`), khung giờ vàng (`time_window_start`–`time_window_end`), giới hạn lượt dùng (`usage_limit` / `used_count`).
- Mã đã dùng sẽ lưu trữ mềm (`is_archived = true`) thay vì xoá cứng để bảo toàn lịch sử hoá đơn.
- **Giảm giá thủ công trên POS (`MANUAL`):** Tách quyền nghiêm ngặt `pos:manualDiscount` (không fallback theo `pos:checkout`).

### 3.6. Phân hệ 6: Quản lý & Tra cứu Hoá đơn (`invoices` — `/invoices`, `/pos/touch/invoices`)
- Base Table TanStack v8 lọc kép (khoảng ngày + từ khoá/trạng thái/PTTT) và xuất Excel (`invoices:export`).
- Xem chi tiết món theo từng lượt gọi (`batch_no`), lịch sử chuyển/gộp bàn (`table_transfer_logs`), snapshot giảm giá và tài khoản QR đã dùng.
- **In lại hoá đơn:** `POST /api/v1/invoices/:id/reprint` (`invoices:reprint`).
- **Quy trình Sửa PTTT 2 bước sau thanh toán:**
  - Nhân viên có quyền `invoices:update` gửi yêu cầu sửa PTTT (`PATCH /api/v1/invoices/:id/payment-method`) → lưu vào `orders.pending_payment_edit` (nếu có sẵn quyền `invoices:approve` sẽ duyệt ngay).
  - Quản lý có quyền `invoices:approve` phê duyệt hoặc từ chối (`POST /api/v1/invoices/:id/payment-method/review`).
- **Huỷ hoá đơn ngoại lệ (`VOID`):** `POST /api/v1/invoices/:id/void` (`invoices:void`), bắt buộc lý do ≥ 10 ký tự; tự động loại trừ khỏi doanh thu Kết ca và hạn mức Mã QR.

### 3.7. Phân hệ 7: Quản lý Nhập hàng Nguyên vật liệu (`inventory` — `/inventory`, `/pos/touch/inventory`)
- API: `GET/POST /api/v1/inventory-imports`, `PUT/DELETE /api/v1/inventory-imports/:id`.
- Base Table hiển thị nguyên liệu, nhà cung cấp (`supplier_mdm_id` + `supplier_name_snapshot`), ĐVT, đơn giá, số lượng, thành tiền (`Đơn giá × Số lượng`), nguồn tiền (`CASH_DRAWER` / `EXTERNAL`), ghi chú; hỗ trợ lọc theo kỳ, sửa phiếu (`inventory:update`), xoá mềm (`is_deleted`, `deleted_at`) và xuất Excel (`inventory:export`).
- Drawer Thêm mới đa dòng tích hợp Smart Combobox gọi `GET /api/v1/mdm/lookup` cho `INGREDIENT`, `SUPPLIER`, `UNIT`, tự chuẩn hoá & tạo mới vào Master Data qua `MdmService.findOrCreate()` (**Hard Invariant 7**).

### 3.8. Phân hệ 8: Ngân sách, Dòng tiền & Đối soát Kết ca (`cashflow` — `/cashflow`, `/pos/touch/cashflow`)
- **Công thức Kết ca Bất biến (Hard Invariant 6):**
  $$\text{expected\_cash\_in\_drawer} = \text{opening\_budget} + \sum_{\substack{\text{status}=\text{'PAID'} \\ \text{method}\in\{\text{'CASH'},\text{'SPLIT'}\}}} \text{cash\_amount} - \sum_{\substack{\text{source}=\text{'CASH\_DRAWER'} \\ \text{is\_deleted}=\text{false}}} \text{total\_cost}$$
  $$\text{discrepancy\_amount} = \text{actual\_counted\_cash} - \text{expected\_cash\_in\_drawer}$$
  - **CẤM** cộng doanh thu chuyển khoản (`TRANSFER` hoặc `transfer_amount` của `SPLIT`), đơn `VOIDED`, hoặc trừ phiếu nhập `EXTERNAL`.
- **Blind Mode (`GET /api/v1/cashflow/preview`):** Thu ngân đếm tiền theo bảng 9 mệnh giá (`500k`..`1k`) mà không thấy trước số tiền lý thuyết để chống gian lận; Super Admin thấy đầy đủ.
- **Chốt ca (`POST /api/v1/cashflow/settle`):** Khoá duy nhất theo `(settlement_date, shift_name)`, bắt buộc ghi chú khi `discrepancy_amount ≠ 0`, tính rõ tiền giữ lại két (`cashRetainedInDrawer`) và tiền nộp chủ (`cashToHandOver`).
- **Bù chênh lệch kết ca (`POST /api/v1/cashflow/settlements/:id/compensate`):** Dành cho quyền `cashflow:compensate` để ghi nhận bù tiền thiếu và lưu vết kiểm toán.
- **Cấu hình ngân sách đầu ca (`PUT /api/v1/cashflow/default-budget`):** Chỉ quyền `cashflow:config`. Hỗ trợ xuất Excel lịch sử kết ca (`cashflow:export`).

### 3.9. Phân hệ 9: Quản lý Mã QR Thanh toán & Xoay vòng (`payment-qr` — `/payment-qr`, `/pos/touch/payment-qr`)
- API: `/api/v1/payment-qr` (`GET`, `GET :id/orders`, `POST`, `PUT reorder`, `PUT :id`, `DELETE :id`).
- Quản lý nhiều tài khoản ngân hàng VietQR theo `priority ASC`, cấu hình hạn mức `daily_limit`, `monthly_limit`, `yearly_limit`, xem doanh thu thực tế từng kỳ và danh sách hoá đơn gắn với từng mã QR.
- Mã QR đã phát sinh hoá đơn bị khoá đổi `bankCode`/`accountNo` (`409 PAYMENT_QR_LOCKED_FIELD`) và không cho xoá cứng (`409 PAYMENT_QR_IN_USE`).

### 3.10. Phân hệ 10: Quản lý Hồ sơ Nhân sự (`employees` — `/employees`)
- API: `/api/v1/employees` (`GET`, `GET :id`, `POST`, `PUT :id`, `PATCH :id/status`, `DELETE :id`, `DELETE :id/permanent`).
- Liên kết 1-1 với tài khoản đăng nhập `users` (hiển thị trạng thái tài khoản liên kết ngay trên danh sách nhân sự, cho phép tạo kèm tài khoản khi thêm nhân sự).
- Thuật toán tự sinh tên viết tắt `short_name` kèm chống trùng lặp (`N.V.Anh (#12)`).
- Hỗ trợ tạm ngưng / khôi phục nhân sự (`is_deleted`, `deleted_at`), xoá vĩnh viễn khi chưa có phát sinh, và xuất Excel (`employees:export`).

### 3.11. Phân hệ 11: Bảng tính Ngày công / Lịch làm việc Tuần (`schedules` — `/schedules`)
- API: `GET /api/v1/schedules`, `PUT /api/v1/schedules/bulk-save`, `POST /api/v1/schedules/copy-previous-week`.
- Ma trận 7 ngày (`0..6`) × N khung giờ; mỗi nhân viên trong ô hỗ trợ 2 chế độ chấm công: **`FULL_SHIFT`** (đủ ca) hoặc **`CUSTOM_HOURS`** (nhập `startTime`–`endTime` thực tế).
- Bảo vệ 2 lớp chống mất dữ liệu chưa lưu (`beforeunload` + React Router Blocker), đồng bộ realtime qua `schedule:updated` và xuất Excel (`schedules:export`).

### 3.12. Phân hệ 12: Bảng tính Lương (`payroll` — `/payroll`)
- API: `GET /api/v1/payroll?fromDate=&toDate=`, `PUT /api/v1/payroll/config`, `PUT /api/v1/payroll/employees/:employeeId`.
- Tự động tổng hợp số công `FULL_SHIFT` và giờ lẻ `CUSTOM_HOURS` từ `work_schedules` trong kỳ.
- Hỗ trợ 2 hình thức trả lương: **`FULL_TIME`** (lương cơ bản mặc định `7.000.000đ` / `28` công chuẩn / `12` giờ/ngày) và **`PART_TIME`** (đơn giá giờ mặc định `25.000đ/giờ`).
- Cho phép tuỳ chỉnh mức lương riêng, ghi đè công/giờ thực tế, cộng/trừ thưởng phạt (`bonusOrAdjustment`), ghi chú, đồng bộ realtime (`payroll:updated`) và xuất Excel (`payroll:export`).

### 3.13. Phân hệ 13: Quản trị Master Data (`master-data` — `/master-data`)
- Quản trị tập trung **7 danh mục người dùng** (`POSITION`, `SPECIALTY`, `INGREDIENT`, `UNIT`, `SUPPLIER`, `MENU_CATEGORY`, `KITCHEN_STATION`) với chuẩn hoá tự động `MdmService.findOrCreate()` (**Hard Invariant 7**) và Composite Unique `(category, normalized_name)`.
- Tách bạch hoàn toàn `GET /api/v1/mdm/lookup` (`JwtAuthGuard` — mở cho mọi tài khoản đăng nhập) với CRUD `/api/v1/mdm` (`mdm:view|create|update|delete` — **Hard Invariant 8**).

### 3.14. Phân hệ 14: Phân quyền Hệ thống, Tài khoản & Quản trị Phiên (`rbac` — `/rbac`)
- API: `GET /api/v1/users`, `POST /api/v1/users`, `PUT /api/v1/users/:id`, `PUT /api/v1/users/:id/permissions`, `POST /api/v1/users/:id/reset-password`, `GET /api/v1/users/:id/session-history`, `POST /api/v1/users/:id/revoke-session`.
- **Tách biệt 2 Drawer quản trị:** Drawer **Thông tin tài khoản** (sửa `username`, `roleLabel`, nhân viên liên kết, trạng thái `isActive`) và Drawer **Phân quyền chi tiết** (ma trận 14 phân hệ + sub-permissions, đẩy realtime qua `account:permissions_updated`).
- **Single-Session Security:** Theo dõi trạng thái online/IP/thiết bị phiên hiện tại, lịch sử đăng nhập/đá phiên (`session-history`), và nút thu hồi phiên từ xa (`revoke-session` → phát `session:revoked`).
- Tài khoản `is_super_admin = true` luôn có toàn quyền và bị khoá readonly trên UI.

### 3.15. Phân hệ 15: Cài đặt Cửa hàng Động (`store-settings` — `/settings`, `/pos/touch/settings`)
- API: `GET /api/v1/public/store-settings`, `GET /api/v1/public/store-assets/:kind`, `GET/PUT /api/v1/settings`, `PUT/DELETE /api/v1/settings/assets/:kind`, `GET /api/v1/store-messages`.
- Quản trị động (lưu trong `master_data` `SYSTEM_CONFIG`, phát realtime `store-settings:updated`, có optimistic locking `expectedUpdatedAt`):
  1. **Thương hiệu & Tài nguyên ảnh:** Tên quán, subtitle, mô tả, tải lên `logo`, `favicon`, `qr-logo` (PNG/JPEG/WebP).
  2. **Màu sắc & Giao diện:** Màu thương hiệu (`brandColor`), màu chữ chính, màu chữ nhấn (`accentTextColor`), màu đơn giá (`priceColor`) riêng cho Sáng/Tối, theme mặc định, tỷ lệ hiển thị (`displayScale`: 80%–150% toàn cục / theo trang / trang QR).
  3. **Trang QR & Thẻ in QR (`qr`, `qrCard`):** Tên/mô tả/lời chào/theme riêng trang QR, tuỳ biến thẻ in QR bàn & mang về.
  4. **Tuỳ chỉnh 5 Mẫu Phiếu in Nhiệt 80mm (`printTemplates`):** `provisional`, `official`, `kitchen`, `kitchenCancel`, `tableTransfer` (tiêu đề, footer, cỡ chữ `6pt–16pt` bước `0.5pt`, bật/tắt từng khối nội dung, chọn danh mục hiện giá trên phiếu bếp).
  5. **Danh mục Thông báo Tuỳ chỉnh (`messages` / `store-messages`):** Cho phép tuỳ biến nội dung thông báo POS, QR và cấu hình giọng nói/nhắc đơn/tự huỷ QR.
  6. **Cấu hình Menu & Tiêu đề Trang (`navLabels`, `navGroupLabels`, `navOrder`, `navGroupOrder`, `pageHeaders`)** và tích hợp cấu hình máy in vật lý + bảo mật QR.

### 3.16. Phân hệ 16: Navbar, Hồ sơ Cá nhân, Audit Logs & Tuỳ biến Giao diện (`profile`, `layout` — `/profile`, `/pos/touch/profile`)
- **Navbar:** Command Palette (`Ctrl+K` / `Cmd+K`, lọc theo RBAC), chuyển nhanh POS Cảm ứng, thông báo âm thanh/Web Push, chuyển Theme Sáng/Tối, Menu Tài khoản (`Hồ sơ`, `Đăng xuất`).
- **Hồ sơ Cá nhân (`/profile`):** Cập nhật thông tin cá nhân & ngân hàng (đồng bộ về `employees`), tải lên/xoá Avatar (`/api/v1/profile/avatar` phục vụ công khai qua `/api/v1/public/avatars/:employeeId`), đổi mật khẩu (`PATCH /api/v1/profile/password` giữ nguyên phiên hiện tại & thu hồi phiên cũ nếu có), xem thông tin phiên hiện tại và nút **Khôi phục toàn bộ cài đặt giao diện cá nhân**.
- **UI Preferences (Hard Invariant 9):** Lưu `theme`, `sidebarWidth`, `columnWidths`, `displayScale`, `navOrder`, `navGroupOrder`, `sidebarCollapsed`, `voiceAlertEnabled` ở cả `localStorage` và `users.ui_preferences`, đồng bộ đa thiết bị qua `account:preferences_updated`, và **KHÔNG xoá khi đăng xuất** (chỉ gọi `queryClient.clear()` và xoá token/auth state).
- **Nhật ký Kiểm toán (`GET /api/v1/audit-logs/:module`):** Mỗi phân hệ quản trị đều có Drawer xem lịch sử thao tác chuẩn hoá theo 13 module (`POS`, `DISCOUNTS`, `MENU`, `INVOICES`, `INVENTORY`, `CASHFLOW`, `PAYMENT_QR`, `EMPLOYEES`, `SCHEDULES`, `PAYROLL`, `MDM`, `RBAC`, `SETTINGS`).

---

## 4. QUY CHUẨN IN NHIỆT KHỔ 80MM & PHẦN CỨNG VẬT LÝ (STORY 16 & 19)

### 4.1. Ba chế độ in nhiệt 80mm được hỗ trợ
1. **In qua Trình duyệt (`BROWSER`):** Dùng `#thermal-print-container` với `@page { size: 80mm auto; margin: 0; }`, `break-after: page` và Chrome/Edge `--kiosk-printing`.
2. **Cáp USB trực tiếp trên Android POS (`RAWBT`):** Thiết kế cho máy POS **iMin D3-505 (Android 11)** nối cáp USB-B tới máy in nhiệt **iPOS.vn iTP6** (khổ 80mm / 576 dots) thông qua RawBT Print Service, gửi byte ESC/POS chuẩn (hỗ trợ cắt giấy tự động và lệnh mở két `ESC p`).
3. **Dây mạng LAN ESC/POS (`LAN_ESCPOS`):** Gửi qua `POST /api/v1/pos/print/lan-escpos` (`ThermalLanPrintService`) trực tiếp tới địa chỉ IP máy in cổng TCP `:9100`, hỗ trợ cả **bung két đựng tiền RJ11 (24V)** có bảo vệ quyền `pos:openCashDrawer` và xác nhận 2 bước.

### 4.2. Năm mẫu phiếu in nhiệt chuẩn (Tuỳ biến được trong `/settings`)
1. **Phiếu Tách Bếp (`kitchen`):** Cắt rời từng trạm (`BEP_NAU`, `BEP_CHIEN`, `PHA_CHE`, `BEP_*`), logo trạm, bàn/số mang về, lượt gọi (`GỌI THÊM - LƯỢT N`), nhãn `[MANG VỀ]` nếu món gói riêng, tuỳ chọn/đổi món/ghi chú.
2. **Phiếu Báo Huỷ Món (`kitchenCancel`):** In ngay xuống trạm bếp khi huỷ món đã `PRINTED`, kèm số lượng huỷ và lý do.
3. **Phiếu Thông Báo Đổi Bàn (`tableTransfer`):** In ngay khi `MOVE`/`MERGE`/`SWAP`/`TO_TAKEAWAY` trên đơn đã có món `PRINTED`.
4. **Phiếu Tạm Tính (`provisional`):** Gồm danh sách món, tạm tính, giảm giá, tổng thanh toán và **mã VietQR Napas247 động** từ tài khoản xoay vòng (giữ nguyên trạng thái `SERVING`).
5. **Hoá Đơn Thanh Toán Chính Thức (`official`):** In sau khi chốt `PAID`, hiển thị chi tiết PTTT (`CASH` / `TRANSFER` / `SPLIT`), giảm giá và lời cảm ơn.

---

## 5. RÀNG BUỘC KỸ THUẬT & YÊU CẦU PHI CHỨC NĂNG (NFR)

### 5.1. Kiểu Tiền tệ Bắt buộc (Hard Invariant 10)
- 100% cột tiền tệ trên PostgreSQL dùng `NUMERIC(12, 2)` và Prisma dùng `@db.Decimal(12, 2)`. **CẤM** dùng `FLOAT`, `DOUBLE`, `REAL` hoặc `INT`.

### 5.2. Hiệu năng, Tìm kiếm & Triển khai
- **Độ trễ API nội bộ POS:** $\le 50\text{ ms}$; tốc độ gửi lệnh in nhiệt $\le 500\text{ ms}$; kéo giãn cột bảng & sidebar 60 FPS.
- **Tìm kiếm tiếng Việt không dấu:** Sử dụng extension PostgreSQL `unaccent` và hàm `f_search_norm(text)` (tách biệt với `master_data.normalized_name` của Invariant 7).
- **Triển khai Production:** Docker Compose gồm 3 container (`postgres:16-alpine`, `api-server`, `caddy` làm reverse proxy + phục vụ static web-app + TLS tự động), kèm kiểm tra sức khoẻ `/api/v1/health` và giới hạn tài nguyên chuẩn.

---

> **Tài liệu PRD Master Specification (v2.0.0) đã được đồng bộ 100% với mã nguồn thực tế (Stories 01–21).**
