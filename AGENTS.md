# HIẾN PHÁP KỸ THUẬT & NGHIỆP VỤ — HỆ THỐNG POS MÌ CAY (MANDATORY AGENT RULES)

> **Mọi AI Agent (Google Antigravity, Codex, hoặc bất kỳ Agent nào) làm việc trên dự án này PHẢI đọc file này và toàn bộ `.agents/rules/*.md` TRƯỚC KHI thực hiện bất kỳ thay đổi nào.**

---

## 1. TỔNG QUAN DỰ ÁN

- **Tên:** Hệ thống POS & Quản trị Vận hành cho Quán Mì Cay
- **Quy mô:** 20–30 bàn, 3 khu vực bếp, 200–600 đơn/ngày, 1–2 developer
- **Kiến trúc:** Modular Monolith trong Turborepo Monorepo
- **Ngôn ngữ:** 100% TypeScript end-to-end (Frontend + Backend + Shared)

## 2. CẤU TRÚC MONOREPO

```
fnb-spicy-noodle-system/
├── AGENTS.md                          # File này — luật gốc
├── .agents/rules/                     # Rules chi tiết (auto-loaded)
├── docs/
│   ├── bmad/                          # PRD, RBAC Matrix, Edge Cases (Phase 1)
│   ├── architecture/                  # ERD, State Machine, Sequences, Audit Report (Phase 2)
│   └── stories/                       # 12 Story files (Phase 4A)
├── apps/
│   ├── api-server/                    # NestJS + Prisma + Socket.io (Modular Monolith)
│   └── web-app/                       # React + Vite + TanStack + Tailwind + Shadcn
└── packages/
    └── shared/                        # Zod Schemas, Enums, DTOs, TypeScript Interfaces
```

## 3. TECH STACK (KHÔNG ĐƯỢC THAY ĐỔI)

| Tầng | Công nghệ | Phiên bản tối thiểu |
|------|-----------|---------------------|
| Monorepo | Turborepo + pnpm | Latest |
| Frontend | React + Vite + TypeScript | React 18+, Vite 5+ |
| UI Components | TailwindCSS + Shadcn/UI | Tailwind 3+ |
| Tables | TanStack Table v8 | v8+ |
| State & Cache | TanStack Query v5 + Zustand | v5+ |
| Backend | NestJS | v10+ |
| ORM | Prisma | v5+ |
| Realtime | Socket.io | v4+ |
| Database | PostgreSQL | 16+ |
| Validation | Zod | v3+ |

## 4. CÁC LỆNH CLI CHUẨN

```bash
# Build toàn bộ
pnpm -r build

# Kiểm tra kiểu dữ liệu (PHẢI chạy trước khi báo cáo hoàn thành)
pnpm -r typecheck

# Chạy test
pnpm -r test

# Chạy test với coverage
pnpm -r test:coverage

# Prisma migration
cd apps/api-server && npx prisma migrate dev --name <migration_name>

# Prisma seed
cd apps/api-server && npx prisma db seed

# Lint
pnpm -r lint
```

## 5. 10 QUY TẮC BẤT BIẾN (HARD INVARIANTS)

> **Violation = Reject. Không có ngoại lệ.**

### Invariant 1: Cô lập Module
Mỗi feature trong `apps/web-app/src/features/*` là một module độc lập. **FORBIDDEN** import trực tiếp giữa các feature folders. Mọi shared logic PHẢI đặt trong `packages/shared/` hoặc `apps/web-app/src/components/`.

### Invariant 2: Đơn Mang về (TAKEAWAY)
Khi `order_type = 'TAKEAWAY'`: `table_id` **MUST** là `NULL` và `takeaway_number` **MUST NOT** là `NULL` (tự tăng từ 1 và reset hàng ngày). Ngược lại khi `order_type = 'DINE_IN'`: `table_id` **MUST NOT** là `NULL` và `takeaway_number` **MUST** là `NULL`. Được enforce bởi CHECK constraint `chk_order_type_target` ở tầng Database. Bảng `dining_tables` **CHỈ** lưu bàn vật lý (`Bàn 01`..`Bàn 30`), **FORBIDDEN** tạo bản ghi bàn `"Mang về"` trong `dining_tables`.

