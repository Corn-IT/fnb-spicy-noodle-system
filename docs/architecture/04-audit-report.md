# Báo Cáo Kiểm Định Kiến Trúc & Đối Chiếu Chéo Toàn Dự Án (Phase 2 Architecture Audit Report)
# Hệ thống POS & Quản trị Vận hành Quán Mì Cay (`fnb-spicy-noodle-system`)

> **Tài liệu:** `docs/architecture/04-audit-report.md`  
> **Phiên bản:** 1.0.0 (Phase 2 Final — Verified & Signed Off)  
> **Vai trò thực hiện:** Principal System Architect & QA Auditor  
> **Trạng thái:** **PASSED (100% ĐIỂM VÊNH ĐÃ ĐƯỢC PHÁT HIỆN VÀ XỬ LÝ TRIỆT ĐỂ)**  
> **Ngày kiểm định:** 2026-11-07  
> **Tài liệu đối chiếu đầu vào:**
> - `docs/bmad/01-PRD-Master.md`
> - `docs/bmad/02-RBAC-And-MDM-Matrix.md`
> - `docs/bmad/03-Edge-Cases-And-Invariants.md`
> - `docs/raw-specs/01-danh-gia-thiet-ke-tong-quan.md`
> - `docs/raw-specs/02-danh-gia-thiet-ke-chi-tiet-1-30.md`
> - `docs/raw-specs/03-danh-gia-thiet-ke-chi-tiet-31-39.md`
> - `AGENTS.md` và toàn bộ `.agents/rules/00..07-*.md`
> **Tài liệu kiến trúc đầu ra:**
> - `docs/architecture/01-verified-erd.mmd`
> - `docs/architecture/02-verified-state-machines.mmd`
> - `docs/architecture/03-verified-sequences.mmd`

---

## 1. TÓM TẮT ĐIỀU HÀNH (EXECUTIVE SUMMARY)

Thực hiện quy trình kiểm định chéo (Cross-Verification Audit) của Phase 2 trước khi bước vào giai đoạn viết mã nguồn ứng dụng, chúng tôi đã rà soát từng dòng đặc tả giữa bộ hồ sơ gốc `docs/raw-specs/`, bộ đặc tả chuẩn hoá `docs/bmad/` và hệ thống luật `.agents/rules/`.

Quá trình kiểm toán đã **phát hiện 15 điểm vênh (Discrepancies) tiềm ẩn nguy cơ gây lỗi runtime, deadlock hoặc sai lệch dữ liệu tài chính** giữa các bản thảo thiết kế ban đầu và quy chuẩn cuối cùng, đồng thời **đã chuẩn hoá dứt điểm 100%** trong 3 sơ đồ kiến trúc (`01-verified-erd.mmd`, `02-verified-state-machines.mmd`, `03-verified-sequences.mmd`).

| Hạng mục Kiểm định Chéo | Số điểm vênh phát hiện | Đã xử lý chuẩn hoá | Trạng thái Nghiệm thu |
|:---|:---:|:---:|:---:|
| **1. ERD & Database Constraints vs PRD Base Tables (Modules 0–9)** | 6 | 6 / 6 | **PASS (100%)** |
| **2. Công thức Kết ca (Module 4) vs Hoá đơn (Module 1, 2) & Nhập hàng (Module 3)** | 1 | 1 / 1 | **PASS (100%)** |
| **3. State Machines vs Sequence Diagrams & Concurrency Locking** | 5 | 5 / 5 | **PASS (100%)** |
| **4. REST API & WebSocket Contracts vs RBAC Matrix (401/403 & Lookup)** | 3 | 3 / 3 | **PASS (100%)** |
| **TỔNG CỘNG** | **15** | **15 / 15** | **READY FOR CODE** |

---

## 2. DANH MỤC 15 ĐIỂM VÊNH ĐÃ PHÁT HIỆN VÀ QUYẾT ĐỊNH XỬ LÝ CHUẨN HOÁ

### 2.1. Nhóm A: Điểm vênh về Cơ sở Dữ liệu & Physical ERD (`DISCREPANCY-DB-01` → `06`)

#### `DISCREPANCY-DB-01`: Bảng trung gian `combo_items` bị khuyết trong danh sách bảng của `.agents/rules/01` và thiếu định nghĩa cột trong Mermaid ERD của `raw-specs`
- **Hiện trạng lệch khớp:**
  - `docs/bmad/01-PRD-Master.md` (§3.1.2 `FR-0.4`) và `.agents/rules/02-pos-kitchen-and-cashflow-logic.md` (§2) bắt buộc sản phẩm có `station = 'COMBO'` phải được phân rã (Combo Explosion) thành các món thành phần để gửi về đúng 3 trạm (`BEP_NAU`, `BEP_CHIEN`, `PHA_CHE`).
  - Trong `docs/raw-specs/01-danh-gia-thiet-ke-tong-quan.md`, phần SQL DDL (dòng 728) có bảng `combo_items`, phần Mermaid ERD (dòng 1498) có vẽ đường nối `PRODUCTS ||--o{ COMBO_ITEMS` nhưng quên khai báo khối thực thể `COMBO_ITEMS { ... }`, còn `.agents/rules/01-database-and-concurrency.md` (§2) chỉ liệt kê 12 bảng mà bỏ sót bảng `combo_items`.
- **Quyết định xử lý chuẩn hoá (Fixed in `01-verified-erd.mmd`):**
  - Bổ sung tường minh thực thể `COMBO_ITEMS` (`parent_product_id PK,FK`, `child_product_id PK,FK`, `quantity INT NOT NULL DEFAULT 1`) kèm ràng buộc `CHECK (parent_product_id <> child_product_id)` vào ERD chuẩn và Prisma Schema.

