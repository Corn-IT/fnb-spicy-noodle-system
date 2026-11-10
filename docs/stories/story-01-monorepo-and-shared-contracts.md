# Story 01: Khởi tạo Turborepo Monorepo & Gói Hợp đồng Dùng chung (`@fnb/shared`)

> **Story ID:** `STORY-01`  
> **Tên file:** `docs/stories/story-01-monorepo-and-shared-contracts.md`  
> **Phase thực thi:** Phase 4B (Backend & Shared Foundation)  
> **Agent phụ trách:** Codex / Antigravity  
> **Phụ thuộc (Dependencies):** Không có (Story nền tảng đầu tiên)  
> **Quy tắc bất biến áp dụng:** Hard Invariant 1 (Cô lập Module), Hard Invariant 2 (TAKEAWAY vs DINE_IN), Hard Invariant 3 (Delta Split Enums), Hard Invariant 6 (Cashflow Formula Schema), Hard Invariant 8 (RBAC & Error Codes), Hard Invariant 10 (Monetary Decimal Validation)  
> **Tài liệu tham chiếu:** `AGENTS.md`, `.agents/rules/00-architecture-and-monorepo.md`, `.agents/rules/06-error-handling-and-logging.md`, `docs/bmad/02-RBAC-And-MDM-Matrix.md`, `docs/architecture/01-verified-erd.mmd`

---

## 1. MỤC TIÊU (OBJECTIVES)

Thiết lập nền tảng kiến trúc **Turborepo + pnpm Monorepo** gồm đúng 3 workspace packages (`@fnb/shared`, `@fnb/api-server`, `@fnb/web-app`) và hiện thực hoá đầy đủ 100% gói hợp đồng dùng chung `@fnb/shared` (`packages/shared/`). Gói `@fnb/shared` đóng vai trò **Single Source of Truth** cho toàn bộ Enums (`as const` + `z.enum`), hằng số mã lỗi (`ErrorCodes`), cấu trúc phản hồi lỗi chuẩn (`ApiErrorResponseSchema`), và toàn bộ Zod Validation Schemas / TypeScript DTOs dùng chung giữa Backend NestJS và Frontend React.

---

## 2. DANH SÁCH FILE CHECKLIST (FILE MANIFEST & CHECKLIST)

### 2.1. Cấu hình Monorepo Gốc (Root Workspace)
- [x] `package.json` — Root workspace scripts (`build`, `typecheck`, `lint`, `test`, `test:coverage`), `packageManager: "pnpm@..."`, devDependencies (`turbo`, `typescript`).
- [x] `pnpm-workspace.yaml` — Khai báo đúng `packages: ['apps/*', 'packages/*']`.
- [x] `turbo.json` — Cấu hình pipeline tasks (`build`, `typecheck`, `lint`, `test`, `test:coverage`) với `dependsOn: ["^build"]` hợp lệ.
- [x] `tsconfig.base.json` — Cấu hình TypeScript strict mode (`strict: true`, `noImplicitAny: true`, `strictNullChecks: true`, `noUnusedLocals: true`, `esModuleInterop: true`, `skipLibCheck: true`, `moduleResolution: "bundler"` hoặc `"node"`).
- [x] `.env.example` — Khai báo đầy đủ biến môi trường mẫu hỗ trợ song song tiền tố `FNB_*` và biến chuẩn Prisma CLI (`DATABASE_URL`, `JWT_SECRET`, `PORT`, `CORS_ORIGIN`, `VITE_API_BASE_URL`, `VITE_SOCKET_URL`).
- [x] `.gitignore` — Chặn commit `.env`, `node_modules/`, `dist/`, `.turbo/`, `coverage/`.