### Invariant 3: Delta Split 3 Bếp
API `POST /api/v1/pos/orders/:id/split-kitchen` **CHỈ** lọc các `order_items` có `kitchen_status = 'NEW'`, phân rã các món `station = 'COMBO'` qua bảng `combo_items` về đúng trạm thực (`BEP_NAU`, `BEP_CHIEN`, `PHA_CHE` — **NEVER** gửi chữ `COMBO` xuống bếp), chuyển sang `'PRINTED'` (kèm nâng `order.status` từ `'PENDING'` lên `'SERVING'` nếu là đơn QR mới), rồi trả về các phiếu in nhiệt 80mm. Nếu không có món `'NEW'`, trả về HTTP 200 idempotent (`tickets: []`). **NEVER** in lại các món đã `PRINTED`.

### Invariant 4: Tách bạch Tạm tính vs Thanh toán
- Nút "In tạm tính (Kèm VietQR động)": **MUST** giữ nguyên `status = 'SERVING'` và bàn `'OCCUPIED'`.
- Nút "Thanh toán → Xác nhận (2 bước)": **MUST** chuyển sang `status = 'PAID'`, kiểm tra ràng buộc `chk_order_payment_amounts` (`CASH` / `TRANSFER` / `SPLIT`), và giải phóng bàn về `'AVAILABLE'`.

### Invariant 5: Khoá dòng cho Table Actions & Order Mutations
Mọi thao tác MOVE/MERGE/SWAP bàn, `split-kitchen`, và `checkout` **MUST** bọc trong `prisma.$transaction()` sử dụng `SELECT ... FOR UPDATE`. Để chống AB-BA Deadlock khi khoá nhiều bản ghi, **ALWAYS** khoá bảng `orders` trước (`ORDER BY id ASC FOR UPDATE`), sau đó mới khoá bảng `dining_tables` (`ORDER BY id ASC FOR UPDATE`). **NEVER** thực hiện ngoài transaction hoặc gọi API bên ngoài trong khi giữ khoá.

### Invariant 6: Công thức Kết ca (Cashflow Settlement)
```
expected_cash = opening_budget
             + SUM(CASE WHEN payment_method='CASH' THEN total_amount
                        WHEN payment_method='SPLIT' THEN cash_amount
                        ELSE 0 END
                   WHERE status='PAID' AND payment_method IN ('CASH', 'SPLIT'))
             - SUM(total_cost WHERE payment_source='CASH_DRAWER' AND is_deleted=FALSE)

discrepancy = actual_counted_cash - expected_cash
```
**FORBIDDEN** cộng doanh thu chuyển khoản QR (`TRANSFER` hoặc phần `transfer_amount` của đơn `SPLIT`) vào `expected_cash`. **FORBIDDEN** cộng hoá đơn đã huỷ (`VOIDED`) hoặc trừ phiếu nhập hàng `EXTERNAL` khỏi tiền két.

### Invariant 7: MDM Chuẩn hoá Chuỗi
Hàm `MdmService.findOrCreate()` **MUST** thực hiện: `trim()` → chuẩn hoá chữ hoa đầu từ → sinh `normalized_name` (bỏ dấu tiếng Việt, lowercase) để so sánh chống trùng lặp trước khi INSERT.

### Invariant 8: RBAC 401 vs 403
- `401 Unauthorized`: Token không hợp lệ hoặc hết hạn. **NEVER** trả 403 cho trường hợp này.
- `403 Forbidden`: Đã đăng nhập nhưng thiếu quyền. **NEVER** trả 401 cho trường hợp này.
- `GET /api/v1/mdm/lookup`: **MUST** mở cho mọi tài khoản `authenticated` (không yêu cầu quyền MDM).

### Invariant 9: Giữ UI Preferences khi Đăng xuất
Khi bấm Đăng xuất: gọi `queryClient.clear()` và xoá Token/Auth State. **FORBIDDEN** xoá `ui_preferences` (theme, column_widths, sidebar_width). Giá trị `ui_preferences` được lưu vào `localStorage` VÀ đồng bộ lên `users.ui_preferences` trên Database.

