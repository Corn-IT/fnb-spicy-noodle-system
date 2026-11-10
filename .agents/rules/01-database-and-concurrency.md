# 01 — Cơ sở Dữ liệu & Xử lý Đồng thời (Database & Concurrency Rules)

> Áp dụng cho: Codex (Phase 2, 4B), Antigravity (Phase 3).

---

## 1. Kiểu Dữ liệu Bắt buộc

- Mọi cột tiền tệ (`price`, `total_amount`, `total_cost`, `opening_budget`, `cash_amount`, `transfer_amount`, `unit_price`, `extra_price`, `total_cash_sales`, `total_transfer_sales`, `total_cash_imports`, `expected_cash_in_drawer`, `actual_counted_cash`, `discrepancy_amount`) **MUST** dùng `NUMERIC(12, 2)` trong PostgreSQL và `Decimal` (`@db.Decimal(12, 2)`) trong Prisma.
- **FORBIDDEN**: `FLOAT`, `DOUBLE`, `REAL`, hoặc `Int` cho tiền tệ.
- Timestamps **MUST** dùng `TIMESTAMP WITH TIME ZONE` (Prisma: `DateTime @db.Timestamptz`).
- JSONB cho: `modifiers_snapshot`, `permissions`, `ui_preferences`, `table_transfer_logs`, `metadata`, `attachment_urls`, `denominations_detail`, `employee_ids`.

## 2. Schema — 13 Bảng Vật lý Chuẩn (Đồng bộ `01-verified-erd.mmd`)

### `master_data`
| Cột | Kiểu | Ràng buộc |
|-----|------|-----------|
| id | SERIAL | PK |
| category | VARCHAR | NOT NULL: `'POSITION'`, `'SPECIALTY'`, `'INGREDIENT'`, `'UNIT'`, `'SUPPLIER'` |
| name | VARCHAR | NOT NULL (Title Case) |
| normalized_name | VARCHAR | NOT NULL, Composite UNIQUE `(category, normalized_name)` |
| metadata | JSONB | DEFAULT `'{}'`: `{ default_unit, last_price }` |
| is_active | BOOLEAN | NOT NULL DEFAULT TRUE |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

### `employees`
| Cột | Kiểu | Ràng buộc |
|-----|------|-----------|
| id | SERIAL | PK |
| full_name | VARCHAR | NOT NULL |
| short_name | VARCHAR | NOT NULL (`V.Anh` hoặc `N.V.Anh (#12)` khi trùng) |
| dob | DATE | |
| phone | VARCHAR | |
| address | TEXT | Địa chỉ nơi ở (Đồng bộ Module 5 & 9) |
| citizen_id | VARCHAR | UNIQUE (Số CCCD) |
| citizen_id_issued_place | VARCHAR | Nơi cấp CCCD |
| position_id | INT | FK → master_data (`category = 'POSITION'`) |
| specialty_id | INT | FK → master_data (`category = 'SPECIALTY'`) |
| start_date | DATE | Ngày bắt đầu vào làm |
| bank_name | VARCHAR | Tên ngân hàng nhận lương |
| bank_account_no | VARCHAR | Số tài khoản ngân hàng |
| bank_account_name | VARCHAR | Tên chủ tài khoản ngân hàng |
| avatar_url | VARCHAR | URL ảnh đại diện (Cloudflare R2) |
| attachment_urls | JSONB | DEFAULT `'[]'`: Danh sách file hợp đồng / CCCD |
| note | TEXT | Ghi chú nhân sự (Cột số 6 trên BaseTable Module 5) |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

### `users`
| Cột | Kiểu | Ràng buộc |
|-----|------|-----------|
| id | SERIAL | PK |
| employee_id | INT | NOT NULL FK → employees, **UNIQUE** (Strict 1-1) |
| username | VARCHAR | NOT NULL UNIQUE |
| password_hash | TEXT | NOT NULL (Bcrypt cost=10, min 6 chars) |
| is_super_admin | BOOLEAN | NOT NULL DEFAULT FALSE |
| permissions | JSONB | NOT NULL DEFAULT `'{}'`: `{ module: { view, create, update, delete, ...sub } }` |
| ui_preferences | JSONB | NOT NULL DEFAULT `'{}'`: `{ theme, column_widths, sidebar_width }` |
| is_active | BOOLEAN | NOT NULL DEFAULT TRUE |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

