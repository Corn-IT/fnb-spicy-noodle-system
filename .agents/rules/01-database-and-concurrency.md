---
trigger: model_decision
description: Prisma database schema, PostgreSQL data types, transactions, SELECT FOR UPDATE locking, and concurrency rules for FnB API.
---

# 01 — Cơ sở Dữ liệu & Xử lý Đồng thời (Database & Concurrency Rules)

> Áp dụng cho: Mọi Agent thao tác trên Prisma Schema, Migrations, Services và SQL Transactions. Đồng bộ 100% với `apps/api-server/prisma/schema.prisma` (20 bảng, 20 migrations) và `docs/architecture/01-verified-erd.mmd`.

---

## 1. Kiểu Dữ liệu Bắt buộc (Hard Invariant 10)

- Mọi cột tiền tệ (`price`, `extra_price`, `unit_price`, `subtotal_amount`, `discount_amount`, `total_amount`, `cash_amount`, `transfer_amount`, `daily_limit`, `monthly_limit`, `yearly_limit`, `value`, `max_discount_amount`, `min_order_amount`, `total_cost`, `opening_budget`, `total_cash_sales`, `total_transfer_sales`, `total_cash_imports`, `expected_cash_in_drawer`, `actual_counted_cash`, `discrepancy_amount`) **MUST** dùng `NUMERIC(12, 2)` trong PostgreSQL và `Decimal` (`@db.Decimal(12, 2)`) trong Prisma.
- **FORBIDDEN**: `FLOAT`, `DOUBLE`, `REAL`, hoặc `Int` cho tiền tệ.
- Timestamps **MUST** dùng `TIMESTAMPTZ(6)` (`DateTime @db.Timestamptz(6)`).
- JSONB cho: `metadata`, `attachment_urls`, `permissions`, `ui_preferences`, `last_revoked_notice`, `discount_snapshot`, `active_weekdays`, `table_transfer_logs`, `pending_payment_edit`, `modifiers_snapshot`, `denominations_detail`, `employee_ids`.

---

## 2. Schema — 20 Bảng Vật lý Chuẩn (`schema.prisma`)

### 2.1. `master_data`
| Cột | Kiểu | Ràng buộc |
|-----|------|-----------|
| `id` | SERIAL | PK |
| `category` | VARCHAR(32) | NOT NULL: `POSITION`, `SPECIALTY`, `INGREDIENT`, `UNIT`, `SUPPLIER`, `MENU_CATEGORY`, `KITCHEN_STATION`, và nhóm nội bộ `SYSTEM_CONFIG` |
| `name` | VARCHAR(255) | NOT NULL (Title Case) |
| `normalized_name` | VARCHAR(255) | NOT NULL, Composite UNIQUE `uq_mdm_category_normalized (category, normalized_name)` |
| `metadata` | JSONB | DEFAULT `'{}'` (`default_unit`, `last_price`, `station`, `storeSettings`, assets, payroll/budget/QR security/VAPID config...) |
| `is_active` | BOOLEAN | NOT NULL DEFAULT TRUE |
| `created_at` | TIMESTAMPTZ(6) | NOT NULL DEFAULT NOW() |

### 2.2. `employees`
| Cột | Kiểu | Ràng buộc |
|-----|------|-----------|
| `id` | SERIAL | PK |
| `full_name` | VARCHAR(255) | NOT NULL |
| `short_name` | VARCHAR(64) | NOT NULL (`V.Anh` hoặc `N.V.Anh (#12)` khi trùng) |
| `dob`, `phone`, `address` | DATE / VARCHAR(32) / TEXT | Nullable |
| `citizen_id`, `citizen_id_issued_place` | VARCHAR(32) UNIQUE / VARCHAR(255) | Nullable |
| `position_id`, `specialty_id` | INT | Nullable FK → `master_data(id)` `ON DELETE RESTRICT` |
| `start_date` | DATE | Nullable |
| `bank_name`, `bank_account_no`, `bank_account_name` | VARCHAR | Nullable |
| `avatar_url` | VARCHAR(2048) | Nullable (`/api/v1/public/avatars/:employeeId` hoặc URL) |
| `attachment_urls` | JSONB | DEFAULT `'[]'` |
| `note` | TEXT | Nullable |
| `is_deleted`, `deleted_at` | BOOLEAN / TIMESTAMPTZ(6) | Soft delete / ngưng hoạt động |
| `created_at` | TIMESTAMPTZ(6) | NOT NULL DEFAULT NOW() |

