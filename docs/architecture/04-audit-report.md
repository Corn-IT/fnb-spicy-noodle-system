# Báo Cáo Kiểm Định Kiến Trúc & Đối Chiếu Chéo Toàn Dự Án (Architecture Audit & Sync Report)
# Hệ thống POS & Quản trị Vận hành Quán Mì Cay (`fnb-spicy-noodle-system`)

> **Tài liệu:** `docs/architecture/04-audit-report.md`  
> **Phiên bản:** 2.0.0 (Phase 2 Verified Baseline + Post-Implementation System Sync)  
> **Vai trò thực hiện:** Principal System Architect & QA Auditor  
> **Trạng thái:** **PASSED & SYNCED WITH PRODUCTION CODEBASE (Stories 01–21)**  
> **Ngày kiểm định gốc (Phase 2):** 2026-11-07  
> **Ngày rà soát đồng bộ toàn hệ thống:** 2026-11-26  
> **Tài liệu đối chiếu đầu vào:**
> - Mã nguồn thực tế: `apps/api-server/prisma/schema.prisma` (18 bảng, 16 migrations), `apps/api-server/src/app.module.ts` (15 modules), `packages/shared/src/` (Zod schemas & enums), `apps/web-app/src/router.tsx` (16 features)
> - Bộ đặc tả BMAD: `docs/bmad/01-PRD-Master.md`, `docs/bmad/02-RBAC-And-MDM-Matrix.md`, `docs/bmad/03-Edge-Cases-And-Invariants.md`
> - Bộ Stories: `docs/stories/story-01` → `story-21`
> - Hiến pháp kỹ thuật: `AGENTS.md` và `.agents/rules/00..07-*.md`  
> **Tài liệu kiến trúc đầu ra:**
> - `docs/architecture/01-verified-erd.mmd` (18 bảng vật lý đồng bộ Prisma Schema)
> - `docs/architecture/02-verified-state-machines.mmd`
> - `docs/architecture/03-verified-sequences.mmd`

---

## 1. TÓM TẮT ĐIỀU HÀNH (EXECUTIVE SUMMARY)

Tài liệu này lưu giữ đầy đủ kết quả kiểm định chéo (Cross-Verification Audit) của **Phase 2 (15 điểm vênh nền tảng đã xử lý triệt để trước khi code)** và bổ sung **Bản Đồng bộ Kiến trúc Thực tế (2026-11-26)** sau khi toàn bộ hệ thống đã được triển khai mở rộng từ **Story 01 đến Story 21**.

### 1.1. Tổng kết Kiểm định Nền tảng (Phase 2 — 15/15 PASS)

| Hạng mục Kiểm định Chéo | Số điểm vênh phát hiện | Đã xử lý chuẩn hoá | Trạng thái Nghiệm thu |
|:---|:---:|:---:|:---:|
| **1. ERD & Database Constraints vs PRD Base Tables** | 6 | 6 / 6 | **PASS (100%)** |
| **2. Công thức Kết ca vs Hoá đơn & Nhập hàng** | 1 | 1 / 1 | **PASS (100%)** |
| **3. State Machines vs Sequence Diagrams & Concurrency Locking** | 5 | 5 / 5 | **PASS (100%)** |
| **4. REST API & WebSocket Contracts vs RBAC Matrix (401/403 & Lookup)** | 3 | 3 / 3 | **PASS (100%)** |
| **TỔNG CỘNG (PHASE 2 BASELINE)** | **15** | **15 / 15** | **VERIFIED** |

### 1.2. Tổng quan Quy mô Hệ thống Thực tế (Post-Implementation Sync — 2026-11-26)