### `dining_tables`
| Cột | Kiểu | Ràng buộc |
|-----|------|-----------|
| id | SERIAL | PK (Chỉ lưu bàn vật lý `Bàn 01`..`Bàn 30`, **FORBIDDEN** tạo bàn `"Mang về"`) |
| name | VARCHAR | NOT NULL UNIQUE: `'Bàn 01'`..`'Bàn 30'` |
| qr_token | VARCHAR | NOT NULL UNIQUE (Chuỗi bảo mật 64 ký tự / UUIDv4) |
| status | VARCHAR | NOT NULL DEFAULT `'AVAILABLE'`: `'AVAILABLE'`, `'PENDING'`, `'OCCUPIED'` |
| active_order_id | INT | Nullable FK → orders(id), con trỏ phiên đơn đang mở |

### `products`
| Cột | Kiểu | Ràng buộc |
|-----|------|-----------|
| id | SERIAL | PK |
| name | VARCHAR | NOT NULL |
| price | NUMERIC(12,2) | NOT NULL >= 0 |
| station | VARCHAR | NOT NULL: `'BEP_NAU'`, `'BEP_CHIEN'`, `'PHA_CHE'`, `'COMBO'` |
| is_available | BOOLEAN | NOT NULL DEFAULT TRUE |
| image_url | VARCHAR | Nullable |
| sort_order | INT | NOT NULL DEFAULT 0 |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

### `combo_items`
| Cột | Kiểu | Ràng buộc |
|-----|------|-----------|
| parent_product_id | INT | PK, FK → products(id) (`station = 'COMBO'`) |
| child_product_id | INT | PK, FK → products(id) (`station IN ('BEP_NAU', 'BEP_CHIEN', 'PHA_CHE')`) |
| quantity | INT | NOT NULL DEFAULT 1 (> 0) |

### `modifier_groups`
| Cột | Kiểu | Ràng buộc |
|-----|------|-----------|
| id | SERIAL | PK |
| product_id | INT | NOT NULL FK → products(id) ON DELETE CASCADE |
| name | VARCHAR | NOT NULL: `'Cấp độ cay'`, `'Thêm Topping'` |
| is_required | BOOLEAN | NOT NULL DEFAULT FALSE (True cho Cấp độ cay 0–7) |
| max_select | INT | NOT NULL DEFAULT 1 (`1` = Radio, `>1` = Checkbox multi-select) |

### `modifiers`
| Cột | Kiểu | Ràng buộc |
|-----|------|-----------|
| id | SERIAL | PK |
| group_id | INT | NOT NULL FK → modifier_groups(id) ON DELETE CASCADE |
| name | VARCHAR | NOT NULL: `'Cấp độ 0'`..`'Cấp độ 7'`, `'Thêm Bò viên'` |
| extra_price | NUMERIC(12,2) | NOT NULL DEFAULT 0.00 |

### `orders`
| Cột | Kiểu | Ràng buộc |
|-----|------|-----------|
| id | SERIAL | PK |
| order_code | VARCHAR | NOT NULL UNIQUE, format `'HD-YYYYMMDD-NNNN'` |
| order_type | VARCHAR | NOT NULL: `'DINE_IN'`, `'TAKEAWAY'` |
| order_source | VARCHAR | NOT NULL: `'QR_CODE'`, `'POS_COUNTER'` |
| table_id | INT | Nullable FK → dining_tables(id), **MUST BE NULL if TAKEAWAY** |
| takeaway_number | INT | Nullable, **MUST BE NULL if DINE_IN**, tự tăng từ 1 và reset hàng ngày |
| status | VARCHAR | NOT NULL: `'PENDING'`, `'SERVING'`, `'PAID'`, `'MERGED'`, `'VOIDED'` |
| payment_method | VARCHAR | Nullable: `'CASH'`, `'TRANSFER'`, `'SPLIT'` |
| cash_amount | NUMERIC(12,2) | NOT NULL DEFAULT 0.00 |
| transfer_amount | NUMERIC(12,2) | NOT NULL DEFAULT 0.00 |
| total_amount | NUMERIC(12,2) | NOT NULL DEFAULT 0.00 |
| merged_into_order_id | INT | Nullable FK → orders(id) (self-ref khi `status = 'MERGED'`) |
| table_transfer_logs | JSONB | NOT NULL DEFAULT `'[]'`: Array of `{ action, fromTable, toTable, timestamp, reason }` |
| cashier_id | INT | Nullable FK → users(id) |
| note | TEXT | Nullable: Ghi chú chung của đơn hàng |
| void_reason | TEXT | Nullable: Lý do huỷ đơn (Bắt buộc >= 10 ký tự khi `status = 'VOIDED'`) |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| paid_at | TIMESTAMPTZ | Nullable: Thời điểm chốt thanh toán (`status = 'PAID'`) |

