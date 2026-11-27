---
trigger: model_decision
description: Monorepo architecture details, module boundaries, dependency graph, and import conventions for fnb-spicy-noodle-system.
---

# 00 — Kiến trúc & Monorepo

> **Phạm vi:** Cấu trúc thư mục, phân tách module, dependency graph, quy ước import (đồng bộ codebase thực tế Stories 01–21).
> **Áp dụng cho:** Mọi Agent thao tác trên monorepo `fnb-spicy-noodle-system/`.

---

## 1. Monorepo Structure

### 1.1. Tooling

- **MUST** dùng Turborepo + pnpm. **FORBIDDEN** Nx, Lerna, Rush, npm, yarn.
- **MUST** có `pnpm-workspace.yaml` tại root: entries `apps/*`, `packages/*`.
- **MUST** có `turbo.json` với tasks: `build`, `typecheck`, `lint`, `test`, `test:coverage` — đúng `dependsOn` + `outputs`.

### 1.2. Workspace Packages

| Package | Path | Purpose |
|---------|------|---------|
| `@fnb/api-server` | `apps/api-server/` | NestJS 11 + Prisma 6 + Socket.io 4 (Modular Monolith) |
| `@fnb/web-app` | `apps/web-app/` | React + Vite + TanStack + Tailwind + Shadcn (Desktop & Touch POS) |
| `@fnb/shared` | `packages/shared/` | Zod 4 schemas, Enums, DTOs, Constants, Utils |

- **MUST** duy trì đúng 3 packages. **FORBIDDEN** thêm package mới không có approval.
- `packages/shared/` `name` = `@fnb/shared`.
- Cả `api-server` và `web-app` **MUST** declare `"@fnb/shared": "workspace:*"` trong `dependencies`.

### 1.3. Root Directory Layout

```
fnb-spicy-noodle-system/
├── AGENTS.md
├── .agents/rules/                     # 8 rules chi tiết (00..07)
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
├── docker-compose.yml                 # postgres + api-server + caddy
├── Dockerfile.caddy                   # Build web-app static + Caddy reverse proxy
├── Caddyfile
├── .env.example                       # NEVER commit .env
├── docs/
│   ├── HUONG_DAN_SU_DUNG_VA_GIAI_PHAP.md
│   ├── bmad/                          # PRD, RBAC/MDM Matrix, Edge Cases
│   ├── architecture/                  # Verified ERD (20 bảng), State Machines, Sequences, Audit Report
│   ├── stories/                       # story-01 .. story-21
│   └── qa/                            # E2E & Realtime QA reports
├── apps/
│   ├── api-server/
│   └── web-app/
└── packages/
    └── shared/
```

- **MUST** có `tsconfig.base.json` tại root. Cả 2 app tsconfig **MUST** `extends: "../../tsconfig.base.json"`.
- **NEVER** commit `.env`. **MUST** có `.env.example`.

---

## 2. Frontend Architecture (`apps/web-app`)

### 2.1. Directory Structure

> Pattern: `alan2207/bulletproof-react` — Feature-based.

```
apps/web-app/src/
├── main.tsx
├── App.tsx
├── router.tsx                         # React Router, lazy routes (Desktop & /pos/touch/*)
├── providers/                         # app-provider, query-provider, socket-provider, store-settings-provider, theme-provider
├── config/                            # env & static config
├── lib/                               # api-client, socket-client, route-prefetch, web-push-client, qr-voice-announcer, pos-device-mode, excel-export
├── stores/                            # auth.store.ts, ui-preferences.store.ts (Zustand)
├── components/
│   ├── ui/                            # Shadcn/UI
│   ├── base-table/                    # TanStack Table v8 wrapper
│   ├── print-slips/                   # Thermal 80mm templates + ESC/POS / RawBT / LAN drivers
│   ├── audit-history-drawer/          # Shared AuditLog Drawer cho 13 phân hệ
│   ├── touch-shell/                   # TouchShellLayout & bottom nav cho /pos/touch/*
│   └── layout/                        # AppShell, Sidebar, TopNavbar, PageHeader, RbacRouteGuard
├── hooks/                             # Shared hooks (use-store-settings, use-screen-wake-lock, use-qr-voice-toggle...)
├── utils/                             # currency, search, store-theme, qr-export, permission-catalog...
└── features/                          # 16 feature modules (§2.3)
```

### 2.2. Feature Module Structure

Mỗi `src/features/<feature>/` **MUST** có:

```
├── api/                   # TanStack Query hooks & API calls
├── components/            # Scoped UI
├── hooks/                 # (optional)
├── touch/                 # (chỉ có trong pos-counter/ cho /pos/touch)
├── utils/                 # (optional)
└── index.ts               # Barrel — sole public API
```