### 2.2. Gói Hợp đồng Dùng chung (`packages/shared/`)
- [x] `packages/shared/package.json` — `name: "@fnb/shared"`, chỉ phụ thuộc `zod` và `typescript` (ZERO dependencies vào `apps/*`, `prisma`, `react`, `@nestjs/*`).
- [x] `packages/shared/tsconfig.json` — Kế thừa `../../tsconfig.base.json`.
- [x] `packages/shared/vitest.config.ts` — Cấu hình unit test cho toàn bộ Zod schemas và enums.
- [x] `packages/shared/src/enums/station.enum.ts` — Định nghĩa `KitchenStation` (3 trạm vật lý: `BEP_NAU`, `BEP_CHIEN`, `PHA_CHE`) và `ProductStation` (4 giá trị: thêm `COMBO`).
- [x] `packages/shared/src/enums/order.enum.ts` — Định nghĩa `OrderType` (`DINE_IN`, `TAKEAWAY`), `OrderSource` (`QR_CODE`, `POS_COUNTER`), `OrderStatus` (`PENDING`, `SERVING`, `PAID`, `MERGED`, `VOIDED`), `KitchenStatus` (`NEW`, `PRINTED`, `CANCELLED`), `PaymentMethod` (`CASH`, `TRANSFER`, `SPLIT`), `TableStatus` (`AVAILABLE`, `PENDING`, `OCCUPIED`), `TableActionType` (`MOVE`, `MERGE`, `SWAP`).
- [x] `packages/shared/src/enums/mdm-cashflow.enum.ts` — Định nghĩa `MdmCategory` (`POSITION`, `SPECIALTY`, `INGREDIENT`, `UNIT`, `SUPPLIER`), `PaymentSource` (`CASH_DRAWER`, `EXTERNAL`), `SettlementStatus` (`MATCHED`, `SURPLUS`, `SHORTAGE`).
- [x] `packages/shared/src/constants/error-codes.ts` — Định nghĩa object hằng số `ErrorCodes` (`as const`) cho toàn hệ thống.
- [x] `packages/shared/src/constants/socket-events.ts` — Định nghĩa tên sự kiện và room chuẩn của Socket.io (`/pos` namespace).
- [x] `packages/shared/src/schemas/api-error.schema.ts` — Định nghĩa `ApiErrorResponseSchema`, `PaginationQuerySchema`, `PaginatedResponseSchema`.
- [x] `packages/shared/src/schemas/rbac.schema.ts` — Định nghĩa `ModulePermissionsSchema`, `UserPermissionsSchema` (đầy đủ CRUD + sub-permissions: `splitKitchen`, `tableAction`, `checkout`, `reprint`, `void`, `config`, `manage`), `LoginRequestSchema`, `AuthResponseSchema`, `CreateUserSchema`, `UpdatePermissionsSchema`.
- [x] `packages/shared/src/schemas/mdm.schema.ts` — Định nghĩa `MdmItemSchema`, `MdmLookupQuerySchema`, `UpsertMdmSchema`.
- [x] `packages/shared/src/schemas/menu.schema.ts` — Định nghĩa `ModifierSchema`, `ModifierGroupSchema`, `ComboItemSchema`, `ProductSchema`, `CreateProductSchema`, `UpdateProductSchema`, `DiningTableSchema`, `PublicMenuResponseSchema`.
- [x] `packages/shared/src/schemas/order.schema.ts` — Định nghĩa `OrderItemModifierSnapshotSchema`, `CreateOrderItemInputSchema`, `CreateQrOrderSchema`, `CreatePosOrderSchema`, `UpdateOrderItemSchema`, `SplitKitchenResponseSchema`, `TableActionRequestSchema`, `TableActionResponseSchema`, `ProvisionalBillResponseSchema`, `CheckoutOrderRequestSchema`, `InvoiceFilterQuerySchema`, `VoidInvoiceRequestSchema`.
- [x] `packages/shared/src/schemas/inventory.schema.ts` — Định nghĩa `InventoryImportItemInputSchema`, `CreateInventoryImportBatchSchema`, `InventoryImportFilterQuerySchema`.
- [x] `packages/shared/src/schemas/cashflow.schema.ts` — Định nghĩa `DenominationsDetailSchema` (9 mệnh giá từ `500000` đến `1000`), `CreateSettlementRequestSchema`, `UpdateDefaultBudgetSchema`, `SettlementResponseSchema`.
- [x] `packages/shared/src/schemas/hr-schedule.schema.ts` — Định nghĩa `CreateEmployeeSchema`, `UpdateEmployeeSchema`, `EmployeeFilterQuerySchema`, `ScheduleCellSchema`, `BulkSaveScheduleRequestSchema`, `CopyPreviousWeekRequestSchema`.
- [x] `packages/shared/src/schemas/profile.schema.ts` — Định nghĩa `UiPreferencesSchema` (`theme`, `sidebarWidth`, `columnWidths`), `UpdateProfileSchema`, `UpdateUiPreferencesSchema`.
- [x] `packages/shared/src/index.ts` — Barrel file re-export toàn bộ enums, constants, schemas và inferred types (`z.infer`).
- [x] `packages/shared/src/__tests__/schemas.spec.ts` — Bộ unit test kiểm chứng toàn bộ ràng buộc Zod (đặc biệt là `DINE_IN` vs `TAKEAWAY`, `SPLIT` payment, `discrepancy` note, `voidReason >= 10` ký tự, chống đệ quy `combo_items`).