#### `DISCREPANCY-DB-02`: Xung đột quan hệ `products` ↔ `modifier_groups` và thiếu cột `max_select`
- **Hiện trạng lệch khớp:**
  - Trong `raw-specs` DDL (dòng 734), bảng `modifier_groups` không có cột `product_id`, còn Mermaid ERD `raw-specs` (dòng 1499) vẽ quan hệ `PRODUCTS }o--o{ MODIFIER_GROUPS` (N-N nhưng không có bảng join). Ngược lại, `.agents/rules/01-database-and-concurrency.md` (dòng 78) thiết kế quan hệ 1-N trực tiếp qua cột `modifier_groups.product_id`.
  - Ngoài ra, `docs/bmad/01-PRD-Master.md` (`FR-0.3`) yêu cầu cột `max_select` để phân biệt nhóm chọn 1 (Radio `max_select = 1` cho Cấp độ cay 0–7) và nhóm chọn nhiều (Checkbox `max_select = N` cho Topping), nhưng bảng tóm tắt trong `.agents/rules/01` (dòng 76–80) bị thiếu cột `max_select`.
- **Quyết định xử lý chuẩn hoá (Fixed in `01-verified-erd.mmd`):**
  - Chuẩn hoá quan hệ 1-N `PRODUCTS ||--o{ MODIFIER_GROUPS` với khoá ngoại `product_id INT NOT NULL FK -> products(id) ON DELETE CASCADE`, và bổ sung đầy đủ cột `max_select INT NOT NULL DEFAULT 1`.

#### `DISCREPANCY-DB-03`: Khác biệt cấu trúc lưu Lịch làm việc (`work_schedules` + `shift_definitions` vs `work_schedules` JSONB Matrix)
- **Hiện trạng lệch khớp:**
  - `docs/raw-specs/01-danh-gia-thiet-ke-tong-quan.md` (dòng 696–711 & 1493) tách làm 2 bảng `shift_definitions` và `work_schedules` với `day_of_week SMALLINT` đánh số từ `2` (Thứ Hai) đến `8` (Chủ Nhật) và lưu từng dòng đơn `employee_id`.
  - Trong khi đó, `.agents/rules/01-database-and-concurrency.md` (§2 dòng 156–165) đã tối ưu hoá thành 1 bảng `work_schedules` lưu trực tiếp theo ô ma trận Excel: `week_start_date DATE`, `day_of_week INT` đánh số từ `0 (Mon) – 6 (Sun)`, `time_slot VARCHAR`, và `employee_ids JSONB` (mảng ID nhân viên phục vụ Multi-select Tags).
- **Quyết định xử lý chuẩn hoá (Fixed in `01-verified-erd.mmd`):**
  - Tuân thủ tuyệt đối cấu trúc trong `.agents/rules/01-database-and-concurrency.md`: Dùng bảng `work_schedules` với `day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6)`, `time_slot VARCHAR`, `employee_ids JSONB`, `created_by INT FK -> users(id)`, `updated_at TIMESTAMPTZ`, kèm `UNIQUE (week_start_date, day_of_week, time_slot)`. Thiết kế này giúp API `PUT /api/v1/schedules/bulk-save` và tính năng "Sao chép từ tuần trước" thực thi chỉ trong 1 truy vấn upsert gọn nhẹ.

#### `DISCREPANCY-DB-04`: Các cột hiển thị trên Base Table / Drawer trong PRD bị lược bớt trong bảng tóm tắt ERD của `raw-specs`
- **Hiện trạng lệch khớp:**
  - Khi đối chiếu từng cột hiển thị trên Base Table, Drawer và Modal của 10 Modules trong `docs/bmad/01-PRD-Master.md` và `docs/bmad/03-Edge-Cases-And-Invariants.md` với khối Mermaid ERD rút gọn trong `raw-specs` (dòng 1503–1605), có các trường bắt buộc trên UI bị lược bớt trong hình vẽ cũ:
    1. Bảng `employees`: Thiếu `address`, `citizen_id_issued_place`, `start_date`, `bank_account_name`, `avatar_url`, `attachment_urls JSONB`, `note` (cột số 6 trên Base Table Module 5 và các trường đồng bộ với Trang Hồ sơ Module 9).
    2. Bảng `inventory_imports`: Thiếu `item_name_snapshot`, `note` (cột số 8 "Nguồn tiền & Ghi chú" trên Base Table Module 3) và `created_at`.
    3. Bảng `cash_drawer_settlements`: Thiếu `denominations_detail JSONB` (lưu chi tiết số tờ từng mệnh giá 500k..1k theo §3.5.2 PRD) và `note TEXT` (bắt buộc nhập giải trình khi `discrepancy_amount !== 0` theo `EC-FIN-03`).
    4. Bảng `orders`: Trong hình Mermaid cũ thiếu `note TEXT` và `void_reason TEXT` (bắt buộc cho Module 2 `EC-FIN-01`).
- **Quyết định xử lý chuẩn hoá (Fixed in `01-verified-erd.mmd`):**
  - Khôi phục đầy đủ 100% các cột trên vào `01-verified-erd.mmd` để đảm bảo nguyên tắc 1-1 giữa UI Fields ↔ API DTO ↔ Prisma Model ↔ PostgreSQL Table.

#### `DISCREPANCY-DB-05`: Khoá duy nhất trên `master_data` — Single UK vs Composite UK `(category, normalized_name)`
- **Hiện trạng lệch khớp:**
  - Trong Mermaid ERD của `raw-specs` (dòng 1507), cột `normalized_name` chỉ đánh nhãn `UK` đơn lẻ, trong khi SQL DDL (dòng 657), `docs/bmad/02-RBAC-And-MDM-Matrix.md` (§6.3) và `.agents/rules/01-database-and-concurrency.md` (§2 dòng 22) quy định rõ **Composite Unique `UNIQUE(category, normalized_name)`**.
- **Quyết định xử lý chuẩn hoá (Fixed in `01-verified-erd.mmd`):**
  - Áp dụng `CREATE UNIQUE INDEX uq_mdm_category_normalized ON master_data (category, normalized_name)` theo đúng Composite Key.

