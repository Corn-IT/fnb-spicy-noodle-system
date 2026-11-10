# Story 02: Thiết lập NestJS Core, Prisma Schema 13 Bảng, SQL Constraints & Seed Data

> **Story ID:** `STORY-02`  
> **Tên file:** `docs/stories/story-02-prisma-schema-migrations-and-seed.md`  
> **Phase thực thi:** Phase 4B (Database & Backend Core)  
> **Agent phụ trách:** Codex  
> **Phụ thuộc (Dependencies):** `story-01-monorepo-and-shared-contracts.md`  
> **Quy tắc bất biến áp dụng:** Hard Invariant 2 (`chk_order_type_target`), Hard Invariant 3 (`combo_items`), Hard Invariant 6 (`chk_order_payment_amounts`), Hard Invariant 7 (`uq_mdm_category_normalized`), Hard Invariant 9 (`users.ui_preferences`), Hard Invariant 10 (100% cột tiền tệ `NUMERIC(12, 2)`)  
> **Tài liệu tham chiếu:** `docs/architecture/01-verified-erd.mmd`, `docs/architecture/04-audit-report.md`, `.agents/rules/01-database-and-concurrency.md`, `.agents/rules/06-error-handling-and-logging.md`, `docs/bmad/02-RBAC-And-MDM-Matrix.md` (§7)

---

## 1. MỤC TIÊU (OBJECTIVES)

Khởi tạo ứng dụng Backend `@fnb/api-server` (`apps/api-server/`) trên nền tảng **NestJS v10+ & Prisma v5+**, hiện thực hoá chính xác 100% sơ đồ vật lý **13 bảng** trong `docs/architecture/01-verified-erd.mmd`, thiết lập đầy đủ các **SQL CHECK Constraints, Partial Unique Index và Composite Indexes** trong migration, xây dựng hệ thống hạ tầng dùng chung (`PrismaService`, `GlobalExceptionFilter`, `RequestIdMiddleware`, `ZodValidationPipe`, `HealthController`) và viết kịch bản dữ liệu mồi chuẩn (`prisma/seed.ts`) cho quán mì cay.

---

## 2. DANH SÁCH FILE CHECKLIST (FILE MANIFEST & CHECKLIST)

### 2.1. Prisma Schema, Migration & Seed (`apps/api-server/prisma/`)
- [ ] `apps/api-server/prisma/schema.prisma` — Định nghĩa đầy đủ 13 models vật lý khớp từng cột với `01-verified-erd.mmd` và `.agents/rules/01` (§2):
  1. `MasterData` (`@@map("master_data")`)
  2. `Employee` (`@@map("employees")`)
  3. `User` (`@@map("users")`)
  4. `DiningTable` (`@@map("dining_tables")`)
  5. `Product` (`@@map("products")`)
  6. `ComboItem` (`@@map("combo_items")`)
  7. `ModifierGroup` (`@@map("modifier_groups")`)
  8. `Modifier` (`@@map("modifiers")`)
  9. `Order` (`@@map("orders")`)
  10. `OrderItem` (`@@map("order_items")`)
  11. `InventoryImport` (`@@map("inventory_imports")`)
  12. `CashDrawerSettlement` (`@@map("cash_drawer_settlements")`)
  13. `WorkSchedule` (`@@map("work_schedules")`)
- [ ] `apps/api-server/prisma/migrations/<timestamp>_init_schema_and_constraints/migration.sql` — Chứa DDL tạo 13 bảng + **BẮT BUỘC** nhúng nguyên văn 6 cụm SQL Constraints & Indexes tại `.agents/rules/01` (§3).
- [ ] `apps/api-server/prisma/seed.ts` — Script khởi tạo dữ liệu mẫu idempotent (`upsert` / transaction):
  - 2 nhân viên & 2 tài khoản liên kết 1-1: `superadmin` (`is_super_admin = true`) và `cashier01` (`Password@123` bcrypt cost=10).
  - 5 nhóm `master_data` (`POSITION`, `SPECIALTY`, `INGREDIENT`, `UNIT`, `SUPPLIER`) theo đúng `docs/bmad/02-RBAC-And-MDM-Matrix.md` (§7.1 & §7.2).
  - 30 bàn ăn vật lý (`Bàn 01` đến `Bàn 30`, kèm `qr_token` duy nhất; **CẤM TUYỆT ĐỐI** tạo bản ghi bàn `"Mang về"`).
  - Thực đơn mẫu thuộc đủ 4 nhóm `station`: `BEP_NAU` (Mì kim chi bò, Mì hải sản, Lẩu mini), `BEP_CHIEN` (Khoai tây chiên, Phô mai que, Cá viên chiên), `PHA_CHE` (Trà đào cam sả, Trà sữa truyền thống, Pepsi), và `COMBO` (Combo Đôi liên kết qua `combo_items`).
  - Nhóm tuỳ chọn `modifier_groups` & `modifiers`: `"Cấp độ cay"` (`is_required = true`, `max_select = 1`, Cấp độ 0 đến Cấp độ 7, `extra_price = 0.00`) và `"Thêm Topping"` (`is_required = false`, `max_select = 5`, Thêm Bò viên +15.000đ, Thêm Phô mai +10.000đ, Thêm Tôm +20.000đ).