| Thành phần Kiến trúc | Phase 2 Baseline (2026-11-07) | Thực tế Codebase Hiện tại (2026-11-26) |
|:---|:---|:---|
| **Database Tables (`schema.prisma`)** | 13 bảng cốt lõi | **18 bảng vật lý** (+ `payment_accounts`, `discounts`, `discount_targets`, `audit_logs`, `push_subscriptions`) qua **16 Prisma migrations** |
| **Backend NestJS Modules (`app.module.ts`)** | 7 modules nền tảng | **15 modules** (`Prisma`, `AuditLog`, `Realtime`, `Health`, `Iam`, `Mdm`, `Menu`, `PaymentQr`, `Discounts`, `Pos`, `Inventory`, `Cashflow`, `HrSchedule`, `StoreSettings`, `Dashboard`) |
| **Frontend Features (`apps/web-app/src/features/`)** | 10 modules (0–9) | **16 features độc lập** (tuân thủ Invariant 1): `dashboard`, `pos-counter` (gồm Desktop `/pos` & Touch Shell `/pos/touch/*`), `qr-order`, `menu`, `discounts`, `invoices`, `inventory`, `cashflow`, `payment-qr`, `employees`, `schedules`, `payroll`, `master-data`, `rbac`, `store-settings`, `profile` |
| **RBAC Permission Modules (`rbac.schema.ts`)** | 9 nhóm quyền | **14 nhóm quyền chi tiết** (kèm normalizer tương thích ngược legacy keys `mdm:write`, `rbac:manage`) |
| **MDM Categories (`MdmCategory`)** | 4–5 danh mục | **7 danh mục người dùng** (`POSITION`, `SPECIALTY`, `INGREDIENT`, `UNIT`, `SUPPLIER`, `MENU_CATEGORY`, `KITCHEN_STATION`) + nhóm nội bộ `SYSTEM_CONFIG` |
| **Realtime WebSocket (`PosSocketGateway`)** | 5 sự kiện cơ bản | **15 sự kiện Socket.io** trên namespace `/pos` + **Web Push VAPID** (`push_subscriptions`) |
| **Print & Hardware Channels** | Browser `--kiosk-printing` | **3 chế độ in 80mm** (Browser Kiosk, Android POS USB RawBT `iMin D3-505`, LAN ESC/POS `:9100` `iPOS.vn iTP6`) + **Bung két tiền RJ11** |

---

## 2. DANH MỤC 15 ĐIỂM VÊNH PHASE 2 ĐÃ PHÁT HIỆN VÀ XỬ LÝ CHUẨN HOÁ

### 2.1. Nhóm A: Cơ sở Dữ liệu & Physical ERD (`DISCREPANCY-DB-01` → `06`)
- **`DISCREPANCY-DB-01` (`combo_items`):** Đã chuẩn hoá bảng trung gian `combo_items` (`parent_product_id`, `child_product_id`, `quantity`, CHECK `parent_product_id <> child_product_id`) trong `schema.prisma` và `01-verified-erd.mmd`.
- **`DISCREPANCY-DB-02` (`products` ↔ `modifier_groups`):** Chuẩn hoá quan hệ 1-N `modifier_groups.product_id` (`ON DELETE CASCADE`) kèm `max_select`, và mở rộng thêm `is_auto_select`, `allow_substitution`, `modifiers.is_default_checked`, `is_available`, `default_substitute_name`.
- **`DISCREPANCY-DB-03` (`work_schedules` JSONB Matrix):** Dùng duy nhất bảng `work_schedules` (`week_start_date`, `day_of_week 0..6`, `time_slot`, `employee_ids JSONB` hỗ trợ cả `FULL_SHIFT` và `CUSTOM_HOURS`), kèm `UNIQUE(week_start_date, day_of_week, time_slot)`.
- **`DISCREPANCY-DB-04` (Cột hiển thị UI ↔ DB 1-1):** Đã bổ sung đầy đủ cột trên `employees`, `inventory_imports`, `cash_drawer_settlements`, `orders` và giữ đồng bộ hoàn toàn với Prisma Schema.
- **`DISCREPANCY-DB-05` (`master_data` Composite UK):** Áp dụng `uq_mdm_category_normalized (category, normalized_name)`.
- **`DISCREPANCY-DB-06` (`dining_tables` không chứa bàn "Mang về"):** Enforce bằng `chk_order_type_target` và `idx_one_active_order_per_table`.

### 2.2. Nhóm B: Nghiệp vụ Tài chính & Công thức Kết ca (`DISCREPANCY-FIN-01`)
- **`DISCREPANCY-FIN-01` (Kết ca có đơn `SPLIT`):**
  - Chuẩn hoá ràng buộc `chk_order_payment_amounts` cho `CASH`, `TRANSFER`, `SPLIT`.
  - Truy vấn kết ca tách riêng:
    - `total_cash_sales = SUM(CASE WHEN payment_method='CASH' THEN total_amount WHEN payment_method='SPLIT' THEN cash_amount ELSE 0 END)` (`status = 'PAID'`).
    - `total_transfer_sales = SUM(CASE WHEN payment_method='TRANSFER' THEN total_amount WHEN payment_method='SPLIT' THEN transfer_amount ELSE 0 END)` (chỉ để đối soát sao kê, **CẤM** cộng vào `expected_cash_in_drawer`).
  - Mở rộng thêm trong triển khai thực tế: **Blind Mode** ở `GET /api/v1/cashflow/preview` (ẩn số lý thuyết với thu ngân, chỉ hiển thị đầy đủ với Super Admin) và nghiệp vụ **Bù chênh lệch kết ca** (`POST /api/v1/cashflow/settlements/:id/compensate`, quyền `cashflow:compensate`).

