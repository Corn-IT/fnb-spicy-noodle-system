# HIẾN PHÁP KỸ THUẬT & NGHIỆP VỤ — HỆ THỐNG POS MÌ CAY (MANDATORY AGENT RULES)

> **Mọi AI Agent (Google Antigravity, Codex, hoặc bất kỳ Agent nào) làm việc trên dự án này PHẢI đọc file này và toàn bộ `.agents/rules/*.md` TRƯỚC KHI thực hiện bất kỳ thay đổi nào.**

---

## 1. TỔNG QUAN DỰ ÁN

- **Tên:** Hệ thống POS & Quản trị Vận hành cho Quán Mì Cay
- **Quy mô:** 20–30 bàn, 3+ khu vực bếp (mở rộng động `BEP_*`), 200–600 đơn/ngày, 1–2 developer
- **Kiến trúc:** Modular Monolith trong Turborepo Monorepo (20 bảng Prisma / 15 NestJS modules / 16 Frontend features / 14 nhóm quyền RBAC)
- **Ngôn ngữ:** 100% TypeScript end-to-end (Frontend + Backend + Shared)

## 2. CẤU TRÚC MONOREPO

```
fnb-spicy-noodle-system/
├── AGENTS.md                          # File này — luật gốc
├── .agents/rules/                     # 8 file rules chi tiết (00..07)
├── docs/
│   ├── HUONG_DAN_SU_DUNG_VA_GIAI_PHAP.md
│   ├── bmad/                          # PRD, RBAC & MDM Matrix, Edge Cases
│   ├── architecture/                  # Verified ERD (20 bảng), State Machines, Sequences, Audit Report
│   ├── stories/                       # 21 Story files (story-01 .. story-21)
│   └── qa/                            # E2E & Realtime QA reports/ledgers
├── apps/
│   ├── api-server/                    # NestJS 11 + Prisma 6 + Socket.io 4 (Modular Monolith)
│   └── web-app/                       # React + Vite + TanStack + Tailwind + Shadcn (Desktop & Touch POS)
└── packages/
    └── shared/                        # Zod 4 Schemas, Enums, DTOs, Constants, Utils
```

## 3. TECH STACK (KHÔNG ĐƯỢC THAY ĐỔI)

| Tầng | Công nghệ | Phiên bản thực tế |
|------|-----------|-------------------|
| Monorepo | Turborepo + pnpm | Latest |
| Frontend | React + Vite + TypeScript | React 18+, Vite 5+ |
| UI Components | TailwindCSS + Shadcn/UI | Tailwind 3+ |
| Tables | TanStack Table v8 | v8+ |
| State & Cache | TanStack Query v5 + Zustand | v5+ |
| Backend | NestJS | v11+ |
| ORM | Prisma | v6+ |
| Realtime | Socket.io + Web Push (VAPID) | v4+ |
| Database | PostgreSQL (`unaccent`) | 16+ |
| Validation | Zod | v4+ |
| Testing | Vitest + Playwright | Vitest (toàn monorepo) |

## 4. CÁC LỆNH CLI CHUẨN