### `order_items`
| Cột | Kiểu | Ràng buộc |
|-----|------|-----------|
| id | SERIAL | PK |
| order_id | INT | NOT NULL FK → orders(id) ON DELETE CASCADE |
| product_id | INT | NOT NULL FK → products(id) ON DELETE RESTRICT |
| quantity | INT | NOT NULL CHECK (`quantity > 0`) |
| unit_price | NUMERIC(12,2) | NOT NULL (Đơn giá gốc + `extra_price` topping) |
| modifiers_snapshot | JSONB | NOT NULL DEFAULT `'[]'`: `[{ groupId, modifierId, name, extraPrice }]` |
| item_note | TEXT | Nullable |
| batch_no | INT | NOT NULL DEFAULT 1: Lượt gọi 1, 2, 3... |
| kitchen_status | VARCHAR | NOT NULL DEFAULT `'NEW'`: `'NEW'`, `'PRINTED'`, `'CANCELLED'` |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

### `inventory_imports`
| Cột | Kiểu | Ràng buộc |
|-----|------|-----------|
| id | SERIAL | PK |
| ingredient_mdm_id | INT | NOT NULL FK → master_data(id) (`category = 'INGREDIENT'`) |
| item_name_snapshot | VARCHAR | NOT NULL: Tên nguyên liệu tại thời điểm nhập |
| unit_name | VARCHAR | NOT NULL: Đơn vị tính (`Kg`, `Thùng`, `Gói`, `Két`, `Bao`...) |
| unit_price | NUMERIC(12,2) | NOT NULL >= 0 |
| quantity | NUMERIC(10,2) | NOT NULL > 0 |
| total_cost | NUMERIC(12,2) | NOT NULL >= 0 (`= ROUND(unit_price * quantity, 2)`) |
| payment_source | VARCHAR | NOT NULL DEFAULT `'CASH_DRAWER'`: `'CASH_DRAWER'`, `'EXTERNAL'` |
| import_date | DATE | NOT NULL DEFAULT CURRENT_DATE |
| note | TEXT | Nullable: Ghi chú phiếu nhập (Cột số 8 trên BaseTable Module 3) |
| created_by | INT | NOT NULL FK → users(id) |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

### `cash_drawer_settlements`
| Cột | Kiểu | Ràng buộc |
|-----|------|-----------|
| id | SERIAL | PK |
| settlement_date | DATE | NOT NULL |
| shift_name | VARCHAR | NOT NULL (`Ca Sáng`, `Ca Tối`...) |
| opening_budget | NUMERIC(12,2) | NOT NULL |
| total_cash_sales | NUMERIC(12,2) | NOT NULL (Tổng thu tiền mặt từ đơn `CASH` + `cash_amount` của đơn `SPLIT`) |
| total_transfer_sales | NUMERIC(12,2) | NOT NULL (Tổng thu chuyển khoản QR từ đơn `TRANSFER` + `transfer_amount` của đơn `SPLIT`) |
| total_cash_imports | NUMERIC(12,2) | NOT NULL (Tổng chi tiền két từ phiếu nhập `CASH_DRAWER`) |
| expected_cash_in_drawer | NUMERIC(12,2) | NOT NULL (`= opening_budget + total_cash_sales - total_cash_imports`) |
| actual_counted_cash | NUMERIC(12,2) | NOT NULL |
| discrepancy_amount | NUMERIC(12,2) | NOT NULL (`= actual_counted_cash - expected_cash_in_drawer`) |
| status | VARCHAR | NOT NULL: `'MATCHED'` (`= 0`), `'SURPLUS'` (`> 0`), `'SHORTAGE'` (`< 0`) |
| denominations_detail | JSONB | NOT NULL DEFAULT `'{}'`: `{ "500000": n, "200000": n, ..., "1000": n }` |
| note | TEXT | Nullable: Ghi chú giải trình chênh lệch (Bắt buộc khi `discrepancy_amount !== 0`) |
| closed_by | INT | NOT NULL FK → users(id) |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