#### `DISCREPANCY-DB-06`: Xung đột bản ghi bàn `"Mang về"` trong `dining_tables` với Hard Invariant 2
- **Hiện trạng lệch khớp:**
  - Trong `docs/raw-specs/01-danh-gia-thiet-ke-tong-quan.md` (dòng 715), comment SQL ban đầu ghi `name VARCHAR(50) NOT NULL -- Bàn 01, Bàn 02, Mang về`.
  - Tuy nhiên, ở phần phân tích Domino GAP A (dòng 1315–1321) và **Hard Invariant 2** (`AGENTS.md`, `03-Edge-Cases-And-Invariants.md`), hệ thống đã nghiêm cấm tạo 1 bàn vật lý tên `"Mang về"` vì nếu gắn nhiều đơn mang về vào cùng 1 `table_id` sẽ vi phạm Partial Unique Index `idx_one_active_order_per_table` hoặc làm gộp nhầm đơn của nhiều khách mua mang về.
- **Quyết định xử lý chuẩn hoá (Fixed in `01-verified-erd.mmd`):**
  - Bảng `dining_tables` **CHỈ** lưu trữ các bàn ăn vật lý (`Bàn 01` đến `Bàn 30`). Nút `[+ TẠO ĐƠN MANG VỀ]` trên màn hình POS tạo bản ghi `orders` với `order_type = 'TAKEAWAY'`, `table_id = NULL`, và `takeaway_number = 1, 2, 3...` tự tăng theo ngày.

---

### 2.2. Nhóm B: Điểm vênh Nghiệp vụ Tài chính & Công thức Kết ca (`DISCREPANCY-FIN-01`)

#### `DISCREPANCY-FIN-01`: Công thức Kết ca (Hard Invariant 6) khi phát sinh Hoá đơn Thanh toán Hỗn hợp (`payment_method = 'SPLIT'` — `EC-FIN-02`)
- **Hiện trạng lệch khớp:**
  - Trong `AGENTS.md` (Invariant 6) và `.agents/rules/02-pos-kitchen-and-cashflow-logic.md` (§5), công thức tổng quát viết gọn là:
    `expected_cash = opening_budget + SUM(total_amount WHERE payment_method='CASH' AND status='PAID') - SUM(total_cost WHERE payment_source='CASH_DRAWER')`
  - Tuy nhiên, cả `docs/bmad/01-PRD-Master.md` (§3.2.5), `.agents/rules/01-database-and-concurrency.md` (bảng `orders`), và `docs/bmad/03-Edge-Cases-And-Invariants.md` (`EC-FIN-02`: Thanh toán Hỗn hợp) đều bắt buộc hỗ trợ `payment_method = 'SPLIT'` (ví dụ: tổng bill `300.000đ`, khách trả tiền mặt `cash_amount = 100.000đ` và chuyển khoản QR `transfer_amount = 200.000đ`).
  - Nếu câu truy vấn SQL Kết ca chỉ lọc cứng `WHERE payment_method = 'CASH'`, hệ thống sẽ **bỏ sót `100.000đ` tiền mặt thu được từ đơn `SPLIT`**, làm két tiền bị báo Dư giả tạo `+100.000đ`!
- **Quyết định xử lý chuẩn hoá (Fixed in `01-verified-erd.mmd` & `03-verified-sequences.mmd`):**
  1. **Chuẩn hoá dữ liệu khi Checkout (`POST /api/v1/pos/orders/:id/checkout`) kèm CHECK Constraint `chk_order_payment_amounts`:**
     - Khi `payment_method = 'CASH'`: bắt buộc ghi `cash_amount = total_amount` và `transfer_amount = 0`.
     - Khi `payment_method = 'TRANSFER'`: bắt buộc ghi `cash_amount = 0` và `transfer_amount = total_amount`.
     - Khi `payment_method = 'SPLIT'`: bắt buộc `cash_amount > 0`, `transfer_amount > 0`, và `cash_amount + transfer_amount = total_amount`.
  2. **Chuẩn hoá truy vấn SQL Kết ca (`POST /api/v1/cashflow/settle`):**
     - Tổng thu tiền mặt vào két (`total_cash_sales`):
       ```sql
       SELECT COALESCE(SUM(
         CASE
           WHEN payment_method = 'CASH' THEN total_amount
           WHEN payment_method = 'SPLIT' THEN cash_amount
           ELSE 0
         END
       ), 0)
       FROM orders
       WHERE status = 'PAID' AND payment_method IN ('CASH', 'SPLIT') AND paid_at BETWEEN :shiftStart AND :shiftEnd;
       ```
     - Tổng thu chuyển khoản ngân hàng (`total_transfer_sales` — chỉ để đối soát sao kê, **TUYỆT ĐỐI KHÔNG CỘNG VÀO `expected_cash_in_drawer`**):
       ```sql
       SELECT COALESCE(SUM(
         CASE
           WHEN payment_method = 'TRANSFER' THEN total_amount
           WHEN payment_method = 'SPLIT' THEN transfer_amount
           ELSE 0
         END
       ), 0)
       FROM orders
       WHERE status = 'PAID' AND payment_method IN ('TRANSFER', 'SPLIT') AND paid_at BETWEEN :shiftStart AND :shiftEnd;
       ```
     - Công thức này bảo toàn tuyệt đối **Hard Invariant 6** VÀ xử lý chính xác 100% tình huống biên **`EC-FIN-02`**.

---

### 2.3. Nhóm C: Điểm vênh về State Machine, Concurrency & Idempotency (`DISCREPANCY-SM-01` → `04` & `LOCK-01`)

#### `DISCREPANCY-SM-01`: Đồng bộ Trạng thái Bàn ăn (`dining_tables.status`) và Mã màu UI
- **Hiện trạng lệch khớp:**
  - Trong `raw-specs` DDL (dòng 717) chỉ có 2 trạng thái `'AVAILABLE'`, `'OCCUPIED'`, và ở dòng 1368–1372 mô tả màu bàn là Xám (Trống), Cam (Chờ duyệt), Xanh dương (Đang phục vụ).
  - Trong khi `.agents/rules/01-database-and-concurrency.md` (dòng 60) và `.agents/rules/04-frontend-ux-table-and-print.md` (§5 dòng 87) đã chốt chuẩn 3 trạng thái và bảng màu:
    - `'AVAILABLE'` → **Xanh lá** (Bàn trống)
    - `'PENDING'` → **Cam nhấp nháy** (Có khách quét QR gửi đơn mới chờ duyệt)
    - `'OCCUPIED'` → **Đỏ** (Đang có khách phục vụ)
