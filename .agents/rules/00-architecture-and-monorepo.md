# 00 — Kiến trúc & Monorepo

> **Phạm vi:** Cấu trúc thư mục, phân tách module, dependency graph, quy ước import.
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
| `@fnb/api-server` | `apps/api-server/` | NestJS + Prisma + Socket.io (Modular Monolith) |
| `@fnb/web-app` | `apps/web-app/` | React + Vite + TanStack + Tailwind + Shadcn |
| `@fnb/shared` | `packages/shared/` | Zod schemas, Enums, DTOs, TypeScript interfaces |

- **MUST** duy trì đúng 3 packages. **FORBIDDEN** thêm package mới không có approval.
- `packages/shared/` `name` = `@fnb/shared`.
- Cả `api-server` và `web-app` **MUST** declare `"@fnb/shared": "workspace:*"` trong `dependencies`.

### 1.3. Root Directory Layout

```
fnb-spicy-noodle-system/
├── AGENTS.md
├── .agents/rules/
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
├── .env.example                       # NEVER commit .env
├── docs/
│   ├── bmad/                          # Phase 1
│   ├── architecture/                  # Phase 2
│   └── stories/                       # Phase 4A
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
├── router.tsx                         # React Router, lazy routes
├── providers/                         # app-provider, query-provider, socket-provider
├── config/env.ts
├── lib/                               # api-client.ts, socket-client.ts
├── stores/ui-preferences.store.ts     # Zustand — theme, columns, sidebar
├── components/
│   ├── ui/                            # Shadcn/UI
│   ├── base-table/                    # TanStack Table v8 wrapper
│   ├── print-slips/                   # Thermal 80mm templates
│   └── layout/                        # Shell, Sidebar, Header
├── hooks/
├── utils/
└── features/                          # 9 modules (§2.3)
```

### 2.2. Feature Module Structure

Mỗi `src/features/<feature>/` **MUST** có:

```
├── api/                   # TanStack Query hooks
├── components/            # Scoped UI
├── hooks/                 # (optional)
├── types/                 # (optional, chỉ nếu không ở @fnb/shared)
├── utils/                 # (optional)
└── index.ts               # Barrel — sole public API
```

- `index.ts` là **sole public API**. Import từ bên ngoài **MUST** qua barrel `@/features/<feature>`.
- **FORBIDDEN** import trực tiếp giữa feature folders. Shared logic → `src/components/`, `src/hooks/`, `src/utils/`, hoặc `@fnb/shared`.
- Shadcn/UI components **MUST** ở `src/components/ui/`. **NEVER** trong feature folder.
- **MUST** dùng path alias `@/` → `src/`.

### 2.3. Feature Modules & Mapping 10 PRD Modules

| # | Folder / Component | Mô tả (Đồng bộ PRD Modules 0–9) |
|---|--------------------|---------------------------------|
| 0 | `qr-order/` + `master-data/` | Scan QR (`/qr/:token`) → xem menu → đặt món (WebSocket) & Cấu hình Menu/Topping/Combo/Bàn |
| 1 | `pos-counter/` | Sơ đồ bàn, đơn Mang về (`MV-#`), giỏ hàng theo lượt, tách 3 bếp, tạm tính VietQR, thanh toán, MOVE/MERGE/SWAP |
| 2 | `invoices/` | BaseTable 7 cột hoá đơn, bộ lọc kép (DateRange + Keyword), xem chi tiết, huỷ đơn (`void`) |
| 3 | `inventory/` | BaseTable 8+1 cột lịch sử nhập hàng + Drawer thêm mới nguyên vật liệu (Combobox MDM autocomplete) |
| 4 | `cashflow/` | Cấu hình ngân sách đầu ngày, lưới đếm tiền theo mệnh giá, kết ca đối soát dòng tiền, lịch sử kết ca |
| 5 | `employees/` | BaseTable 7 cột hồ sơ nhân sự, tự sinh `short_name` chống trùng, liên kết 1-1 với tài khoản |
| 6 | `schedules/` | Lịch làm việc ma trận dạng Excel (7 ngày × N ca), Multi-select tags theo chuyên môn, Unsaved Changes Guard |
| 7 | `master-data/` | Quản trị 5 danh mục gốc (`POSITION`, `SPECIALTY`, `INGREDIENT`, `UNIT`, `SUPPLIER`) & Menu/Bàn |
| 8 | `rbac/` | Quản lý tài khoản & Drawer phân quyền đa cấp (Checkbox View + Dropdown CRUD + Sub-permissions) |
| 9 | `profile/` (hoặc `components/layout/`) | Thanh Navbar (`Ctrl+K` lọc theo RBAC, Theme toggle, Avatar dropdown), Trang Hồ sơ cá nhân (JOIN `employees` + `users`), lưu `ui_preferences` |