### 2.3. Nhóm C: State Machine, Concurrency & Idempotency (`DISCREPANCY-SM-01` → `04` & `LOCK-01`)
- **`DISCREPANCY-SM-01`:** 3 trạng thái bàn `AVAILABLE`, `PENDING`, `OCCUPIED`.
- **`DISCREPANCY-SM-02`:** `split-kitchen` tự nâng đơn QR `PENDING` → `SERVING` và bàn `PENDING` → `OCCUPIED` nguyên tử trong cùng transaction; hỗ trợ thêm endpoint riêng `POST /api/v1/pos/orders/:id/approve` và cơ chế tự động huỷ đơn/món QR quá hạn (`QrAutoCancelService`).
- **`DISCREPANCY-SM-03`:** Bảo toàn `kitchen_status = 'PRINTED'` khi `MOVE`/`MERGE`/`SWAP`/`TO_TAKEAWAY`; tách rõ nhánh huỷ món `NEW` (xoá cứng) vs `PRINTED` (chuyển `CANCELLED` + in phiếu báo huỷ).
- **`DISCREPANCY-SM-04`:** `POST /api/v1/pos/orders/:id/split-kitchen` trả HTTP `200 OK` idempotent `{ tickets: [] }` khi không có món `NEW`.
- **`DISCREPANCY-LOCK-01`:** Khoá dòng theo thứ tự **`orders` (`ORDER BY id ASC FOR UPDATE`) → `dining_tables` (`ORDER BY id ASC FOR UPDATE`)** chống AB-BA Deadlock.

### 2.4. Nhóm D: RBAC, WebSocket Auth & Môi trường (`DISCREPANCY-RBAC-01`, `WS-01`, `ENV-01`)
- **`DISCREPANCY-RBAC-01`:** Chuẩn hoá `UserPermissionsSchema` (14 modules) với `@RequirePermission`, `@RequireAnyPermission`, `@SuperAdminOnly` trong `RbacGuard`. Sub-permissions `pos:splitKitchen|tableAction|checkout` có tương thích ngược với `pos:create|update` khi trường chưa khai báo; riêng `pos:manualDiscount`, `pos:qrSecurity`, `pos:openCashDrawer` kiểm tra nghiêm ngặt không fallback.
- **`DISCREPANCY-WS-01`:** `PosSocketGateway` (`/pos`) triển khai xác thực hai chế độ (Staff JWT kèm kiểm tra `active_session_id` single-session vs QR Guest dùng `qrToken` bàn hoặc `Takeaway QR + guestSessionToken`) và kiểm tra CORS Origin nghiêm ngặt.
- **`DISCREPANCY-ENV-01`:** `env.config.ts` hỗ trợ đồng thời tiền tố `FNB_*` và biến chuẩn (`FNB_DATABASE_URL ?? DATABASE_URL`, `FNB_JWT_SECRET ?? JWT_SECRET`, `FNB_PORT ?? PORT`, `FNB_CORS_ORIGIN ?? CORS_ORIGIN`).

---

## 3. CÁC THAY ĐỔI KIẾN TRÚC ĐÃ ĐỒNG BỘ TRONG ĐỢT RÀ SOÁT (2026-11-26)

Trong quá trình rà soát toàn bộ mã nguồn so với hồ sơ Phase 2, phát hiện và đã đồng bộ 7 thay đổi kiến trúc quan trọng đã được triển khai từ Story 13 đến Story 21:

1. **Bổ sung 4 bảng vật lý mới & chỉnh cột thực tế trong `01-verified-erd.mmd`:**
   - Thêm đầy đủ thực thể `DISCOUNTS`, `DISCOUNT_TARGETS`, `AUDIT_LOGS`, `PUSH_SUBSCRIPTIONS`.
   - Loại bỏ cột ảo `payment_accounts.bank_name` (không có trong `schema.prisma`; tên ngân hàng được ánh xạ từ `packages/shared/src/constants/vietqr-banks.ts` qua `bank_code`).
   - Bổ sung các cột đã thêm qua migrations: `users` (`role_label`, `active_session_*`, `last_revoked_notice`), `employees.deleted_at`, `products` (`subtitle`, `category_id`), `modifier_groups` (`is_auto_select`, `allow_substitution`), `modifiers` (`is_default_checked`, `is_available`, `default_substitute_name`), `orders` (`subtotal_amount`, `discount_amount`, `discount_id`, `discount_snapshot`, `pending_payment_edit`), `order_items` (`item_source`, `is_takeaway`), `inventory_imports` (`supplier_mdm_id`, `supplier_name_snapshot`, `deleted_at`).
2. **Cập nhật Chuyển đổi 2 chiều `TAKEAWAY <-> DINE_IN` (`EC-POS-03`):**
   - `TableActionType` hiện có 4 hành động: `MOVE`, `MERGE`, `SWAP`, `TO_TAKEAWAY`.
   - Đơn `TAKEAWAY` **được phép** `MOVE` vào bàn trống hoặc `MERGE` vào bàn đang ăn (món được đánh dấu `is_takeaway = true`); đơn `DINE_IN` được phép `TO_TAKEAWAY` ra mang về. Chỉ cấm `SWAP` đối với `TAKEAWAY`.
3. **Bổ sung Quản trị Thanh toán & Doanh thu mở rộng:**
   - **Tách thanh toán (`split-checkout` / `split-provisional-bill`)** cho phép khách tách một phần món ra thanh toán riêng mà không đóng đơn gốc.
   - **Xoay vòng Mã QR Thanh toán (`payment_accounts`)** tự động chọn tài khoản theo `priority ASC` và hạn mức Ngày/Tháng/Năm múi giờ `+07:00`, fallback về ưu tiên #1 khi tất cả vượt hạn mức kèm cờ cảnh báo `qrOverLimit`.
   - **Duyệt sửa Phương thức thanh toán trên Hoá đơn (`pending_payment_edit`)** theo quy trình 2 bước (`invoices:update` gửi yêu cầu → `invoices:approve` duyệt/từ chối).
4. **Bổ sung Bảo mật Single-Session & Nhật ký Kiểm toán (`audit_logs`):**
   - Mỗi tài khoản chỉ duy trì 1 `active_session_id` hoạt động đồng thời; đăng nhập mới khi phiên cũ đang online trả `409 AUTH_SESSION_CONFLICT_ONLINE` nếu chưa có cờ `force: true`, sau đó phát `session:revoked` đá phiên cũ tức thì.
   - Mọi thao tác nghiệp vụ ghi `audit_logs` theo 13 module; IP & thiết bị chỉ hiển thị cho Super Admin.
5. **Bổ sung Hệ thống Cảnh báo Đơn QR Đa kênh & Chống trễ di động:**
   - Kết hợp Socket.io (`/pos`), giọng nói tiếng Việt (`/api/v1/public/tts` + tài nguyên audio tĩnh), Web Push VAPID (`/api/v1/pos/push/*`), kiểm tra 1-bit `GET /api/v1/public/orders/qr-pending-check` từ Service Worker để tránh phát lại thông báo cũ khi điện thoại tỉnh giấc, và `QrAutoCancelService` tự động nhắc quá hạn / tự huỷ đơn QR chưa duyệt.
6. **Bổ sung Cài đặt Cửa hàng Động (`StoreSettingsModule`), Bảng tính lương (`PayrollController`) & Tổng quan (`DashboardModule`):**
   - Cấu hình thương hiệu, logo/favicon/qr-logo lưu trong `master_data` (`SYSTEM_CONFIG`), bảng màu, tiêu đề trang, 5 mẫu phiếu in 80mm, danh mục thông báo tuỳ biến (`store-messages`), và tỷ lệ hiển thị (`displayScale`).
   - Bảng tính lương tự động tổng hợp từ `work_schedules` (`FULL_SHIFT` / `CUSTOM_HOURS`), hỗ trợ `FULL_TIME` & `PART_TIME`.
   - Dashboard tổng quan lọc phạm vi theo quyền RBAC (`DashboardScope`), tích hợp KPI doanh thu, két tiền (Blind Mode), chuyển khoản theo QR, bếp/cấp cay, tồn kho, nhân sự trực ca và cảnh báo thời gian thực.