### `work_schedules`
| Cột | Kiểu | Ràng buộc |
|-----|------|-----------|
| id | SERIAL | PK |
| week_start_date | DATE | NOT NULL: Ngày Thứ Hai đầu tuần (`YYYY-MM-DD`) |
| day_of_week | INT | NOT NULL CHECK (`day_of_week BETWEEN 0 AND 6`): `0` (Mon) – `6` (Sun) |
| time_slot | VARCHAR | NOT NULL: Tên khung giờ (VD: `'Ca Sáng (08:00-15:00)'`) |
| employee_ids | JSONB | NOT NULL DEFAULT `'[]'`: Array of employee IDs `[12, 15, 18]` |
| created_by | INT | NOT NULL FK → users(id) |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

## 3. Database Constraints & Indexes (MUST có trong migration)

```sql
-- 1. CHECK: DINE_IN vs TAKEAWAY (Hard Invariant 2)
ALTER TABLE orders ADD CONSTRAINT chk_order_type_target CHECK (
  (order_type = 'DINE_IN' AND table_id IS NOT NULL AND takeaway_number IS NULL) OR
  (order_type = 'TAKEAWAY' AND table_id IS NULL AND takeaway_number IS NOT NULL)
);

-- 2. CHECK: Thanh toán CASH / TRANSFER / SPLIT (Hard Invariant 6 & EC-FIN-02)
ALTER TABLE orders ADD CONSTRAINT chk_order_payment_amounts CHECK (
  status <> 'PAID' OR (
    (payment_method = 'CASH' AND cash_amount = total_amount AND transfer_amount = 0) OR
    (payment_method = 'TRANSFER' AND transfer_amount = total_amount AND cash_amount = 0) OR
    (payment_method = 'SPLIT' AND cash_amount > 0 AND transfer_amount > 0 AND (cash_amount + transfer_amount) = total_amount)
  )
);

-- 3. CHECK: Chống đệ quy Combo (FR-0.4)
ALTER TABLE combo_items ADD CONSTRAINT chk_combo_no_self_ref
  CHECK (parent_product_id <> child_product_id);

-- 4. UNIQUE: Master Data & Work Schedules
CREATE UNIQUE INDEX uq_mdm_category_normalized ON master_data (category, normalized_name);
CREATE UNIQUE INDEX uq_schedule_cell ON work_schedules (week_start_date, day_of_week, time_slot);

-- 5. Partial Unique Index: 1 bàn vật lý = tối đa 1 đơn đang mở
CREATE UNIQUE INDEX idx_one_active_order_per_table
ON orders (table_id)
WHERE status IN ('PENDING', 'SERVING') AND table_id IS NOT NULL;

-- 6. Composite indexes tối ưu lọc dưới 20ms cho Base Table & Tách bếp
CREATE INDEX idx_orders_created_status ON orders (created_at DESC, status, payment_method);
CREATE INDEX idx_order_items_order_kitchen ON order_items (order_id, kitchen_status);
CREATE INDEX idx_imports_date_mdm ON inventory_imports (import_date DESC, ingredient_mdm_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_settlements_date ON cash_drawer_settlements (settlement_date DESC);
```

## 4. Concurrency Control (Khoá dòng & Chống AB-BA Deadlock)

- Mọi thao tác thay đổi trạng thái đơn hàng, tách bếp (`split-kitchen`), thanh toán (`checkout`), chuyển/gộp/đổi bàn (`MOVE`/`MERGE`/`SWAP`) **MUST** dùng `prisma.$transaction()` interactive mode.
- Bên trong transaction **MUST** dùng raw query `SELECT ... FOR UPDATE`.
- **Thứ tự khoá bắt buộc chống AB-BA Deadlock:**
  1. **ALWAYS** khoá bảng `orders` trước theo thứ tự `id ASC`:
     ```typescript
     await tx.$queryRaw`SELECT * FROM orders WHERE id IN (${Prisma.join(orderIds)}) ORDER BY id ASC FOR UPDATE`;
     ```
  2. Sau đó mới khoá bảng `dining_tables` theo thứ tự `id ASC`:
     ```typescript
     await tx.$queryRaw`SELECT * FROM dining_tables WHERE id IN (${Prisma.join(tableIds)}) ORDER BY id ASC FOR UPDATE`;
     ```