### Invariant 10: Kiểu Tiền tệ
Mọi cột liên quan đến tiền (price, total_amount, total_cost, opening_budget, v.v.) **MUST** dùng `NUMERIC(12, 2)` trong PostgreSQL và `Decimal` trong Prisma. **FORBIDDEN** dùng `FLOAT`, `DOUBLE`, hoặc `Int` cho tiền tệ.

## 6. PHÂN VAI AGENT

| Agent | Phụ trách chính | Phase |
|-------|----------------|-------|
| **Antigravity** | Orchestrator BMAD, multi-file coordination, Frontend UI, Rules compilation | 1, 3, 4A, 5 |
| **Codex** | Architecture audit, Backend logic, SQL transactions, TDD, Security | 2, 4B |

## 7. SKILLS & REPOS THAM CHIẾU

### Built-in Skills (Antigravity — ưu tiên sử dụng)
- `test-driven-development` — TDD workflow
- `nestjs-best-practices` / `nestjs-expert` — NestJS patterns
- `typescript-advanced-types` — TS generics, utility types
- `zod` — Schema validation
- `react-vite-expert` — React + Vite patterns
- `tailwind-css-patterns` / `tailwindcss-design-system` — Styling
- `git-workflow-pro` — Branch & commit conventions
- `frontend-checklist` — QA checklist (MCP)

### External Repos (Reference — đọc patterns, KHÔNG copy nguyên code)
- `alan2207/bulletproof-react` — Feature-based structure cho `apps/web-app/`
- `shadcn-ui/ui` — Component patterns cho Drawer, Dialog, Command
- `bmadcode/BMAD-METHOD` — BMAD workflow, Story Sharding
- `github/spec-kit` — Specification-driven development
- `obra/superpowers` — Brainstorming, verification, systematic debugging
- `upstash/context7` — MCP Server tài liệu sống (Prisma, TanStack, NestJS, Socket.io)
- `sairyss/domain-driven-hexagon` — Domain Layer patterns cho NestJS
- `mattpocock/skills` — TypeScript & Monorepo patterns
- `nextlevelbuilder/ui-ux-pro-max-skill` — UI/UX POS layout
- `seokju-na/react-thermal-printer` + `Klemen1337/node-thermal-printer` — Thermal print 80mm reference

### MCP Servers (LUÔN kích hoạt)
- `context7` — Tra cứu docs mới nhất trước khi viết code Prisma, TanStack, NestJS, Socket.io

## 8. QUY TẮC CHUNG KHI CODE & THỰC THI (ALWAYS ON)

1. **MUST** chạy `pnpm -r typecheck` trước khi báo cáo hoàn thành bất kỳ story nào.
2. **MUST** chạy `pnpm -r test` và đảm bảo 100% test pass.
3. **NEVER** viết code giả lập `// TODO`, `// placeholder`, hay bỏ trống function body.
4. **MUST** import shared types từ `@fnb/shared` (alias của `packages/shared/`), KHÔNG duplicate type definitions.
5. **MUST** đọc file rules tương ứng trong `.agents/rules/` trước khi code từng module.
6. **ALWAYS-ON SKILLS & REPOS:** Toàn bộ Built-in Skills, External Skills (`bmad-*`, `obra/superpowers`, `mattpocock`, `ui-ux-pro-max`), Reference Repos trong `references/`, và MCP Servers (`context7`, `codegraph`) đều ở trạng thái **BẮT BUỘC TỰ ĐỘNG KÍCH HOẠT (ALWAYS ON)**. Mọi Agent (Antigravity & Codex) khi bắt tay vào từng Phase/Story PHẢI tự động nạp ngữ cảnh từ các skill/repo tương ứng mà không cần người dùng nhắc lại.

## 9. CÁC FILE RULES CHI TIẾT

Đọc thêm các file rules chi tiết tại:
- `.agents/rules/00-architecture-and-monorepo.md`
- `.agents/rules/01-database-and-concurrency.md`
- `.agents/rules/02-pos-kitchen-and-cashflow-logic.md`
- `.agents/rules/03-rbac-security-and-hr-schedule.md`
- `.agents/rules/04-frontend-ux-table-and-print.md`
- `.agents/rules/05-testing-strategy.md`
- `.agents/rules/06-error-handling-and-logging.md`
- `.agents/rules/07-deployment-and-git.md`