7. **Bổ sung Giao diện POS Cảm ứng Toàn màn hình (`/pos/touch/*` — Stories 20 & 21) & In vật lý đa nền tảng (Story 19):**
   - Touch Shell 4 nút đáy (`Bán hàng · Hoá đơn · Kết ca · Quản lý`), sơ đồ bàn 3 tab (`Tất cả / Phòng bàn / Mang về`), màn Báo hết món 1 chạm (`/pos/touch/stock-status`), màn Máy in & Két tiền (`/pos/touch/printer`) và endpoint `POST /api/v1/pos/print/lan-escpos`.

---

## 4. ĐỐI CHIẾU TỔNG HỢP 16 PHÂN HỆ FRONTEND ↔ BACKEND ↔ DATABASE

| # | Phân hệ / Route Frontend | NestJS Module & API Prefix | Bảng DB Chính | Nhóm Quyền RBAC | Trạng thái |
|:-:|:---|:---|:---|:---|:---:|
| 1 | **Tổng quan** (`/dashboard`, `/pos/touch/dashboard`) | `DashboardModule` (`/api/v1/dashboard/*`) | Tổng hợp `orders`, `inventory_imports`, `cash_drawer_settlements`, `work_schedules`, `audit_logs` | `dashboard` | **SYNCED** |
| 2 | **POS Quầy & Cảm ứng** (`/pos`, `/pos/touch/*`) | `PosModule` (`/api/v1/pos/*`) | `dining_tables`, `orders`, `order_items`, `push_subscriptions` | `pos` | **SYNCED** |
| 3 | **Gọi món QR Khách** (`/q/:token`, `/qr/:token`) | `MenuModule` & `PosModule` (`/api/v1/public/*`) | `dining_tables`, `products`, `modifier_groups`, `modifiers`, `orders`, `order_items` | Public (+ QR Security) | **SYNCED** |
| 4 | **Quản trị Thực đơn** (`/menu`, `/pos/touch/menu`, `/pos/touch/stock-status`) | `MenuModule` (`/api/v1/menu/*`) | `products`, `combo_items`, `modifier_groups`, `modifiers`, `master_data` | `menu` | **SYNCED** |
| 5 | **Mã giảm giá** (`/discounts`, `/pos/touch/discounts`) | `DiscountsModule` (`/api/v1/discounts/*`) | `discounts`, `discount_targets`, `orders` | `discounts` (+ `pos:manualDiscount`) | **SYNCED** |
| 6 | **Hoá đơn** (`/invoices`, `/pos/touch/invoices`) | `PosModule/Invoices` (`/api/v1/invoices/*`) | `orders`, `order_items`, `audit_logs` | `invoices` | **SYNCED** |
| 7 | **Nhập hàng Kho** (`/inventory`, `/pos/touch/inventory`) | `InventoryModule` (`/api/v1/inventory-imports/*`) | `inventory_imports`, `master_data` | `inventory` | **SYNCED** |
| 8 | **Ngân sách & Kết ca** (`/cashflow`, `/pos/touch/cashflow`) | `CashflowModule` (`/api/v1/cashflow/*`) | `cash_drawer_settlements`, `orders`, `inventory_imports`, `master_data` | `cashflow` | **SYNCED** |
| 9 | **Mã QR Thanh toán** (`/payment-qr`, `/pos/touch/payment-qr`) | `PaymentQrModule` (`/api/v1/payment-qr/*`) | `payment_accounts`, `orders` | `paymentQr` | **SYNCED** |
| 10 | **Nhân sự** (`/employees`) | `HrScheduleModule/Employees` (`/api/v1/employees/*`) | `employees`, `master_data`, `users` | `employees` | **SYNCED** |
| 11 | **Bảng công / Lịch tuần** (`/schedules`) | `HrScheduleModule/Schedules` (`/api/v1/schedules/*`) | `work_schedules`, `employees` | `schedules` | **SYNCED** |
| 12 | **Bảng tính lương** (`/payroll`) | `HrScheduleModule/Payroll` (`/api/v1/payroll/*`) | `work_schedules`, `employees`, `master_data` (`SYSTEM_CONFIG`) | `payroll` | **SYNCED** |
| 13 | **Master Data** (`/master-data`) | `MdmModule` (`/api/v1/mdm/*`) | `master_data` | `mdm` (+ `lookup` authenticated) | **SYNCED** |
| 14 | **Phân quyền & Phiên** (`/rbac`) | `IamModule/Users` (`/api/v1/users/*`) | `users`, `employees`, `audit_logs` | `rbac` + `SuperAdminOnly` | **SYNCED** |
| 15 | **Cài đặt Cửa hàng** (`/settings`, `/pos/touch/settings`) | `StoreSettingsModule` (`/api/v1/settings/*`, `/api/v1/public/store-*`, `/api/v1/store-messages`) | `master_data` (`SYSTEM_CONFIG`) | `settings` | **SYNCED** |
| 16 | **Hồ sơ & Tuỳ biến UI** (`/profile`, `/pos/touch/profile`) | `IamModule/Profile` (`/api/v1/profile/*`, `/api/v1/auth/*`) | `users`, `employees`, `master_data` (avatar) | AuthenticatedOnly | **SYNCED** |