### 2.4. State Management

- **MUST** TanStack Query v5 cho ALL server state. **FORBIDDEN** server data trong Zustand/React state.
- Zustand **ONLY** cho UI state: `ui_preferences`. Persist via `localStorage` key `'fnb-ui-preferences'`.
- **NEVER** React Context cho data — chỉ cho DI (providers).

### 2.5. Routing

- React Router v6+ với lazy routes. Route config trong `src/router.tsx`.
- Feature pages export từ `index.ts`, router dùng `React.lazy()` cho code splitting.
- RBAC route guards → wrapper components trong `src/components/layout/`.

---

## 3. Backend Architecture (`apps/api-server`)

### 3.1. Directory Structure

> Pattern: `sairyss/domain-driven-hexagon` — NestJS Modular Monolith.

```
apps/api-server/
├── prisma/
│   ├── schema.prisma                  # Single schema file
│   ├── seed.ts
│   └── migrations/
└── src/
    ├── main.ts                        # Bootstrap + Socket.io adapter
    ├── app.module.ts                  # Root — imports 7 feature modules
    ├── common/
    │   ├── guards/                    # jwt-auth.guard, rbac.guard
    │   ├── decorators/               # current-user, permissions
    │   ├── interceptors/             # logging
    │   ├── filters/                  # all-exceptions
    │   ├── pipes/                    # zod-validation (import from @fnb/shared)
    │   └── utils/                    # normalized-string.util
    ├── gateways/pos-socket.gateway.ts
    └── modules/                       # 7 modules: pos, menu, inventory,
                                       # cashflow, hr-schedule, mdm, iam
```

### 3.2. Module Rules

- Đúng 7 NestJS modules: `pos`, `menu`, `inventory`, `cashflow`, `hr-schedule`, `mdm`, `iam`.
- Mỗi module **MUST** có: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`.
- `app.module.ts` imports tất cả 7 modules. **FORBIDDEN** đăng ký controller/service trực tiếp ở AppModule.
- **FORBIDDEN** cross-module service injection trực tiếp. Options: (a) shared Prisma `$transaction`, (b) `EventEmitter2`, (c) explicit `imports: [ModuleA]` với comment `// Cross-module: ModuleA needed for <reason>`.

### 3.3. Common Utilities

- `jwt-auth.guard.ts` → trả `401`. **NEVER** 403 cho invalid token.
- `rbac.guard.ts` → trả `403`. **NEVER** 401 cho thiếu quyền.
- `zod-validation.pipe.ts` → import schemas từ `@fnb/shared`, dùng `safeParse()`. **FORBIDDEN** class-validator hoặc inline schemas.
- `normalized-string.util.ts` → export `normalizeVietnameseString(raw: string)` (`trim()` → NFD strip diacritics + `đ/Đ → d` → lowercase → collapse spaces) và `toTitleCase(raw: string)` (chuẩn hoá chữ hoa đầu từ). Single canonical impl — **NEVER** duplicate.

### 3.4. Socket.io Gateway (Dual-Mode Authentication)