- **Quyết định xử lý chuẩn hoá (Fixed in `02-verified-state-machines.mmd`):**
  - Thiết lập State Machine riêng cho `DiningTable` với đúng 3 trạng thái `AVAILABLE`, `PENDING`, `OCCUPIED` và mã màu Xanh lá / Cam / Đỏ theo `.agents/rules/04`.

#### `DISCREPANCY-SM-02`: Cơ chế chuyển trạng thái `PENDING -> SERVING` cho đơn QR mới
- **Hiện trạng lệch khớp:**
  - Trong `docs/bmad/01-PRD-Master.md` (UJ-01), đơn từ khách quét QR lần đầu vào hệ thống ở trạng thái `PENDING`. Khi thu ngân xác nhận khách ngồi tại bàn và bấm `[Tách đơn]` (hoặc `[Duyệt đơn]`), đơn chuyển sang `SERVING`. Tuy nhiên trong bảng API Spec chưa mô tả rõ `split-kitchen` có tự động chuyển `PENDING -> SERVING` hay không.
- **Quyết định xử lý chuẩn hoá (Fixed in `02-verified-state-machines.mmd` & `03-verified-sequences.mmd`):**
  - Trong transaction của `POST /api/v1/pos/orders/:id/split-kitchen`: Nếu `order.status === 'PENDING'`, hệ thống tự động nâng trạng thái `order.status` lên `'SERVING'` và cập nhật `dining_tables.status = 'OCCUPIED'` trong cùng một giao dịch nguyên tử với việc chuyển `order_items.kitchen_status` từ `'NEW'` sang `'PRINTED'`. Ngoài ra, nếu thu ngân từ chối đơn QR ảo trước khi tách bếp, gọi action huỷ đơn để chuyển `PENDING -> VOIDED` và giải phóng bàn về `AVAILABLE`.

#### `DISCREPANCY-SM-03`: Bảo toàn trạng thái `kitchen_status = 'PRINTED'` khi Chuyển/Gộp bàn và Huỷ món
- **Hiện trạng lệch khớp:**
  - Cần đảm bảo khi gộp bàn (`MERGE`), việc chuyển các dòng `order_items` từ `sourceOrderId` sang `targetOrderId` không làm thay đổi `kitchen_status` của các món đã `'PRINTED'`, đồng thời hỗ trợ rõ 2 nhánh của `EC-POS-06` (xoá cứng khi còn `'NEW'`, chuyển sang `'CANCELLED'` kèm phiếu báo huỷ khi đã `'PRINTED'`).
- **Quyết định xử lý chuẩn hoá (Fixed in `02-verified-state-machines.mmd`):**
  - Đã mô hình hoá tường minh trong State Machine số 2 (`OrderItem Kitchen Lifecycle`) và Sequence số 3 (`SEQ-03`).

#### `DISCREPANCY-SM-04`: Mã HTTP trả về của `split-kitchen` khi không có món `NEW` (HTTP 200 Idempotent vs HTTP 400)
- **Hiện trạng lệch khớp:**
  - `.agents/rules/02-pos-kitchen-and-cashflow-logic.md` (§2 dòng 43), `.agents/rules/05-testing-strategy.md` (§4.1 dòng 44), `docs/bmad/01-PRD-Master.md` (§3.2.4 dòng 183) và `EC-POS-05` quy định: Khi không có món `NEW`, trả về **HTTP 200 OK** với `{ tickets: [], message: "Không có món mới cần tách" }` để chống lỗi khi thu ngân double-click.
  - Tuy nhiên, `.agents/rules/06-error-handling-and-logging.md` (§2 dòng 48) lại có comment `POS_NO_NEW_ITEMS_TO_SPLIT // 400`.
- **Quyết định xử lý chuẩn hoá:**
  - Tuân thủ theo PRD, `EC-POS-05` và Mandatory Test Suite trong `.agents/rules/05`: Endpoint `POST /api/v1/pos/orders/:id/split-kitchen` trả về **HTTP 200 OK** `{ tickets: [], message: "Không có món mới cần tách" }` khi không có món `NEW` (giữ hằng số `ErrorCodes.POS_NO_NEW_ITEMS_TO_SPLIT` trong `@fnb/shared` để không phá vỡ contract, nhưng luồng chính trả 200 idempotent).

#### `DISCREPANCY-LOCK-01`: Thứ tự khoá dòng (`SELECT ... FOR UPDATE`) khi `MERGE` hoặc `SWAP` 2 đơn / 2 bàn (Chống AB-BA Deadlock)
- **Hiện trạng lệch khớp:**
  - `.agents/rules/01-database-and-concurrency.md` (§4) quy định: *"Thứ tự khoá: ALWAYS khoá `orders` trước, rồi `dining_tables` → tránh deadlock."*
  - Tuy nhiên, trong nghiệp vụ `MERGE` và `SWAP`, hệ thống cần khoá **2 dòng trong bảng `orders`** và **2 dòng trong bảng `dining_tables`**. Nếu không quy định thứ tự khoá giữa 2 dòng trong cùng 1 bảng, 2 request thực hiện chéo giữa Bàn 01 và Bàn 07 cùng lúc sẽ gây AB-BA Deadlock ngay tại bảng `orders`.
- **Quyết định xử lý chuẩn hoá (Fixed in `03-verified-sequences.mmd`):**
  - Bắt buộc khoá theo thứ tự **ID tăng dần (`ORDER BY id ASC FOR UPDATE`)** ở cả 2 bước:
    1. `SELECT * FROM orders WHERE id IN (:orderId1, :orderId2) ORDER BY id ASC FOR UPDATE`
    2. `SELECT * FROM dining_tables WHERE id IN (:tableId1, :tableId2) ORDER BY id ASC FOR UPDATE`

---