### 2.3. `users`
| Cột | Kiểu | Ràng buộc |
|-----|------|-----------|
| `id` | SERIAL | PK |
| `employee_id` | INT | NOT NULL **UNIQUE** FK → `employees(id)` (`ON DELETE RESTRICT`, Strict 1-1) |
| `username` | VARCHAR(64) | NOT NULL UNIQUE |
| `password_hash` | TEXT | NOT NULL (Bcrypt cost=10, min 6 chars) |
| `is_super_admin` | BOOLEAN | NOT NULL DEFAULT FALSE |
| `role_label` | VARCHAR(64) | Nullable (nhãn vai trò hiển thị tuỳ chỉnh) |
| `permissions` | JSONB | NOT NULL DEFAULT `'{}'` (14 nhóm quyền) |
| `ui_preferences` | JSONB | NOT NULL DEFAULT `'{}'` (`theme`, `sidebarWidth`, `columnWidths`, `displayScale`, `navOrder`, `navGroupOrder`, `sidebarCollapsed`, `voiceAlertEnabled`) |
| `is_active` | BOOLEAN | NOT NULL DEFAULT TRUE |
| `active_session_id`, `active_session_ip`, `active_session_device`, `active_session_agent`, `active_session_at` | VARCHAR / TIMESTAMPTZ(6) | Single-Session tracking |
| `last_revoked_notice` | JSONB | Nullable (`{ reason, at }`) |
| `created_at` | TIMESTAMPTZ(6) | NOT NULL DEFAULT NOW() |

### 2.4. `dining_tables`
- `id`, `name` (UNIQUE, chỉ bàn vật lý `Bàn 01`..`Bàn N`, **FORBIDDEN** tạo bàn `"Mang về"`), `qr_token` (UNIQUE, short token), `status` (`AVAILABLE | PENDING | OCCUPIED`), `active_order_id` (Nullable FK → `orders(id)` `ON DELETE SET NULL`).

### 2.5. `products`, `combo_items`, `modifier_groups`, `modifiers`
- `products`: `id`, `name`, `subtitle` (`VARCHAR(255)`), `category_id` (FK → `master_data` `ON DELETE SET NULL`), `price` (`DECIMAL(12,2)`), `station` (`BEP_NAU | BEP_CHIEN | PHA_CHE | COMBO | BEP_*`), `is_available`, `image_url`, `sort_order`, `created_at`.
- `combo_items`: composite PK `(parent_product_id, child_product_id)`, `quantity > 0`, CHECK `parent_product_id <> child_product_id`.
- `modifier_groups`: `id`, `product_id` (`ON DELETE CASCADE`), `name`, `is_required`, `max_select`, `is_auto_select`, `allow_substitution`.
- `modifiers`: `id`, `group_id` (`ON DELETE CASCADE`), `name`, `extra_price` (`DECIMAL(12,2)`), `is_default_checked`, `is_available`, `default_substitute_name`, `allowed_substitute_names` (`JSONB` nullable: `null` = mọi món anh em hợp lệ, `[]` = cấm đổi).

### 2.6. `payment_accounts`
- `id`, `label`, `bank_code`, `account_no`, `account_name`, `priority`, `is_active`, `daily_limit`, `monthly_limit`, `yearly_limit` (`DECIMAL(12,2)` nullable > 0), `created_at`, `updated_at`.
- UNIQUE `(bank_code, account_no)`; Index `(is_active, priority)`. *(Lưu ý: KHÔNG có cột `bank_name` trong DB — tên ngân hàng ánh xạ từ `packages/shared/src/constants/vietqr-banks.ts` theo `bank_code`.)*

### 2.7. `discounts` & `discount_targets`
- `discounts`: `id`, `code` (UNIQUE), `name`, `value_type` (`PERCENT | FIXED`), `value` (`DECIMAL(12,2)`), `max_discount_amount`, `scope` (`ORDER | CATEGORY | PRODUCT`), `min_order_amount`, `starts_at`, `ends_at`, `active_weekdays` (`JSONB`), `time_window_start`, `time_window_end`, `usage_limit`, `used_count`, `is_active`, `is_archived`, `created_by` (FK → `users`), `created_at`, `updated_at`.
- `discount_targets`: `id`, `discount_id` (`ON DELETE CASCADE`), `category_id` (FK → `master_data`), `product_id` (FK → `products`), CHECK chỉ 1 trong 2 khác NULL (`chk_discount_target_one`).