- `index.ts` là **sole public API**. Import từ bên ngoài **MUST** qua barrel `@/features/<feature>`.
- **FORBIDDEN** import trực tiếp giữa feature folders. Shared logic → `src/components/`, `src/hooks/`, `src/lib/`, `src/utils/`, hoặc `@fnb/shared`.
- Shadcn/UI components **MUST** ở `src/components/ui/`. **NEVER** trong feature folder.
- **MUST** dùng path alias `@/` → `src/`.

### 2.3. 16 Feature Modules Thực tế

| # | Folder | Routes | Chức năng chính |
|:-:|:---|:---|:---|
| 1 | `dashboard/` | `/dashboard`, `/pos/touch/dashboard` | Bảng điều khiển tổng quan KPI, biểu đồ, cảnh báo quá hạn, lọc phạm vi theo RBAC |
| 2 | `pos-counter/` | `/pos`, `/pos/touch`, `/pos/touch/hub`, `/pos/touch/stock-status`, `/pos/touch/printer` | POS Desktop Split-View & POS Cảm ứng toàn màn hình (4 tab, thanh đáy 4 nút, Hub, báo hết món 1 chạm, máy in/két tiền) |
| 3 | `qr-order/` | `/q/:token`, `/qr/:token` | Giao diện khách quét QR tại bàn & QR Mang về (realtime Socket.io + bảo mật Wi-Fi/GPS) |
| 4 | `menu/` | `/menu`, `/pos/touch/menu` | Thực đơn 3 tầng động, 4 nhóm tuỳ chọn thông minh, Size M/L, nhập/xuất Excel, trạm bếp & danh mục con |
| 5 | `discounts/` | `/discounts`, `/pos/touch/discounts` | Quản lý mã giảm giá (`PERCENT`/`FIXED`, `ORDER`/`CATEGORY`/`PRODUCT`, khung giờ, lượt dùng) |
| 6 | `invoices/` | `/invoices`, `/pos/touch/invoices` | BaseTable hoá đơn, bộ lọc kép, in lại, quy trình sửa & duyệt PTTT 2 bước, huỷ hoá đơn (`VOID`), xuất Excel |
| 7 | `inventory/` | `/inventory`, `/pos/touch/inventory` | Lịch sử nhập kho + Drawer đa dòng (Combobox MDM Nguyên liệu & Nhà cung cấp), xuất Excel |
| 8 | `cashflow/` | `/cashflow`, `/pos/touch/cashflow` | Ngân sách đầu ca, lưới đếm tiền 9 mệnh giá (Blind Mode), chốt ca, bù chênh lệch, xuất Excel |
| 9 | `payment-qr/` | `/payment-qr`, `/pos/touch/payment-qr` | Quản lý nhiều mã QR thanh toán, thứ tự ưu tiên xoay vòng, hạn mức Ngày/Tháng/Năm |
| 10 | `employees/` | `/employees` | Hồ sơ nhân sự, tự sinh `short_name` chống trùng, liên kết tài khoản 1-1, tạm ngưng/khôi phục, xuất Excel |
| 11 | `schedules/` | `/schedules` | Ma trận bảng công tuần dạng Excel (`FULL_SHIFT` / `CUSTOM_HOURS`), sao chép tuần trước, Unsaved Guard, xuất Excel |
| 12 | `payroll/` | `/payroll` | Bảng tính lương tự động từ bảng công (`FULL_TIME` / `PART_TIME`), cấu hình định mức, ghi đè & thưởng/phạt, xuất Excel |
| 13 | `master-data/` | `/master-data` | Quản trị 7 danh mục chuẩn hoá (`POSITION`, `SPECIALTY`, `INGREDIENT`, `UNIT`, `SUPPLIER`, `MENU_CATEGORY`, `KITCHEN_STATION`) |
| 14 | `rbac/` | `/rbac` | Quản trị tài khoản (tách Drawer Thông tin tài khoản & Drawer Phân quyền 14 phân hệ), lịch sử phiên/IP, thu hồi phiên |
| 15 | `store-settings/` | `/settings`, `/pos/touch/settings` | Cài đặt cửa hàng động: thương hiệu, logo/favicon, màu sắc, 5 mẫu phiếu in 80mm, message catalog, thẻ QR, `displayScale`, phần cứng in & QR Security |
| 16 | `profile/` | `/login`, `/profile`, `/pos/touch/profile` | Đăng nhập (Single-Session conflict), hồ sơ cá nhân JOIN 1-1, đổi mật khẩu, avatar, reset cài đặt cá nhân |