- Đúng 1 gateway: `src/gateways/pos-socket.gateway.ts`. **FORBIDDEN** multiple gateways.
- Namespace `/pos`. Events chuẩn: `order:qr_new`, `order:qr_addon`, `order:session_redirected`, `order:status_updated`, `table:grid_sync`.
- Gateway **MUST** thực thi **Xác thực Hai Chế độ (Dual-Mode Socket Authentication)** trong `handleConnection()`:
  1. **Chế độ Staff/Cashier (Có `auth.token` là JWT):** Xác thực chữ ký và hạn dùng JWT. Nếu hợp lệ → cho phép join vào `pos_cashier_room`. Nếu JWT không hợp lệ hoặc hết hạn → ngắt kết nối ngay lập tức.
  2. **Chế độ QR Guest (Có `auth.qrToken` của bàn + `auth.orderId`):** Kiểm tra `qrToken` tồn tại trong `dining_tables`. Nếu hợp lệ → **CHỈ** cho phép client join vào đúng room `order_session_{orderId}` để nhận `order:session_redirected` và `order:status_updated`, **FORBIDDEN** join vào `pos_cashier_room`.
  3. Nếu không có cả JWT hợp lệ lẫn `qrToken` hợp lệ → reject kết nối ngay trong `handleConnection()`.

### 3.5. Prisma

- Single `prisma/schema.prisma`. **FORBIDDEN** multi-file schema.
- `PrismaService extends PrismaClient implements OnModuleInit` — injectable. **FORBIDDEN** import `PrismaClient` trực tiếp.
- `seed.ts` **MUST** seed: `superadmin` & `cashier01` users kèm `employees` liên kết 1-1, 5 nhóm `master_data` (`POSITION`, `SPECIALTY`, `INGREDIENT`, `UNIT`, `SUPPLIER`), `dining_tables` (`Bàn 01`..`Bàn 30` — không có bàn Mang về), `products` (`BEP_NAU`, `BEP_CHIEN`, `PHA_CHE`, `COMBO`), `combo_items`, `modifier_groups` (Cấp độ cay 0–7, Thêm Topping) và `modifiers`.

---

## 4. Shared Package (`packages/shared`)

### 4.1. Structure

```
packages/shared/src/
├── index.ts                           # Barrel re-export
├── enums/                             # as const + z.enum() (station, order-status, etc.)
├── schemas/                           # Zod schemas (order, menu-item, cashflow, etc.)
├── types/                             # z.infer re-exports
└── constants/
```

### 4.2. Enum Pattern

- **MUST** dùng `as const` object + `z.enum()`. **FORBIDDEN** TypeScript `enum` keyword.
- Giá trị chuỗi **MUST** match giữa TS, Prisma `@map`/`enum`, và PostgreSQL.
- Phân biệt rõ `ProductStation` (cho bảng `products`, có `'COMBO'`) và `KitchenStation` (cho phiếu in tách bếp, chỉ gồm 3 trạm vật lý):

```typescript
export const KitchenStation = { BEP_NAU: 'BEP_NAU', BEP_CHIEN: 'BEP_CHIEN', PHA_CHE: 'PHA_CHE' } as const;
export type KitchenStation = (typeof KitchenStation)[keyof typeof KitchenStation];
export const KitchenStationSchema = z.enum(['BEP_NAU', 'BEP_CHIEN', 'PHA_CHE']);

export const ProductStation = { ...KitchenStation, COMBO: 'COMBO' } as const;
export type ProductStation = (typeof ProductStation)[keyof typeof ProductStation];
export const ProductStationSchema = z.enum(['BEP_NAU', 'BEP_CHIEN', 'PHA_CHE', 'COMBO']);
```

### 4.3. Zod Schema Rules

- ALL DTOs **MUST** là Zod schemas trong `packages/shared/src/schemas/`. **FORBIDDEN** class-validator hoặc plain interfaces ở backend.
- Frontend forms **MUST** import **SAME** Zod schema. **FORBIDDEN** duplicate validation.
- Types **MUST** derived via `z.infer`. **FORBIDDEN** manual interface mirroring Zod.
- Export cả schema + type. Convention: `CreateOrderSchema` → `CreateOrderInput`.

### 4.4. Import Convention

- **MUST** dùng alias `@fnb/shared`. **NEVER** duplicate type/enum/schema đã có.
- `packages/shared/src/index.ts` barrel-export everything.

---

## 5. Dependency Rules

```
  web-app ──┐         ┌── api-server
            └── shared ──┘
```

- `shared` **MUST** có ZERO deps on `apps/*`. Leaf package.
- `shared` chỉ depend: `zod`, `typescript` (dev). **FORBIDDEN** `prisma`, `react`, `nestjs`, `axios`.
- **FORBIDDEN** circular dependencies. Turborepo pipeline **MUST** succeed without cycles.