### 2.2. Hạ tầng NestJS Core (`apps/api-server/src/`)
- [ ] `apps/api-server/src/config/env.config.ts` — Đọc và validate biến môi trường qua Zod, hỗ trợ song song `process.env.FNB_DATABASE_URL ?? process.env.DATABASE_URL` (tương tự cho `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `PORT`, `CORS_ORIGIN` theo `DISCREPANCY-ENV-01`).
- [ ] `apps/api-server/src/common/prisma/prisma.service.ts` — `PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy`.
- [ ] `apps/api-server/src/common/prisma/prisma.module.ts` — `@Global()` module export `PrismaService`.
- [ ] `apps/api-server/src/common/middleware/request-id.middleware.ts` — Gắn `req['requestId'] = randomUUID()` và header `X-Request-Id`.
- [ ] `apps/api-server/src/common/filters/global-exception.filter.ts` — Chuẩn hoá mọi exception về đúng `ApiErrorResponse` (`statusCode`, `error`, `message`, `code`, `details`, `requestId`); ẩn hoàn toàn stack trace ở production.
- [ ] `apps/api-server/src/common/pipes/zod-validation.pipe.ts` — Validate request body/query/params bằng Zod schema từ `@fnb/shared`; khi lỗi trả về HTTP `422 Unprocessable Entity` kèm `code: ErrorCodes.VALIDATION_FAILED` và `details.fieldErrors`.
- [ ] `apps/api-server/src/common/utils/normalized-string.util.ts` — Hiện thực hoá hàm `normalizeVietnameseString(raw: string)` và `toTitleCase(raw: string)` theo đúng `.agents/rules/00` (§3.3) và `docs/bmad/02` (§6.3).
- [ ] `apps/api-server/src/health/health.controller.ts` — Endpoint `GET /api/v1/health` (Public, kiểm tra `SELECT 1` trên DB, trả về `{ status: 'ok', timestamp, database: 'connected', uptime }`).
- [ ] `apps/api-server/src/app.module.ts` & `apps/api-server/src/main.ts` — Bootstrap NestJS server, CORS, cookie-parser, global filter, logging interceptor.
- [ ] `apps/api-server/src/common/__tests__/core-infra.spec.ts` — Unit test cho `normalizeVietnameseString`, `toTitleCase`, `ZodValidationPipe`, `GlobalExceptionFilter`, và `HealthController`.

---

## 3. CHI TIẾT KỸ THUẬT & NGHIỆP VỤ (TECHNICAL SPECIFICATIONS)

### 3.1. Kiểu Tiền tệ Bắt buộc (Hard Invariant 10)
Toàn bộ 14 cột tiền tệ trong `schema.prisma` **MUST** khai báo `@db.Decimal(12, 2)`:
- `products.price`
- `modifiers.extra_price`
- `orders.cash_amount`, `orders.transfer_amount`, `orders.total_amount`
- `order_items.unit_price`
- `inventory_imports.unit_price`, `inventory_imports.total_cost` (riêng `quantity` dùng `@db.Decimal(10, 2)`)
- `cash_drawer_settlements.opening_budget`, `total_cash_sales`, `total_transfer_sales`, `total_cash_imports`, `expected_cash_in_drawer`, `actual_counted_cash`, `discrepancy_amount`.

### 3.2. Sáu Cụm Ràng buộc SQL Vật lý Bắt buộc trong Migration (`.agents/rules/01` §3)
File `migration.sql` **MUST** thực thi đầy đủ các câu lệnh DDL sau:
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

---

## 4. TIÊU CHÍ NGHIỆM THU (ACCEPTANCE CRITERIA)

- [ ] **AC-02.1 (13 Physical Tables & Columns):** Đối chiếu `schema.prisma` với `docs/architecture/01-verified-erd.mmd` khớp 100% tên bảng, tên cột, kiểu dữ liệu, khoá ngoại (`ON DELETE CASCADE` / `RESTRICT`) và giá trị mặc định.
- [ ] **AC-02.2 (Database Constraints Active):** Thực thi thử câu lệnh INSERT vi phạm `chk_order_type_target` (đơn `TAKEAWAY` có `table_id = 1` hoặc đơn `DINE_IN` có `table_id = NULL`) hoặc vi phạm `chk_order_payment_amounts` đều bị PostgreSQL chặn ngay ở tầng DB.
- [ ] **AC-02.3 (No Takeaway Table in `dining_tables`):** Chạy `npx prisma db seed` tạo đúng 30 bàn vật lý (`Bàn 01`..`Bàn 30`), hoàn toàn không có bản ghi bàn `"Mang về"`.
- [ ] **AC-02.4 (422 Zod Pipe & RequestId Tracing):** Khi gửi payload sai schema tới bất kỳ route nào dùng `ZodValidationPipe`, API trả về đúng HTTP `422` kèm `code: 'VALIDATION_FAILED'`, `details.fieldErrors` và `requestId` hợp lệ.
- [ ] **AC-02.5 (Typecheck & Tests):** `pnpm -r typecheck` và `pnpm -r test` pass 100%.