### 2.3. Khung Khởi tạo Tối thiểu cho 2 Apps (Để `pnpm -r build` & `typecheck` thông suốt)
- [x] `apps/api-server/package.json` & `apps/api-server/tsconfig.json` — Khai báo `"@fnb/shared": "workspace:*"`.
- [x] `apps/web-app/package.json` & `apps/web-app/tsconfig.json` — Khai báo `"@fnb/shared": "workspace:*"` và path alias `"@/*": ["./src/*"]`.

---

## 3. CHI TIẾT KỸ THUẬT & NGHIỆP VỤ (TECHNICAL SPECIFICATIONS)

### 3.1. Quy tắc Enum Bắt buộc (`.agents/rules/00` §4.2)
- **FORBIDDEN** sử dụng từ khoá `enum` của TypeScript.
- **MUST** sử dụng `as const` object kết hợp `z.enum()`.
- Phân biệt rõ `KitchenStation` (3 trạm vật lý nhận phiếu in bếp) và `ProductStation` (có thêm `'COMBO'` cho sản phẩm):
  ```typescript
  export const KitchenStation = {
    BEP_NAU: 'BEP_NAU',
    BEP_CHIEN: 'BEP_CHIEN',
    PHA_CHE: 'PHA_CHE',
  } as const;
  export type KitchenStation = (typeof KitchenStation)[keyof typeof KitchenStation];
  export const KitchenStationSchema = z.enum(['BEP_NAU', 'BEP_CHIEN', 'PHA_CHE']);

  export const ProductStation = {
    ...KitchenStation,
    COMBO: 'COMBO',
  } as const;
  export type ProductStation = (typeof ProductStation)[keyof typeof ProductStation];
  export const ProductStationSchema = z.enum(['BEP_NAU', 'BEP_CHIEN', 'PHA_CHE', 'COMBO']);
  ```

### 3.2. Ràng buộc Nghiệp vụ trong Zod Schemas (`superRefine` / `refine`)
1. **`CreatePosOrderSchema` (Hard Invariant 2):**
   - Nếu `orderType === 'DINE_IN'`: `tableId` bắt buộc là số nguyên dương (`z.number().int().positive()`), không nhận `takeawayNumber`.
   - Nếu `orderType === 'TAKEAWAY'`: `tableId` bắt buộc là `null` hoặc `undefined`.
2. **`CheckoutOrderRequestSchema` (Hard Invariant 4 & 6, `EC-FIN-02`):**
   - Nếu `paymentMethod === 'SPLIT'`: bắt buộc `cashAmount > 0`, `transferAmount > 0`.
   - Kèm trường `printReceipt: z.boolean().default(true)`.