- Thời gian giữ khoá: dưới 50ms. **NEVER** gọi external API (VietQR, Cloudflare R2) hoặc đọc/ghi file bên trong transaction đã khoá.

## 5. Soft Delete Pattern

| Bảng | Cột | Ý nghĩa |
|------|-----|---------|
| `employees` | `is_deleted` | Xoá mềm nhân viên |
| `inventory_imports` | `is_deleted` | Xoá mềm phiếu nhập |
| `users` | `is_active` | Vô hiệu hoá tài khoản |
| `products` | `is_available` | Ẩn món khỏi menu |
| `master_data` | `is_active` | Vô hiệu hoá danh mục |

- Mọi query lấy danh sách active **MUST** filter `WHERE is_deleted = FALSE` (hoặc `is_active = TRUE`).
- **Ngoại lệ Lịch làm việc (`EC-HR-02`):** Khi truy vấn `GET /api/v1/schedules`, **KHÔNG** lọc bỏ các nhân viên có `is_deleted = TRUE` đã được gán vào các ô ca làm việc trong tuần để hiển thị tag màu xám mờ kèm nhãn `(Đã nghỉ)` và chống crash bảng.

## 6. State Machine Enforcement (Đồng bộ `02-verified-state-machines.mmd`)

### 6.1. Order Status (`orders.status`):
```
QR_CODE (DINE_IN)     → PENDING → SERVING → PAID / MERGED / VOIDED
                      → PENDING → VOIDED (Thu ngân từ chối đơn QR ảo, giải phóng bàn)
POS_COUNTER (Bàn/MV)  → SERVING → PAID / MERGED / VOIDED
                        PAID    → VOIDED (Quản lý/Admin có quyền invoices:void + void_reason >= 10 ký tự)
```
- Khi đơn đang ở `PENDING` và thu ngân bấm `[Duyệt đơn]` hoặc `[Tách đơn]` (`split-kitchen`), hệ thống tự động chuyển `order.status` từ `'PENDING'` sang `'SERVING'` và `dining_tables.status` từ `'PENDING'` sang `'OCCUPIED'`.
- Khi bấm `[In tạm tính (VietQR)]`, giữ nguyên `status = 'SERVING'`.
- **FORBIDDEN** transitions: `PAID → SERVING`, `PAID → PENDING`, `MERGED → *`, `VOIDED → *`.

### 6.2. OrderItem Kitchen Status (`order_items.kitchen_status`):
```
NEW → PRINTED   (via split-kitchen; nếu station='COMBO' phải phân rã qua combo_items)
NEW → [DELETED] (hard delete hoặc sửa trực tiếp, chỉ khi còn NEW — EC-POS-06 Nhánh A)
PRINTED → CANCELLED (huỷ món sau khi đã in bếp, trừ total_amount & in PHIẾU BÁO HUỶ MÓN — EC-POS-06 Nhánh B)
```
- Khi đơn thực hiện `MOVE` / `MERGE` / `SWAP`, các món đã `PRINTED` **MUST** giữ nguyên `kitchen_status = 'PRINTED'`.
- **FORBIDDEN** transitions: `PRINTED → NEW`, `CANCELLED → *`, hoặc Hard Delete bản ghi đã `PRINTED`.

### 6.3. DiningTable Status (`dining_tables.status`):
```
AVAILABLE (Xanh lá) → PENDING (Cam nhấp nháy, khi khách quét QR gửi đơn lần đầu)
AVAILABLE (Xanh lá) → OCCUPIED (Đỏ, khi tạo đơn tại POS hoặc nhận bàn MOVE tới)
PENDING   (Cam)     → OCCUPIED (Đỏ, khi thu ngân duyệt đơn hoặc tách bếp)
PENDING   (Cam)     → AVAILABLE (Xanh lá, khi từ chối đơn QR ảo -> active_order_id = NULL)
OCCUPIED  (Đỏ)      → AVAILABLE (Xanh lá, khi PAID / MOVE đi / MERGE đi / VOIDED -> active_order_id = NULL)
```