### 2.4. State Management & Routing

- **MUST** TanStack Query v5 cho ALL server state (với `networkMode: 'always'` để không kẹt offline). **FORBIDDEN** server data trong Zustand/React state.
- Zustand **ONLY** cho client/UI state: `auth.store.ts` và `ui-preferences.store.ts` (persist via `localStorage`, đồng bộ DB qua `PATCH /api/v1/profile/ui-prefs`).
- React Router v6+ với `React.lazy()` trong `src/router.tsx` + `src/lib/route-prefetch.ts` và `RbacRouteGuard` trong `src/components/layout/`.

---

## 3. Backend Architecture (`apps/api-server`)

### 3.1. Directory Structure

> Pattern: NestJS Modular Monolith.

```
apps/api-server/
├── prisma/
│   ├── schema.prisma                  # Single schema file (18 models)
│   ├── seed.ts & seed-data.ts & seed-discounts.ts
│   └── migrations/                    # 16+ SQL migrations
└── src/
    ├── main.ts                        # Bootstrap + Socket.io adapter + GlobalExceptionFilter
    ├── app.module.ts                  # Root — imports 15 modules + RateLimitGuard
    ├── config/env.config.ts           # Zod env validation (FNB_* fallback standard)
    ├── common/
    │   ├── audit/                     # AuditLogModule (13 modules)
    │   ├── context/                   # AsyncLocalStorage request-context
    │   ├── decorators/                # current-user.decorator, permissions.decorator
    │   ├── filters/                   # global-exception.filter
    │   ├── guards/                    # jwt-auth.guard, rbac.guard
    │   ├── interceptors/              # logging.interceptor
    │   ├── middleware/                # request-id.middleware
    │   ├── pipes/                     # zod-validation.pipe
    │   ├── prisma/                    # PrismaModule & PrismaService
    │   ├── security/                  # rate-limit.guard, qr-security.service, security-headers, session-validation, takeaway-qr, cors-origin
    │   └── utils/                     # normalized-string, search-normalize, short-name, display-order, image-binary, qr-token
    ├── gateways/                      # RealtimeModule & pos-socket.gateway.ts (namespace /pos)
    ├── health/                        # HealthModule (GET /api/v1/health)
    └── modules/                       # 11 domain modules (§3.2)
```

### 3.2. NestJS Modules (15 Modules trong `app.module.ts`)

- **4 Infrastructure Modules:** `PrismaModule`, `AuditLogModule`, `RealtimeModule`, `HealthModule`.
- **11 Domain Modules (`src/modules/*`):**
  `iam`, `mdm`, `menu`, `payment-qr`, `discounts`, `pos` (gồm POS orders, Invoices, KitchenSplit, TableTransfer, QrAutoCancel, ThermalLanPrint, WebPush), `inventory`, `cashflow`, `hr-schedule` (gồm Employees, Schedules, Payroll), `store-settings`, `dashboard`.
- **FORBIDDEN** đăng ký controller/service nghiệp vụ trực tiếp ở `AppModule`.
- Cross-module dependency chỉ đi qua `imports: [OtherModule]` rõ ràng, Prisma `$transaction` hoặc `PosSocketGateway`.

### 3.3. Common Utilities

- `jwt-auth.guard.ts` → xác thực JWT + `activeSessionId` → trả `401`. **NEVER** `403`.
- `rbac.guard.ts` → đọc `@RequirePermission` / `@RequireAnyPermission` / `@SuperAdminOnly` → trả `403`. **NEVER** `401`.
- `zod-validation.pipe.ts` → import schemas từ `@fnb/shared`, dùng `safeParse()`. **FORBIDDEN** `class-validator`.
- `normalized-string.util.ts` → `normalizeVietnameseString()` và `toTitleCase()` cho MDM (Invariant 7).
- `search-normalize.util.ts` → kết hợp hàm DB `f_search_norm()` (`unaccent`, gộp `y -> i`) cho tìm kiếm mờ tiếng Việt.

### 3.4. Socket.io Gateway (Dual-Mode Authentication & 15 Events)

- Đúng 1 gateway: `src/gateways/pos-socket.gateway.ts`, namespace `/pos`.
- **15 Events chuẩn (`packages/shared/src/constants/socket-events.ts`):**
  `order:qr_new`, `order:qr_addon`, `order:qr_auto_cancelled`, `order:session_redirected`, `order:status_updated`, `qr:order_notice`, `table:qr_rotated`, `table:grid_sync`, `menu:updated`, `schedule:updated`, `payroll:updated`, `store-settings:updated`, `session:revoked`, `account:permissions_updated`, `account:preferences_updated`.