---

## 5. BẢNG NGHIỆM THU TUÂN THỦ 10 QUY TẮC BẤT BIẾN (10 HARD INVARIANTS SIGN-OFF)

| # | Hard Invariant | Trạng thái Kiểm định | Kiểm chứng trên Codebase Thực tế |
|:---:|:---|:---:|:---|
| **1** | **Cô lập Module (`src/features/*`)** | **VERIFIED** | 16 feature folders cô lập; dùng chung qua `@fnb/shared`, `src/components/`, `src/hooks/`, `src/lib/`. |
| **2** | **Đơn Mang về (`TAKEAWAY` vs `DINE_IN`)** | **VERIFIED** | `chk_order_type_target`, `idx_one_active_order_per_table`; `dining_tables` chỉ lưu bàn vật lý. |
| **3** | **Delta Split Trạm Bếp (`NEW` → `PRINTED` + Combo)** | **VERIFIED** | `KitchenSplitService` chỉ lọc `NEW`, phân rã `combo_items`, trả HTTP 200 idempotent khi rỗng. |
| **4** | **Tách bạch Tạm tính (`SERVING`) vs Thanh toán (`PAID`)** | **VERIFIED** | `provisional-bill` & `split-provisional-bill` giữ nguyên `SERVING`; `checkout` & `split-checkout` đóng `PAID`. |
| **5** | **Khoá dòng `SELECT ... FOR UPDATE`** | **VERIFIED** | `TableTransferService`, `KitchenSplitService`, `PosService.checkout` đều bọc `$transaction` khoá `orders` (`id ASC`) → `dining_tables` (`id ASC`). |
| **6** | **Công thức Kết ca (`CASH`/`SPLIT` − `CASH_DRAWER`)** | **VERIFIED** | `CashflowService` chỉ tính tiền mặt (`CASH` + `cash_amount` của `SPLIT`), trừ `CASH_DRAWER` chưa xoá; loại `TRANSFER`, `VOIDED`, `EXTERNAL`. |
| **7** | **MDM Chuẩn hoá Chuỗi (`trim` → Title Case → không dấu)** | **VERIFIED** | `MdmService.findOrCreate()` + `uq_mdm_category_normalized`; `f_search_norm()` tách riêng cho search. |
| **8** | **RBAC `401` vs `403` & Mở `GET /api/v1/mdm/lookup`** | **VERIFIED** | `JwtAuthGuard` trả 401; `RbacGuard` trả 403; `/api/v1/mdm/lookup` chỉ gắn `JwtAuthGuard`. |
| **9** | **Giữ `ui_preferences` khi Đăng xuất** | **VERIFIED** | Logout gọi `queryClient.clear()`, xoá token/auth state, bảo toàn `ui_preferences` ở `localStorage` và `users.ui_preferences`. |
| **10** | **Kiểu Tiền tệ `NUMERIC(12, 2)` / `Decimal`** | **VERIFIED** | 100% cột tiền tệ trên `products`, `modifiers`, `orders`, `order_items`, `payment_accounts`, `discounts`, `inventory_imports`, `cash_drawer_settlements` dùng `@db.Decimal(12, 2)`. |

---

> **KẾT LUẬN CỦA PRINCIPAL ARCHITECT & QA AUDITOR (2026-11-26):**  
> Toàn bộ 3 sơ đồ kiến trúc (`01-verified-erd.mmd`, `02-verified-state-machines.mmd`, `03-verified-sequences.mmd`) cùng bộ tài liệu `docs/bmad/` và `docs/HUONG_DAN_SU_DUNG_VA_GIAI_PHAP.md` đã được đối chiếu trực tiếp với mã nguồn sản xuất hiện tại (18 bảng DB, 15 NestJS modules, 16 frontend features, Stories 01–21) và đạt trạng thái **ĐỒNG BỘ 100%**.