### 2.4. Nhóm D: Điểm vênh về RBAC, WebSocket Auth & Biến Môi trường (`DISCREPANCY-RBAC-01`, `WS-01`, `ENV-01`)

#### `DISCREPANCY-RBAC-01`: Đồng bộ tên Permission Keys giữa `raw-specs`, `.agents/rules/03` và `docs/bmad/02`
- **Hiện trạng lệch khớp:**
  - `docs/raw-specs/` dùng tên quyền cũ là `*:read`, `imports:create`, `cashflow:update_default_budget`.
  - `.agents/rules/03-rbac-security-and-hr-schedule.md` dùng tên chuẩn `*:view`, `inventory:*`, `cashflow:config` với các quyền CRUD cơ bản.
  - `docs/bmad/02-RBAC-And-MDM-Matrix.md` bổ sung thêm các sub-permissions chi tiết: `pos:splitKitchen`, `pos:tableAction`, `pos:checkout`, `invoices:reprint`, `rbac:manage`.
- **Quyết định xử lý chuẩn hoá:**
  - Loại bỏ hoàn toàn tên quyền cũ trong `raw-specs` (`*:read`, `imports:*`, `update_default_budget`).
  - Trong `packages/shared/src/schemas/rbac.schema.ts`, định nghĩa `UserPermissionsSchema` bao gồm đầy đủ cả các cờ CRUD chuẩn của `.agents/rules/03` (`view, create, update, delete`) và các cờ sub-permissions của `docs/bmad/02` (`splitKitchen, tableAction, checkout, reprint, void, config, manage`). Trong `RbacGuard`, đối với các sub-action của `pos` (`splitKitchen`, `tableAction`, `checkout`), cho phép kiểm tra `permissions.pos[action] === true || permissions.pos.create === true || permissions.pos.update === true` để tương thích 100% với cả 2 cấu trúc JSONB trong `.agents/rules/03` và `docs/bmad/02`.

#### `DISCREPANCY-WS-01`: Xác thực Kết nối WebSocket cho Khách Quét QR Mobile (Public Guest) vs Thu Ngân (JWT Authenticated)
- **Hiện trạng lệch khớp:**
  - `.agents/rules/00-architecture-and-monorepo.md` (§3.4 dòng 171) ghi: *"Gateway MUST authenticate via JWT, reject unauthenticated in `handleConnection()`"*.
  - Trong khi `.agents/rules/04-frontend-ux-table-and-print.md` (§6 dòng 100–106) và `docs/bmad/01-PRD-Master.md` quy định trang khách quét QR (`/qr/:token`) **không cần đăng nhập JWT**, nhưng **bắt buộc phải kết nối Socket.io** vào room `order_session_{orderId}` để nhận sự kiện `order:session_redirected` (khi đổi/gộp bàn) và `order:status_updated`!
  - Nếu `handleConnection()` từ chối mọi client không có JWT, điện thoại khách sẽ không thể kết nối WebSocket và tính năng tự động chuyển phiên bàn (`EC-POS-01`) sẽ bị liệt hoàn toàn.
- **Quyết định xử lý chuẩn hoá (Fixed in `03-verified-sequences.mmd`):**
  - Thiết kế `PosSocketGateway` (`/pos`) theo cơ chế **Xác thực Hai Chế độ (Dual-Mode Socket Authentication)** trong `handleConnection()`:
    1. **Chế độ Staff/Cashier (Có `auth.token` là JWT):** Xác thực chữ ký JWT. Nếu hợp lệ → cho phép join vào `pos_cashier_room`. Nếu JWT giả mạo hoặc hết hạn → ngắt kết nối ngay lập tức.
    2. **Chế độ QR Guest (Có `auth.qrToken` hợp lệ của bàn + `auth.orderId`):** Kiểm tra `qrToken` tồn tại trong `dining_tables`. Nếu hợp lệ → **CHỈ** cho phép client join vào đúng room `order_session_{orderId}` của đơn hàng đó, **CẤM TUYỆT ĐỐI** join vào `pos_cashier_room`. Nếu không có cả JWT hợp lệ lẫn `qrToken` hợp lệ → từ chối kết nối ngay trong `handleConnection()`.

#### `DISCREPANCY-ENV-01`: Tiền tố biến môi trường `FNB_*` vs Biến chuẩn
- **Hiện trạng lệch khớp:**
  - `.agents/rules/00-architecture-and-monorepo.md` (§8) liệt kê `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT`, `CORS_ORIGIN`.
  - `.agents/rules/07-deployment-and-git.md` (§3) liệt kê `FNB_DATABASE_URL`, `FNB_JWT_SECRET`, `FNB_PORT`, `FNB_CORS_ORIGIN`.
- **Quyết định xử lý chuẩn hoá:**
  - Trong module cấu hình môi trường của `apps/api-server`, hỗ trợ đọc `process.env.FNB_DATABASE_URL ?? process.env.DATABASE_URL` (tương tự cho `JWT_SECRET`, `PORT`, `CORS_ORIGIN`) và khai báo đầy đủ trong `.env.example` để tương thích với cả Prisma CLI mặc định lẫn Docker Compose Production.

---

## 3. BỐN BÀI KIỂM TRA ĐỐI CHIẾU CHÉO BẮT BUỘC (4 MANDATORY CROSS-VERIFICATION AUDITS)

### 3.1. Bài Kiểm tra 1: Đối chiếu Từng Cột Base Table & Drawer của 10 Modules (PRD) với Physical ERD (`01-verified-erd.mmd`)