### 2.8. `orders` & `order_items`
- `orders`: `id`, `order_code` (UNIQUE `HD-YYYYMMDD-NNNN`), `order_type` (`DINE_IN | TAKEAWAY`), `order_source` (`QR_CODE | POS_COUNTER`), `table_id`, `takeaway_number`, `takeaway_label_format` (`NUMBER | LETTER` snapshot), `status` (`PENDING | SERVING | PAID | MERGED | VOIDED`), `payment_method` (`CASH | TRANSFER | SPLIT`), `payment_account_id` (FK → `payment_accounts`), `cash_amount`, `transfer_amount`, `subtotal_amount`, `discount_amount`, `discount_id` (FK → `discounts`), `discount_snapshot`, `total_amount`, `merged_into_order_id`, `table_transfer_logs`, `cashier_id`, `note`, `void_reason`, `pending_payment_edit` (`JSONB`), `created_at`, `paid_at`.
- `order_items`: `id`, `order_id` (`ON DELETE CASCADE`), `product_id` (`ON DELETE RESTRICT`), `quantity > 0`, `unit_price` (`DECIMAL(12,2)`), `modifiers_snapshot`, `item_note`, `batch_no`, `item_source` (`POS_COUNTER | QR_CODE`), `kitchen_status` (`NEW | PRINTED | CANCELLED`), `is_takeaway` (`BOOLEAN DEFAULT FALSE`), `created_at`.

### 2.9. `inventory_imports`, `cash_drawer_settlements`, `work_schedules`
- `inventory_imports`: `id`, `ingredient_mdm_id`, `supplier_mdm_id`, `supplier_name_snapshot`, `item_name_snapshot`, `unit_name`, `unit_price` (`DECIMAL(12,2)`), `quantity` (`DECIMAL(10,2)`), `total_cost` (`DECIMAL(12,2)`), `payment_source` (`CASH_DRAWER | EXTERNAL`), `import_date`, `note`, `created_by`, `is_deleted`, `deleted_at`, `created_at`.
- `cash_drawer_settlements`: `id`, `settlement_date`, `shift_name` (UNIQUE `uq_settlement_date_shift`), `opening_budget`, `total_cash_sales`, `total_transfer_sales`, `total_cash_imports`, `expected_cash_in_drawer`, `actual_counted_cash`, `discrepancy_amount`, `status` (`MATCHED | SURPLUS | SHORTAGE`), `denominations_detail`, `note`, `closed_by`, `created_at`.
- `work_schedules`: `id`, `week_start_date`, `day_of_week` (`0..6`), `time_slot` (UNIQUE `uq_schedule_cell`), `employee_ids` (`JSONB`, hỗ trợ cả `FULL_SHIFT` và `CUSTOM_HOURS`), `created_by`, `updated_at`.

### 2.10. `audit_logs` & `push_subscriptions`
- `audit_logs`: `id`, `module` (13 modules), `action`, `actor_id` (nullable), `actor_full_name`, `actor_username`, `summary`, `ip_address`, `device_label`, `metadata`, `created_at`. Indexes: `(module, created_at DESC)`, `(ip_address)`.
- `push_subscriptions`: `id`, `user_id` (`ON DELETE CASCADE`), `session_id`, `endpoint` (UNIQUE), `p256dh`, `auth`, `user_agent`, `device_label`, `created_at`, `updated_at`, `last_notified_at`. Index: `(user_id, session_id)`.

### 2.11. `pos_drafts` & `takeaway_sequences`
- `pos_drafts`: `id` (CUID), `order_type` (nullable), `table_id` (`ON DELETE SET NULL`), `items` (`JSONB`), `note`, `revision` (`INT DEFAULT 1`, optimistic concurrency `409`), `created_by`, `updated_by`, `submitted_order_id` (`ON DELETE SET NULL`), `submit_idempotency_key`, `submitted_at`, `created_at`, `updated_at`.
- `takeaway_sequences`: `business_date` (PK `CHAR(8)` ngày kinh doanh `+07:00`), `last_number` (`INT`), `updated_at`. Atomic increment/reset qua `INSERT ... ON CONFLICT DO UPDATE`.