### MCP `context7` Verification

- Before writing Prisma/TanStack Table v8/TanStack Query v5/NestJS/Socket.io code → **MUST** query `context7` để verify current API.
- **NEVER** rely on pretrained knowledge cho các lib trên.
- **NEVER** dùng deprecated APIs. Nếu `context7` returns deprecation → dùng replacement.

---

## 6. Skills ↔ Repos Mapping

| Concern | Built-in Skill | External Repo | Usage |
|---------|---------------|---------------|-------|
| React architecture | `react-vite-expert` | `alan2207/bulletproof-react` | Feature folder, hooks, providers |
| NestJS | `nestjs-best-practices` + `nestjs-expert` | `sairyss/domain-driven-hexagon` | Module boundaries, DI, services |
| TypeScript | `typescript-advanced-types` | `mattpocock/skills` | Generics, utility types |
| Validation | `zod` | `packages/shared/` (§4) | Schema-first DTOs |
| UI/UX | `tailwind-css-patterns` + `tailwindcss-design-system` | `nextlevelbuilder/ui-ux-pro-max-skill` | POS layout, dark mode |
| UI components | Shadcn/UI | `shadcn-ui/ui` | Dialog, Drawer, Command |
| BMAD | `obra/superpowers` | `bmadcode/BMAD-METHOD` | Story sharding, pipeline |
| API docs | MCP `context7` | N/A | Fresh docs lookup |
| Testing | `test-driven-development` + `vitest` | N/A | TDD, Vitest config |
| Git | `git-workflow-pro` | N/A | Conventional Commits |
| Thermal print | N/A | `seokju-na/react-thermal-printer` | 80mm receipt templates |
| QA | `frontend-checklist` (MCP) | N/A | Pre-launch audit |

- When implementing → **MUST** follow CẢ skill LẪN repo. **FORBIDDEN** chỉ dùng 1 nguồn.
- External repos = **reading patterns only**. **FORBIDDEN** copy verbatim.

---

## 7. API URL Convention

- ALL endpoints **MUST** prefix `/api/v1/`. Ví dụ: `/api/v1/pos/orders`.
- Controller route = module name. Ví dụ: `@Controller('api/v1/pos')`.
- kebab-case URL segments, plural nouns. **FORBIDDEN** camelCase/snake_case.

---

## 8. Environment & Configuration

- Backend: NestJS `ConfigModule` + Zod validation. Hỗ trợ tiền tố `FNB_*` kèm fallback sang biến chuẩn (`process.env.FNB_DATABASE_URL ?? process.env.DATABASE_URL`, tương tự cho `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `PORT`, `CORS_ORIGIN`) để tương thích đồng thời với Prisma CLI và Docker Compose Production.
- Frontend: `import.meta.env.VITE_*`. **FORBIDDEN** `process.env`. Required: `VITE_API_BASE_URL`, `VITE_SOCKET_URL`.

---

## 9. File Naming

- kebab-case file names. **FORBIDDEN** camelCase/PascalCase files.
- PascalCase React component exports. File `order-card.tsx` → export `OrderCard`.
- NestJS: `*.controller.ts`, `*.service.ts`, `*.module.ts`, `*.guard.ts`, `*.pipe.ts`, etc.
- Frontend: `*.store.ts`, `*.schema.ts`, `*.enum.ts`, `use-*.ts`.

---

## 10. Violation Checklist

> Tự kiểm tra TRƯỚC KHI commit:

- [ ] Không import trực tiếp giữa `features/*`?
- [ ] Types/enums/schemas đều ở `@fnb/shared`, không duplicate?
- [ ] `as const` + `z.enum()`, không TypeScript `enum`?
- [ ] Zod schema dùng chung FE ↔ BE?
- [ ] `packages/shared` không depend on `apps/*`?
- [ ] Đã query `context7` trước khi viết Prisma/TanStack/NestJS/Socket.io?
- [ ] API URL: `/api/v1/` + kebab-case + plural?
- [ ] File kebab-case, component PascalCase?
- [ ] `PrismaService` injectable, không import `PrismaClient` trực tiếp?
- [ ] Modules trong `app.module.ts`, không register trực tiếp ở root?