- **Dual-Mode Auth + Origin Check trong `afterInit` / `handleConnection`:**
  1. **Staff (`auth.token`):** Xác thực JWT `tokenType === 'access'`, `user.isActive`, và khớp `activeSessionId` (Single-Session) → join `pos_cashier_room`, `user_account_{userId}`, `user_session_{sessionId}`.
  2. **QR Guest (`auth.qrToken` + optional `auth.orderId` / `auth.guestSessionToken`):** Xác thực `qrToken` của bàn vật lý hoặc QR Mang về → chỉ join `table_session_{tableId}`, `order_session_{orderId}` (hoặc `public_menu_room`), **FORBIDDEN** join `pos_cashier_room`.
  3. Không hợp lệ hoặc Origin bị cấm → ngắt kết nối ngay lập tức.

### 3.5. Prisma & Seed Data

- Single `prisma/schema.prisma` (18 models). **FORBIDDEN** multi-file schema.
- `PrismaService extends PrismaClient implements OnModuleInit` — injectable. **FORBIDDEN** import `PrismaClient` trực tiếp trong service nghiệp vụ.
- `seed.ts` / `seed-data.ts` seed: 4 tài khoản (`superadmin`, `admin`, `adminview`, `thungan` — mật khẩu mặc định `Password@123`) + 8 nhân viên vận hành, **7 nhóm `master_data`** (`POSITION`, `SPECIALTY`, `INGREDIENT`, `UNIT`, `SUPPLIER`, `MENU_CATEGORY`, `KITCHEN_STATION`) + `SYSTEM_CONFIG` (Store Settings, QR Security, Opening Budget), `dining_tables`, `products`/`combo_items`/`modifier_groups`/`modifiers`, `payment_accounts`, và `discounts` mẫu.

---

## 4. Shared Package (`packages/shared`)

### 4.1. Structure

```
packages/shared/src/
├── index.ts                           # Barrel re-export
├── enums/                             # as const + Zod schemas (order, station, mdm-cashflow, discount)
├── schemas/                           # Zod 4 schemas (api-error, audit-log, cashflow, common, dashboard, discount, hr-schedule, inventory, mdm, menu, order, payment-qr, profile, rbac, store-settings, web-push)
├── constants/                         # error-codes, http-error-catalog, message-catalog, qr-voice-config, socket-events, system-metadata, vietqr-banks
└── utils/                             # discount-calculator
```

### 4.2. Enum & Station Pattern

- **MUST** dùng `as const` object + Zod schema. **FORBIDDEN** TypeScript `enum` keyword.
- `KitchenStation` hỗ trợ 3 trạm cốt lõi (`BEP_NAU`, `BEP_CHIEN`, `PHA_CHE`) và trạm vật lý mở rộng theo mẫu `/^BEP_[A-Z0-9_]{1,12}$/` (cấm `'COMBO'`). `ProductStation` bổ sung thêm `'COMBO'`.

### 4.3. Zod Schema & Dependency Rules

- ALL DTOs **MUST** là Zod schemas trong `packages/shared/src/schemas/` dùng chung giữa FE ↔ BE; types suy diễn bằng `z.infer`.
- `packages/shared` là leaf package (**ZERO deps on `apps/*`**, chỉ phụ thuộc `zod` và devDeps TypeScript/Vitest).

---

## 5. API URL, Environment & File Naming Conventions

- **API URL:** Prefix `/api/v1/`, kebab-case, plural nouns.
- **Environment:** Backend ưu tiên `FNB_*` kèm fallback chuẩn (`FNB_DATABASE_URL ?? DATABASE_URL`, `FNB_JWT_SECRET ?? JWT_SECRET`, `FNB_PORT ?? PORT`, `FNB_CORS_ORIGIN ?? CORS_ORIGIN`); Frontend dùng `import.meta.env.VITE_*`.
- **File Naming:** kebab-case file names (`order-card.tsx`, `*.controller.ts`, `*.service.ts`, `*.schema.ts`, `use-*.ts`); PascalCase cho React component exports.

---

## 6. Violation Checklist

- [ ] Không import trực tiếp giữa 16 thư mục `features/*`?
- [ ] Types/enums/schemas đều ở `@fnb/shared`, không duplicate?
- [ ] `as const` + Zod schema, không dùng TypeScript `enum`?
- [ ] `packages/shared` không depend on `apps/*`?
- [ ] API URL `/api/v1/` + kebab-case?
- [ ] `PrismaService` injectable, không tạo `new PrismaClient()` trong service?
- [ ] Các module đăng ký trong `app.module.ts`, không register controller nghiệp vụ trực tiếp ở root?