---

## 3. Database Constraints, Indexes & Vietnamese Search Extension

- **Core CHECK constraints:** `chk_order_type_target`, `chk_order_payment_amounts`, `chk_order_discount_amounts`, `chk_discount_value`, `chk_discount_usage`, `chk_discount_target_one`, `chk_payment_accounts_limits_positive`, `chk_combo_no_self_ref`, `chk_order_item_source`, `chk_void_reason_required`, `chk_settlement_status_amounts`, `chk_settlement_note_required`.
- **Unique & Partial Unique Indexes:** `uq_mdm_category_normalized`, `uq_schedule_cell`, `uq_settlement_date_shift`, `uq_payment_accounts_bank_account`, `uq_discount_target_category`, `uq_discount_target_product`, `uq_push_subscriptions_endpoint`, `idx_one_active_order_per_table` (`WHERE status IN ('PENDING', 'SERVING') AND table_id IS NOT NULL`).
- **Search Extension (`20261123000000_add_unaccent_search_norm`):** `CREATE EXTENSION IF NOT EXISTS unaccent;` và hàm `f_search_norm(text)` (bỏ dấu, `đ->d`, lowercase, `y->i`) **chỉ dùng cho truy vấn tìm kiếm**, không dùng thay `master_data.normalized_name`.

---

## 4. Concurrency Control (Khoá dòng & Chống AB-BA Deadlock — Hard Invariant 5)

- Mọi thao tác `split-kitchen`, `table-action` (`MOVE`/`MERGE`/`SWAP`/`TO_TAKEAWAY`), `applyDiscount`/`removeDiscount`, `checkout`, `split-checkout`, `void` **MUST** chạy trong `prisma.$transaction()` dùng `SELECT ... FOR UPDATE`.
- **Thứ tự khoá bắt buộc:**
  1. `orders` theo `ORDER BY id ASC FOR UPDATE`
  2. `dining_tables` theo `ORDER BY id ASC FOR UPDATE`
  3. `discounts` theo `ORDER BY id ASC FOR UPDATE` (nếu có cộng/trừ `used_count`)
- **NEVER** gọi external HTTP/TCP (VietQR, Web Push, LAN printer, TTS) bên trong transaction đang giữ khoá.

---

## 5. Soft Delete & State Machines (Đồng bộ `02-verified-state-machines.mmd`)

- **Soft Delete:** `employees.is_deleted` (+ `deleted_at`), `inventory_imports.is_deleted` (+ `deleted_at`), `users.is_active`, `products.is_available`, `modifiers.is_available`, `master_data.is_active`, `discounts.is_archived`.
- **Ngoại lệ `EC-HR-02`:** `GET /api/v1/schedules` và `GET /api/v1/payroll` KHÔNG lọc bỏ nhân viên `is_deleted = true` đã có lịch trong kỳ để hiển thị trạng thái `(Đã nghỉ)` không gây crash.
- **Order Lifecycle:**
  - `QR_CODE` (Tại bàn hoặc QR Mang về) → `PENDING` → `SERVING` (`approve` / `split-kitchen`) hoặc `VOIDED` (từ chối hoặc `QrAutoCancelService`).
  - `POS_COUNTER` → `SERVING` → `PAID` (`checkout`), `MERGED` (`MERGE`), hoặc `VOIDED` (`cancel`).
  - `SERVING` hỗ trợ `split-checkout` (tạo đơn con `PAID`, đơn gốc giữ `SERVING`), `provisional-bill` / `split-provisional-bill` (giữ nguyên `SERVING`), và `TO_TAKEAWAY`.
  - `PAID` hỗ trợ yêu cầu sửa PTTT (`pending_payment_edit` → duyệt/từ chối bởi `invoices:approve`) và `VOIDED` ngoại lệ (`invoices:void` + `void_reason >= 10` ký tự).
  - **FORBIDDEN:** `PAID → SERVING|PENDING`, `MERGED → *`, `VOIDED → *`, `PRINTED → NEW`, `CANCELLED → *`, hoặc Hard Delete món đã `PRINTED`.