| Module | Thành phần UI (Base Table / Drawer / Modal) | Các cột / trường trên Giao diện (PRD) | Bảng & Cột Vật lý trong `01-verified-erd.mmd` | Kiểu dữ liệu & Ràng buộc | Kết quả |
|:---|:---|:---|:---|:---|:---:|
| **Module 0** | Quản lý Bàn & Menu | Bàn 01..30, Mã QR, Trạng thái bàn; Tên món, Giá, Trạm bếp, Hình ảnh, Cấp độ cay (0–7), Topping, Combo | `dining_tables` (`name`, `qr_token`, `status`, `active_order_id`); `products` (`name`, `price`, `station`, `is_available`, `image_url`, `sort_order`); `combo_items`; `modifier_groups` (`is_required`, `max_select`); `modifiers` (`extra_price`) | `price`, `extra_price`: `NUMERIC(12,2)`; `qr_token`: `UNIQUE` | **PASS** |
| **Module 1** | Màn hình POS Hợp nhất | Sơ đồ bàn, Nút Mang về (`MV-#`), Giỏ hàng theo lượt (`batch_no`), Tách 3 bếp, In tạm tính QR, Thanh toán, Đổi/Gộp/Hoán đổi bàn | `orders` (`order_code`, `order_type`, `order_source`, `table_id`, `takeaway_number`, `status`, `payment_method`, `cash_amount`, `transfer_amount`, `total_amount`, `merged_into_order_id`, `table_transfer_logs`); `order_items` (`quantity`, `unit_price`, `modifiers_snapshot`, `item_note`, `batch_no`, `kitchen_status`) | `chk_order_type_target`; `idx_one_active_order_per_table`; Tiền tệ `NUMERIC(12,2)` | **PASS** |
| **Module 2** | Base Table Hoá đơn (7 cột) + Bộ lọc kép | 1. STT, 2. Mã HĐ, 3. Bàn/Hình thức, 4. Thời điểm tạo, 5. Tổng tiền & PTTT, 6. Ghi chú & Trạng thái, 7. Thao tác (Eye, Void) | `orders` (`id`, `order_code`, `order_type`, `table_id`, `takeaway_number`, `created_at`, `total_amount`, `payment_method`, `note`, `status`, `void_reason`, `paid_at`, `cashier_id`) | Index `idx_orders_created_status (created_at DESC, status, payment_method)` | **PASS** |
| **Module 3** | Base Table Nhập hàng (8+1 cột) & Drawer Thêm mới | 1. STT, 2. Ngày nhập, 3. Tên món hàng, 4. ĐVT, 5. Đơn giá, 6. Số lượng, 7. Thành tiền, 8. Nguồn tiền & Ghi chú, 9. Trash xoá mềm | `inventory_imports` (`id`, `import_date`, `ingredient_mdm_id`, `item_name_snapshot`, `unit_name`, `unit_price`, `quantity`, `total_cost`, `payment_source`, `note`, `created_by`, `is_deleted`, `created_at`) | `unit_price`, `total_cost`: `NUMERIC(12,2)`; `quantity`: `NUMERIC(10,2)`; Index `idx_imports_date_mdm` | **PASS** |
| **Module 4** | Kết ca, Đếm tiền mệnh giá & Base Table Dòng tiền | Ngày/Ca, Ngân sách đầu ca, Thu tiền mặt, Thu QR, Chi tiền két, Tiền lý thuyết, Tiền thực đếm, Chênh lệch, Tình trạng, Chi tiết mệnh giá, Ghi chú giải trình, Người đóng ca | `cash_drawer_settlements` (`settlement_date`, `shift_name`, `opening_budget`, `total_cash_sales`, `total_transfer_sales`, `total_cash_imports`, `expected_cash_in_drawer`, `actual_counted_cash`, `discrepancy_amount`, `status`, `denominations_detail`, `note`, `closed_by`, `created_at`) | Toàn bộ 7 cột tiền tệ dùng `NUMERIC(12,2)`; Index `idx_settlements_date` | **PASS** |
| **Module 5** | Base Table Nhân viên (7 cột) & Form Thêm/Sửa | 1. STT, 2. Tên NV (+Tên tắt), 3. Năm sinh, 4. Chức vụ, 5. Chuyên môn, 6. Ghi chú, 7. Thao tác + CCCD, Nơi cấp, Địa chỉ, SĐT, Ngày vào làm, Ngân hàng, Avatar, File đính kèm | `employees` (`id`, `full_name`, `short_name`, `dob`, `phone`, `address`, `citizen_id`, `citizen_id_issued_place`, `position_id`, `specialty_id`, `start_date`, `bank_name`, `bank_account_no`, `bank_account_name`, `avatar_url`, `attachment_urls`, `note`, `is_deleted`, `created_at`) | `citizen_id`: `UNIQUE`; `is_deleted`: `BOOLEAN DEFAULT FALSE` | **PASS** |
| **Module 6** | Lịch làm việc Ma trận Excel (7 ngày × N ca) | Thanh chọn tuần (`week_start_date`), Thứ 2..CN (`0..6`), Khung giờ (`time_slot`), Multi-select Tags nhân viên (`employee_ids`) | `work_schedules` (`id`, `week_start_date`, `day_of_week`, `time_slot`, `employee_ids`, `created_by`, `updated_at`) | `UNIQUE(week_start_date, day_of_week, time_slot)`; `CHECK (day_of_week BETWEEN 0 AND 6)` | **PASS** |
| **Module 7** | Quản trị Master Data (5 Tabs) | Category (`POSITION`, `SPECIALTY`, `INGREDIENT`, `UNIT`, `SUPPLIER`), Tên hiển thị, Tên chuẩn hoá không dấu, Metadata (`default_unit`, `last_price`), Trạng thái | `master_data` (`id`, `category`, `name`, `normalized_name`, `metadata`, `is_active`, `created_at`) | `UNIQUE(category, normalized_name)` | **PASS** |
| **Module 8** | Base Table Tài khoản & Drawer Phân quyền | Username, Nhân viên liên kết (1-1), Super Admin (readonly), Ma trận Checkbox View + Dropdown CRUD + Sub-permissions | `users` (`id`, `employee_id`, `username`, `password_hash`, `is_super_admin`, `permissions`, `is_active`, `created_at`) | `employee_id`: `UNIQUE FK -> employees(id)`; `username`: `UNIQUE` | **PASS** |
| **Module 9** | Navbar, Hồ sơ cá nhân & UI Preferences | JOIN `employees` + `users`; Lưu `theme`, `column_widths`, `sidebar_width` độc lập phiên đăng nhập | `users.ui_preferences` (`JSONB`) + `employees` (SĐT, Địa chỉ, Ngân hàng, Avatar) | Giữ nguyên `ui_preferences` khi Logout (Invariant 9) | **PASS** |