3. **`VoidInvoiceRequestSchema` (`EC-FIN-01`):**
   - Trường `voidReason`: `z.string().trim().min(10, 'Lý do huỷ hoá đơn phải có ít nhất 10 ký tự')`.
4. **`CreateSettlementRequestSchema` (Hard Invariant 6 & `EC-FIN-03`):**
   - Trường `denominationsDetail`: kiểm tra các key mệnh giá hợp lệ (`"500000"`, `"200000"`, `"100000"`, `"50000"`, `"20000"`, `"10000"`, `"50000"`, `"20000"`, `"10000"`, `"5000"`, `"2000"`, `"1000"`) với số tờ là số nguyên $\ge 0$.
5. **`CreateProductSchema` (`FR-0.4`):**
   - Nếu `station === 'COMBO'`: bắt buộc mảng `comboItems` có ít nhất 1 phần tử, mỗi phần tử có `quantity >= 1`.

### 3.3. Hằng số Mã lỗi Chuẩn (`ErrorCodes` — `.agents/rules/06` §2)
Phải định nghĩa đầy đủ 100% các mã lỗi trong `packages/shared/src/constants/error-codes.ts`:
- Auth & RBAC: `AUTH_TOKEN_MISSING`, `AUTH_TOKEN_EXPIRED`, `AUTH_TOKEN_INVALID`, `AUTH_CREDENTIALS_INVALID`, `RBAC_PERMISSION_DENIED`, `RBAC_SUPER_ADMIN_REQUIRED`.
- POS: `POS_TABLE_NOT_AVAILABLE`, `POS_TABLE_NOT_OCCUPIED`, `POS_ORDER_NOT_ACTIVE`, `POS_NO_NEW_ITEMS_TO_SPLIT`, `POS_TAKEAWAY_CANNOT_MERGE`, `POS_CONCURRENT_MODIFICATION`.
- Cashflow & Inventory & HR: `CASHFLOW_ALREADY_SETTLED`, `CASHFLOW_BUDGET_NOT_SET`, `CASHFLOW_DISCREPANCY_NOTE_REQUIRED`, `INVENTORY_ALREADY_DELETED`, `INVENTORY_PAST_SHIFT_FORBIDDEN`, `HR_CITIZEN_ID_DUPLICATE`, `HR_USERNAME_TAKEN`, `HR_EMPLOYEE_DELETED`, `VALIDATION_FAILED`.

---

## 4. TIÊU CHÍ NGHIỆM THU (ACCEPTANCE CRITERIA)

- [x] **AC-01.1 (Monorepo Structure):** Chạy `pnpm install`, `pnpm -r build`, `pnpm -r typecheck` tại thư mục gốc thành công với 0 lỗi.
- [x] **AC-01.2 (Leaf Package Purity):** `packages/shared/package.json` hoàn toàn không chứa dependency nào trỏ ngược về `apps/*` hoặc các thư viện tầng ứng dụng (`@prisma/client`, `react`, `@nestjs/common`).
- [x] **AC-01.3 (No TS Enum Keyword):** Quét toàn bộ `packages/shared/src/` không có bất kỳ từ khoá `enum ` nào của TypeScript; 100% dùng `as const` + `z.enum()`.
- [x] **AC-01.4 (RBAC Schema Synchronization):** `UserPermissionsSchema` khớp 100% với ma trận phân quyền tại `docs/bmad/02-RBAC-And-MDM-Matrix.md` (§3) và `.agents/rules/03-rbac-security-and-hr-schedule.md` (§2).
- [x] **AC-01.5 (Unit Tests cho Shared Contracts):** Bộ unit test trong `packages/shared/src/__tests__/schemas.spec.ts` kiểm tra đầy đủ các ca hợp lệ và không hợp lệ (422) của từng schema, đạt 100% pass khi chạy `pnpm -r test`.