```bash
# Build toàn bộ
pnpm -r build

# Kiểm tra kiểu dữ liệu (PHẢI chạy trước khi báo cáo hoàn thành)
pnpm -r typecheck

# Chạy test (Vitest trên @fnb/shared, @fnb/api-server, @fnb/web-app)
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
Mỗi feature trong `apps/web-app/src/features/*` (16 features) là một module độc lập. **FORBIDDEN** import trực tiếp giữa các feature folders (kể cả trong Touch Shell `/pos/touch/*` — chỉ ghép route qua `React.lazy()` ở `router.tsx` / `route-prefetch.ts`). Mọi shared logic PHẢI đặt trong `packages/shared/`, `apps/web-app/src/components/`, `src/hooks/`, `src/lib/` hoặc `src/utils/`.

### Invariant 2: Đơn Mang về (TAKEAWAY)
Khi `order_type = 'TAKEAWAY'`: `table_id` **MUST** là `NULL` và `takeaway_number` **MUST NOT** là `NULL` (tự tăng từ 1 và reset hàng ngày theo giờ Việt Nam `+07:00`). Ngược lại khi `order_type = 'DINE_IN'`: `table_id` **MUST NOT** là `NULL` và `takeaway_number` **MUST** là `NULL`. Được enforce bởi CHECK constraint `chk_order_type_target` ở tầng Database. Bảng `dining_tables` **CHỈ** lưu bàn vật lý (`Bàn 01`..`Bàn N`), **FORBIDDEN** tạo bản ghi bàn `"Mang về"` trong `dining_tables`.

### Invariant 3: Delta Split Đa Trạm Bếp
API `POST /api/v1/pos/orders/:id/split-kitchen` **CHỈ** lọc các `order_items` có `kitchen_status = 'NEW'`, phân rã các món `station = 'COMBO'` qua bảng `combo_items` về đúng trạm vật lý (`BEP_NAU`, `BEP_CHIEN`, `PHA_CHE`, hoặc trạm mở rộng `BEP_*` — **NEVER** gửi chữ `COMBO` xuống bếp), chuyển sang `'PRINTED'` (kèm nâng `order.status` từ `'PENDING'` lên `'SERVING'` nếu là đơn QR mới), rồi trả về các phiếu in nhiệt 80mm. Nếu không có món `'NEW'`, trả về HTTP 200 idempotent (`tickets: []`). **NEVER** in lại các món đã `PRINTED` qua `split-kitchen` (in lại chủ động đi qua `POST /api/v1/pos/orders/:id/reprint-kitchen`).

### Invariant 4: Tách bạch Tạm tính vs Thanh toán
- Nút "In tạm tính (Kèm VietQR động xoay vòng)" (`provisional-bill` / `split-provisional-bill`): **MUST** giữ nguyên `status = 'SERVING'` và bàn `'OCCUPIED'`.
- Nút "Thanh toán → Xác nhận (2 bước)" (`checkout` / `split-checkout`): **MUST** chuyển sang `status = 'PAID'`, kiểm tra ràng buộc `chk_order_payment_amounts` (`CASH` / `TRANSFER` / `SPLIT`), và giải phóng bàn về `'AVAILABLE'` (khi thanh toán trọn đơn).

### Invariant 5: Khoá dòng cho Table Actions & Order Mutations
Mọi thao tác `MOVE`/`MERGE`/`SWAP`/`TO_TAKEAWAY`, `split-kitchen`, `checkout`, `split-checkout`, `applyDiscount`/`void` **MUST** bọc trong `prisma.$transaction()` sử dụng `SELECT ... FOR UPDATE`. Để chống AB-BA Deadlock khi khoá nhiều bản ghi, **ALWAYS** khoá theo thứ tự: `orders` (`ORDER BY id ASC FOR UPDATE`) → `dining_tables` (`ORDER BY id ASC FOR UPDATE`) → `discounts` (`ORDER BY id ASC FOR UPDATE`, nếu có). **NEVER** thực hiện ngoài transaction hoặc gọi API bên ngoài (VietQR, Web Push, LAN TCP) trong khi giữ khoá.

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
Hàm `MdmService.findOrCreate()` **MUST** thực hiện: `trim()` → chuẩn hoá chữ hoa đầu từ → sinh `normalized_name` (bỏ dấu tiếng Việt + `đ/Đ -> d`, lowercase) để so sánh chống trùng lặp qua `UNIQUE(category, normalized_name)` trước khi INSERT. Hàm PostgreSQL `f_search_norm()` (`unaccent`, gộp `y -> i`) chỉ phục vụ tìm kiếm mờ, không thay thế cột `normalized_name`.

### Invariant 8: RBAC 401 vs 403 & Single-Session
- `401 Unauthorized`: Token thiếu, không hợp lệ, hết hạn, hoặc phiên single-session đã bị thu hồi (`AUTH_SESSION_REVOKED`). **NEVER** trả 403 cho trường hợp này.
- `403 Forbidden`: Đã đăng nhập hợp lệ nhưng thiếu quyền hoặc không phải Super Admin. **NEVER** trả 401 cho trường hợp này.
- `GET /api/v1/mdm/lookup`: **MUST** mở cho mọi tài khoản `authenticated` (`JwtAuthGuard`, không yêu cầu quyền MDM).

### Invariant 9: Giữ UI Preferences khi Đăng xuất
Khi bấm Đăng xuất: gọi `queryClient.clear()` và xoá Token/Auth State. **FORBIDDEN** xoá `ui_preferences` (`theme`, `sidebarWidth`, `columnWidths`, `displayScale`, `navOrder`, `navGroupOrder`, `sidebarCollapsed`, `voiceAlertEnabled`). Giá trị `ui_preferences` được lưu vào `localStorage` VÀ đồng bộ lên `users.ui_preferences` trên Database.

### Invariant 10: Kiểu Tiền tệ
Mọi cột liên quan đến tiền (`price`, `subtotal_amount`, `discount_amount`, `total_amount`, `total_cost`, `opening_budget`, `cash_amount`, `transfer_amount`, `daily_limit`/`monthly_limit`/`yearly_limit`, `value`/`max_discount_amount`/`min_order_amount`, v.v.) **MUST** dùng `NUMERIC(12, 2)` trong PostgreSQL và `Decimal` (`@db.Decimal(12, 2)`) trong Prisma. **FORBIDDEN** dùng `FLOAT`, `DOUBLE`, hoặc `Int` cho tiền tệ.

## 6. PHÂN VAI AGENT

| Agent | Phụ trách chính | Phase |
|-------|----------------|-------|
| **Antigravity** | Orchestrator BMAD, multi-file coordination, Frontend UI, Rules compilation | 1, 3, 4A, 5 |
| **Codex** | Architecture audit, Backend logic, SQL transactions, TDD, Security | 2, 4B |

## 7. QUY TẮC CHUNG KHI CODE & THỰC THI (ALWAYS ON)

1. **MUST** chạy `pnpm -r typecheck` trước khi báo cáo hoàn thành bất kỳ story/thay đổi code nào.
2. **MUST** chạy `pnpm -r test` và đảm bảo 100% test pass.
3. **NEVER** viết code giả lập `// TODO`, `// placeholder`, hay bỏ trống function body.
4. **MUST** import shared types/enums/schemas từ `@fnb/shared` (alias của `packages/shared/`), KHÔNG duplicate definitions.
5. **MUST** đọc file rules tương ứng trong `.agents/rules/` trước khi code từng module.

## 8. CÁC FILE RULES CHI TIẾT

Đọc thêm các file rules chi tiết tại:
- `.agents/rules/00-architecture-and-monorepo.md`
- `.agents/rules/01-database-and-concurrency.md`
- `.agents/rules/02-pos-kitchen-and-cashflow-logic.md`
- `.agents/rules/03-rbac-security-and-hr-schedule.md`
- `.agents/rules/04-frontend-ux-table-and-print.md`
- `.agents/rules/05-testing-strategy.md`
- `.agents/rules/06-error-handling-and-logging.md`
- `.agents/rules/07-deployment-and-git.md`

## 9. BMAD Runtime & Skill Version (MUST)

- `.agents/skills/bmad-build/` và `bmad-build-auto/` là source được quản lý trong repo; giữ chúng tương thích với renderer trong BMAD Core. **NEVER** dùng bản skill tạm ở ngoài repo để lách lỗi parser.
- BMAD cần `uv`; Skills CLI cần Node.js `>=22.20.0`. Đây là yêu cầu cho tooling, **không** nâng phiên bản Node dùng cho ứng dụng nếu chưa có yêu cầu riêng.
- Khi user đã yêu cầu triển khai và thiếu `_bmad/scripts/render_skill.py`, agent **MUST** chạy quy trình `bmad setup` ở phạm vi project rồi render lại; không hỏi user xác nhận setup lần nữa. **NEVER** tự viết hoặc chép tay runtime vào `_bmad/`.
- Khi renderer báo cú pháp skill cũ như `{{.variable}}`, cập nhật skill project và module record từ cùng nguồn BMAD bằng `npx skills update -p -y`, chạy lại `bmad setup`, rồi render lại skill trong repo. Giữ nguyên các skill retired cho tới khi user duyệt xóa.
- Version hóa `.agents/skills/bmad/`, các `bmod-*/`, skill đã cập nhật và `skills-lock.json`; `_bmad/` cùng `_bmad-output/` tiếp tục là runtime/artifact local bị ignore.