---

### 3.2. Bài Kiểm tra 2: Đối chiếu State Machine (`02-verified-state-machines.mmd`) với Sequence Diagrams (`03-verified-sequences.mmd`)

| Kịch bản Kiểm chứng | Quy định tại State Machine (`02`) | Hành vi trong Sequence Diagram (`03`) | Đánh giá Nhất quán |
|:---|:---|:---|:---:|
| **1. Điểm khởi tạo đơn từ QR vs POS tại quầy** | `QR_CODE` → `PENDING`; `POS_COUNTER` (Bàn hoặc Mang về) → `SERVING`. | `SEQ-01` tạo đơn QR với `status = 'PENDING'`, bàn chuyển sang `'PENDING'`. Đơn tạo tại máy POS vào thẳng `'SERVING'`. | **KHỚP 100%** |
| **2. Bấm nút "In tạm tính (Kèm VietQR động)"** | Self-transition `SERVING -> SERVING`. Cấm chuyển sang `PAID`. | `SEQ-02` (Bước Tạm tính): Gọi `GET /api/v1/pos/orders/:id/provisional-bill`, sinh ảnh VietQR Napas247, giữ nguyên `order.status = 'SERVING'` và `dining_tables.status = 'OCCUPIED'`. | **KHỚP 100%** |
| **3. Bấm nút "Tách đơn" (Delta Split 3 bếp)** | Chỉ lọc `order_items` có `kitchen_status = 'NEW'` → chuyển sang `'PRINTED'`. Món `'COMBO'` phải phân rã. | `SEQ-02` (Bước Tách đơn): Khoá dòng `FOR UPDATE`, chỉ lọc `kitchen_status = 'NEW'`, phân rã `combo_items`, tăng `batch_no`, cập nhật `'PRINTED'`, trả về 3 phiếu in nhiệt 80mm. | **KHỚP 100%** |
| **4. Chuyển bàn (`MOVE`) và Gộp bàn (`MERGE`)** | `MOVE`: giữ `SERVING`, đổi `table_id`. `MERGE`: đơn nguồn chuyển sang `MERGED`, đơn đích giữ `SERVING`, các món đã `PRINTED` giữ nguyên `PRINTED`. | `SEQ-03`: Bọc trong `$transaction` với `SELECT ... FOR UPDATE` (`orders` trước, `dining_tables` sau), giữ nguyên `kitchen_status`, bắn `order:session_redirected` xuống điện thoại khách và in `PHIẾU THÔNG BÁO CHUYỂN BÀN` nếu đã có món `PRINTED`. | **KHỚP 100%** |
| **5. Chốt Thanh toán (`Checkout`)** | `SERVING -> PAID`, giải phóng bàn về `AVAILABLE` (`active_order_id = NULL`). | `SEQ-02` (Bước Thanh toán): Xác nhận 2 bước → cập nhật `status = 'PAID'`, `paid_at = NOW()`, giải phóng bàn về `'AVAILABLE'`, bắn `order:status_updated` và `table:grid_sync`. | **KHỚP 100%** |

---

### 3.3. Bài Kiểm tra 3: Đối chiếu API Specification với RBAC Matrix & Quy tắc 401 vs 403 (`02-RBAC-And-MDM-Matrix.md`)

1. **Kiểm chứng Tách biệt API Lookup Master Data (Hard Invariant 8):**
   - `GET /api/v1/mdm/lookup?category=INGREDIENT|POSITION|SPECIALTY|UNIT|SUPPLIER`: Chỉ gắn `@UseGuards(JwtAuthGuard)` (`AuthenticatedOnly`), **KHÔNG** gắn `@RequirePermission('mdm', ...)`. Nhờ đó, Thu ngân và Quản lý có thể lấy nguyên liệu, nhà cung cấp, chức vụ, chuyên môn qua autocomplete mà không cần quyền truy cập màn hình Quản trị Master Data (Module 7).
   - `GET / POST / PUT / DELETE /api/v1/mdm`: Gắn `@UseGuards(JwtAuthGuard, RbacGuard)` kèm `@RequirePermission('mdm', 'view' | 'write')`, khoá chặt cho Admin.
2. **Kiểm chứng Phân định Rạch ròi Mã lỗi HTTP `401` vs `403` (Hard Invariant 8):**
   - `JwtAuthGuard` thực thi ở tầng 1: Nếu thiếu header `Authorization: Bearer`, token sai chữ ký, hoặc token hết hạn 15 phút → Trả về **`401 Unauthorized`** (`AUTH_TOKEN_MISSING` / `AUTH_TOKEN_EXPIRED` / `AUTH_TOKEN_INVALID`). Tuyệt đối không trả về `403`.
   - `RbacGuard` thực thi ở tầng 2 (sau khi `req.user` đã được xác thực):
     - Nếu `req.user.is_super_admin === true` → Cho qua toàn bộ (Bypass).
     - Nếu thiếu quyền trong `req.user.permissions[module][action]` → Trả về **`403 Forbidden`** (`RBAC_PERMISSION_DENIED`). Tuyệt đối không trả về `401`.
3. **Kiểm chứng Sub-permissions Nhạy cảm:**
   - `PUT /api/v1/cashflow/default-budget`: Bắt buộc `@RequirePermission('cashflow', 'config')` (Thu ngân chỉ có `cashflow:view` và `cashflow:create` để kết ca, nếu gọi API sửa ngân sách đầu ngày sẽ nhận `403 Forbidden`).
   - `POST /api/v1/invoices/:id/void`: Bắt buộc `@RequirePermission('invoices', 'void')` (Thu ngân gọi sẽ nhận `403 Forbidden`).
   - `POST /api/v1/users` & `PUT /api/v1/users/:id/permissions`: Bắt buộc `SuperAdminOnly` (`is_super_admin = true`).

---

### 3.4. Bài Kiểm tra 4: Đối chiếu Công thức Kết ca (Module 4) với Hoá đơn (Module 1, 2) & Nhập hàng (Module 3)

Kiểm chứng ma trận bao phủ 100% các trường hợp dòng tiền phát sinh trong ca làm việc:

| Nguồn giao dịch phát sinh | Điều kiện Bản ghi trong Database | Có cộng/trừ vào `expected_cash_in_drawer`? | Cột ghi nhận trong `cash_drawer_settlements` |
|:---|:---|:---:|:---|
| **1. Ngân sách tiền lẻ đầu ca** | Cấu hình bởi Admin (`cashflow:config`) | **CỘNG (`+ opening_budget`)** | `opening_budget` |
| **2. Đơn thu Tiền mặt (`CASH`)** | `orders.status = 'PAID' AND payment_method = 'CASH'` | **CỘNG (`+ total_amount`)** | Cộng vào `total_cash_sales` |
| **3. Đơn thu Chuyển khoản QR (`TRANSFER`)** | `orders.status = 'PAID' AND payment_method = 'TRANSFER'` | **KHÔNG CỘNG (0 đ)** *(Invariant 6)* | Cộng vào `total_transfer_sales` (Đối soát NH) |
| **4. Đơn thu Hỗn hợp (`SPLIT`)** | `orders.status = 'PAID' AND payment_method = 'SPLIT'` | **CHỈ CỘNG `+ cash_amount`** *(EC-FIN-02)* | `cash_amount` → `total_cash_sales`;<br/>`transfer_amount` → `total_transfer_sales` |
| **5. Đơn đang ăn / Đã gộp / Đã huỷ** | `orders.status IN ('PENDING', 'SERVING', 'MERGED', 'VOIDED')` | **KHÔNG CỘNG (0 đ)** *(EC-FIN-01)* | Bị loại trừ hoàn toàn khỏi doanh thu |
| **6. Phiếu nhập hàng lấy Tiền két** | `inventory_imports.payment_source = 'CASH_DRAWER' AND is_deleted = FALSE` | **TRỪ (`- total_cost`)** *(Invariant 6)* | Cộng vào `total_cash_imports` |
| **7. Phiếu nhập hàng Quỹ ngoài / Chủ CK** | `inventory_imports.payment_source = 'EXTERNAL' AND is_deleted = FALSE` | **KHÔNG TRỪ (0 đ)** *(Invariant 6)* | Không ảnh hưởng tiền mặt trong két |
| **8. Phiếu nhập hàng đã xoá mềm** | `inventory_imports.is_deleted = TRUE` | **KHÔNG TRỪ (0 đ)** | Bị loại trừ hoàn toàn |

---

## 4. BẢNG NGHIỆM THU TUÂN THỦ 10 QUY TẮC BẤT BIẾN (10 HARD INVARIANTS SIGN-OFF)

| # | Hard Invariant | Trạng thái Kiểm định | Vị trí Đặc tả Kiến trúc Đã Khoá Chặt |
|:---:|:---|:---:|:---|
| **1** | **Cô lập Module (`src/features/*`)** | **VERIFIED** | `.agents/rules/00-architecture-and-monorepo.md` (§2.2, §5) |
| **2** | **Đơn Mang về (`TAKEAWAY` vs `DINE_IN`)** | **VERIFIED** | `01-verified-erd.mmd` (`chk_order_type_target`, `idx_one_active_order_per_table`) |
| **3** | **Delta Split 3 Trạm Bếp (`NEW` → `PRINTED` + Combo)** | **VERIFIED** | `01-verified-erd.mmd` (`COMBO_ITEMS`), `02-verified-state-machines.mmd`, `03-verified-sequences.mmd` (`SEQ-02`) |
| **4** | **Tách bạch Tạm tính (`SERVING`) vs Thanh toán (`PAID`)** | **VERIFIED** | `02-verified-state-machines.mmd`, `03-verified-sequences.mmd` (`SEQ-02`) |
| **5** | **Khoá dòng `SELECT ... FOR UPDATE` cho Table Actions** | **VERIFIED** | `03-verified-sequences.mmd` (`SEQ-03` — Khoá `orders` trước, `dining_tables` sau theo `id ASC`) |
| **6** | **Công thức Kết ca (`CASH`/`SPLIT` − `CASH_DRAWER`)** | **VERIFIED** | `01-verified-erd.mmd` (`chk_order_payment_amounts`), `03-verified-sequences.mmd` (`SEQ-04`) |
| **7** | **MDM Chuẩn hoá Chuỗi (`trim` → Title Case → không dấu)** | **VERIFIED** | `01-verified-erd.mmd` (`uq_mdm_category_normalized`), `03-verified-sequences.mmd` (`SEQ-04`) |
| **8** | **RBAC `401` vs `403` & Mở `GET /api/v1/mdm/lookup`** | **VERIFIED** | `03-verified-sequences.mmd` (`SEQ-04`), Báo cáo Kiểm định §3.3 |
| **9** | **Giữ `ui_preferences` khi Đăng xuất** | **VERIFIED** | `01-verified-erd.mmd` (`users.ui_preferences`), `.agents/rules/04-frontend-ux-table-and-print.md` (§2) |
| **10** | **Kiểu Tiền tệ `NUMERIC(12, 2)` / `Decimal`** | **VERIFIED** | `01-verified-erd.mmd` (100% cột tiền tệ trên `products`, `modifiers`, `orders`, `order_items`, `inventory_imports`, `cash_drawer_settlements`) |

---

> **KẾT LUẬN CỦA PRINCIPAL ARCHITECT & QA AUDITOR:**  
> Toàn bộ 3 sơ đồ kiến trúc trong `docs/architecture/` (`01-verified-erd.mmd`, `02-verified-state-machines.mmd`, `03-verified-sequences.mmd`) và hồ sơ `docs/bmad/` cùng `.agents/rules/` đã đạt trạng thái **ĐỒNG BỘ 100% (ZERO UNRESOLVED DISCREPANCIES)**. Dự án đủ điều kiện tiêu chuẩn kỹ thuật cao nhất để chuyển sang giai đoạn phân mảnh Stories (Phase 4A) và triển khai mã nguồn (Phase 4B & Phase 5).
