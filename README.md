# 🌶️ Hệ thống POS & Quản trị Vận hành Thời gian thực — Quán Mì Cay Sơn Bảo

Hệ thống **Point of Sale (POS) & Quản trị Vận hành khép kín** được thiết kế chuyên biệt cho mô hình Quán Mì Cay quy mô **20–30 bàn, 3 khu vực bếp (`Bếp Nấu`, `Bếp Chiên`, `Pha Chế`), 200–600 đơn/ngày**.

👉 **Xem ngay Tài liệu Giải pháp & Hướng dẫn Sử dụng Trực quan cho End-User tại:** [`docs/HUONG_DAN_SU_DUNG_VA_GIAI_PHAP.md`](docs/HUONG_DAN_SU_DUNG_VA_GIAI_PHAP.md)

---

## 1. Tính năng Nổi bật

- **Thực đơn 3 Tầng Động & Tuỳ chọn Đổi món Thông minh (`/menu`, `/pos`, `/qr/:token`):**
  - Phân cấp 3 tầng linh hoạt: **Tầng 1 (Khu vực Bếp)** → **Tầng 2 (Danh mục con MDM)** → **Tầng 3 (Sản phẩm + Subtitle động)**.
  - Hỗ trợ đầy đủ 4 nhóm tuỳ chọn đặc thù quán mì cay: **Cấp độ cay (1–7)**, **Đồ ăn mặc định 0đ (Auto-check, bỏ tích để dặn bếp `"Không ..."`)**, **Đồ ăn chính (Bỏ tích tự động đổi sang món còn lại hoặc tự khoá về món duy nhất còn lại)**, và **Đồ ăn thêm (+Giá)**.
- **Tách 3 Bếp Thông minh — Delta Split 80mm (`POST /api/v1/pos/orders/:id/split-kitchen`):**
  - Chỉ lọc và in các món mới gọi (`kitchen_status = 'NEW'`), tự động phân rã món `COMBO` về đúng trạm bếp thực tế (`BEP_NAU`, `BEP_CHIEN`, `PHA_CHE`), chống in trùng tuyệt đối.
- **Điều phối Bàn & Đơn Mang về An toàn Giao dịch (`SELECT ... FOR UPDATE`):**
  - Quản lý 30 bàn vật lý (`DINE_IN`) và đơn Mang về (`TAKEAWAY` tự tăng số thứ tự hàng ngày).
  - Hỗ trợ **Chuyển bàn (`MOVE`)**, **Ghép bàn (`MERGE`)**, **Đổi bàn (`SWAP`)** chống Race Condition & Deadlock.
- **Tách bạch In Tạm Tính (Kèm VietQR Động) vs Thanh toán 2 Bước:**
  - In tạm tính giữ nguyên trạng thái bàn đang phục vụ (`SERVING`); Thanh toán hỗ trợ `CASH`, `TRANSFER`, và `SPLIT` (Kết hợp Tiền mặt + Chuyển khoản).
- **Đối soát & Kết ca Két Tiền mặt Chính xác (`/cashflow`, `/inventory`):**
  - Tự động tính tiền mặt lý thuyết trong két từ Ngân sách đầu ca + Doanh thu tiền mặt thực thu − Phiếu nhập kho lấy từ két (`CASH_DRAWER`).
- **Quản trị Nhân sự, Lịch làm việc Tuần dạng Excel, Master Data & RBAC (`/employees`, `/schedules`, `/master-data`, `/rbac`).**

---

## 2. Cấu trúc Monorepo & Tech Stack

```text
fnb-spicy-noodle-system/
├── apps/
│   ├── api-server/          # Backend: NestJS 11 + Prisma 6 + Socket.io 4 + PostgreSQL 16
│   └── web-app/             # Frontend: React 19 + Vite 8 + TanStack Query/Table + TailwindCSS
├── packages/
│   └── shared/              # Shared TypeScript Contracts: Zod Schemas, Enums, DTOs (@fnb/shared)
├── docs/
│   ├── HUONG_DAN_SU_DUNG_VA_GIAI_PHAP.md   # Cẩm nang giải pháp & HDSD toàn diện cho End-User
│   ├── bmad/                               # PRD, RBAC Matrix, Edge Cases & Invariants
│   ├── architecture/                       # ERD, State Machines, Sequences, Audit Report
│   └── stories/                            # 12 User Stories chi tiết
├── AGENTS.md                # Hiến pháp kỹ thuật & 10 Quy tắc bất biến (Hard Invariants)
└── docker-compose.yml       # Cấu hình triển khai Production (Caddy + API + PostgreSQL + Backup)
```

---

## 3. Yêu cầu Môi trường (Prerequisites)

Trước khi bắt đầu, hãy đảm bảo máy của bạn đã cài đặt:
1. **Node.js:** Phiên bản `>= 20.x` (Khuyến nghị Node 20 LTS hoặc 22 LTS).
2. **pnpm:** Phiên bản `>= 9.x` (Kích hoạt nhanh bằng lệnh `corepack enable`).
3. **PostgreSQL:** Phiên bản `>= 16.x` đang chạy tại cổng `5432` (hoặc chạy nhanh qua Docker ở Bước 2 bên dưới).
4. **Git:** Để clone mã nguồn.

---

## 4. Hướng dẫn Cài đặt & Chạy Dự án sau khi Clone từ GitHub (5 Bước)

### Bước 1: Clone kho mã nguồn và cài đặt thư viện

```bash
git clone https://github.com/Corn-IT/fnb-spicy-noodle-system.git
cd fnb-spicy-noodle-system

# Cài đặt toàn bộ dependencies cho cả Monorepo (shared, api-server, web-app)
pnpm install
```

### Bước 2: Khởi tạo tập tin biến môi trường (`.env`)

Sao chép file cấu hình mẫu `.env.example` sang `.env` cho cả Backend và Frontend:

- **Trên Windows (PowerShell):**
  ```powershell
  Copy-Item .env.example .env
  Copy-Item apps/api-server/.env.example apps/api-server/.env
  Copy-Item apps/web-app/.env.example apps/web-app/.env
  ```

- **Trên macOS / Linux (Bash):**
  ```bash
  cp .env.example .env
  cp apps/api-server/.env.example apps/api-server/.env
  cp apps/web-app/.env.example apps/web-app/.env
  ```

> **Lưu ý kết nối PostgreSQL:**
> Mặc định file `apps/api-server/.env` kết nối tới:
> `postgresql://postgres:postgres@127.0.0.1:5432/fnb_pos?schema=public`
> - Nếu bạn đã cài sẵn PostgreSQL trên máy với mật khẩu khác, hãy sửa lại `user:password` trong `apps/api-server/.env` và tạo database trống tên là `fnb_pos`.
> - Nếu bạn chưa cài PostgreSQL trên máy và muốn bật nhanh qua **Docker**, chỉ cần chạy lệnh:
>   ```bash
>   docker run --name fnb-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=fnb_pos -p 5432:5432 -d postgres:16-alpine
>   ```

### Bước 3: Build gói dùng chung, chạy Migration và nạp dữ liệu mẫu (Seed)

Chạy duy nhất 1 lệnh dưới đây từ thư mục gốc để tự động sinh Prisma Client, tạo toàn bộ bảng + ràng buộc SQL và nạp sẵn dữ liệu mẫu (30 bàn, 6 danh mục thực đơn, 11 món ăn kèm nhóm tuỳ chọn đổi món thông minh, nhân sự & tài khoản mẫu):

```bash
pnpm --filter @fnb/shared build
pnpm db:setup
```

*(Hoặc nếu bạn muốn chạy từng lệnh riêng lẻ trong `apps/api-server`):*
```bash
cd apps/api-server
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
cd ../..
```

### Bước 4: Khởi động Hệ thống (Backend API + Frontend Web App)

Tại thư mục gốc của dự án, chạy lệnh:

```bash
pnpm dev
```

Hệ thống sẽ đồng thời khởi chạy:
- **Frontend Web App (React + Vite):** [http://localhost:5173](http://localhost:5173)
- **Backend API & Socket.io Server (NestJS):** [http://localhost:3000/api/v1/health](http://localhost:3000/api/v1/health)

### Bước 5: Đăng nhập và Trải nghiệm

Mở trình duyệt truy cập **[http://localhost:5173](http://localhost:5173)** và đăng nhập bằng một trong các tài khoản mặc định đã được nạp sẵn từ `seed`:

| Vai trò | Tên đăng nhập (`username`) | Mật khẩu (`password`) | Quyền hạn |
| :--- | :--- | :--- | :--- |
| **Chủ quán (SuperAdmin)** | `superadmin` | `Password@123` | Toàn quyền hệ thống (POS, Thực đơn `/menu`, Hoá đơn, Kho, Kết ca, Nhân sự, Lịch tuần, MDM, Phân quyền RBAC). |
| **Thu ngân Quầy (Cashier)** | `cashier01` | `Password@123` | Bán hàng POS, Tách bếp, Chuyển/Ghép/Đổi bàn, Thanh toán, Nhập kho, Kết ca, Xem lịch làm việc. |

---

## 5. Các Lệnh CLI Thường Dùng trong Phát triển & Kiểm thử

| Lệnh CLI | Mô tả chức năng |
| :--- | :--- |
| `pnpm dev` | Chạy đồng thời API Server (`:3000`) và Web App (`:5173`) ở chế độ Watch/Hot-Reload. |
| `pnpm -r build` | Biên dịch toàn bộ các gói (`@fnb/shared`, `@fnb/api-server`, `@fnb/web-app`). |
| `pnpm -r typecheck` | Kiểm tra nghiêm ngặt kiểu dữ liệu TypeScript trên toàn bộ Monorepo. |
| `pnpm -r test` | Chạy toàn bộ bộ kiểm thử tự động (Unit & Integration Tests với Vitest). |
| `pnpm -r test:coverage` | Chạy kiểm thử kèm báo cáo độ phủ mã nguồn (Coverage Report). |
| `pnpm -r lint` | Kiểm tra quy chuẩn mã nguồn với ESLint. |
| `pnpm db:setup` | Chạy `prisma generate` + `prisma migrate deploy` + `prisma db seed`. |
| `pnpm db:seed` | Nạp lại dữ liệu mẫu chuẩn hoá vào PostgreSQL (Idempotent — an toàn chạy lại nhiều lần). |

---

## 6. Triển khai Production với Docker Compose

Khi triển khai lên máy chủ VPS Production:

1. Thiết lập biến môi trường `DB_PASSWORD` và cập nhật tên miền trong `Caddyfile`.
2. Khởi chạy toàn bộ cụm dịch vụ (`caddy`, `api`, `db`, `backup`):
   ```bash
   DB_PASSWORD=your_strong_postgres_password docker compose up -d --build
   ```
3. Áp dụng migration và nạp dữ liệu khởi tạo trên container Production:
   ```bash
   docker compose exec api npx prisma migrate deploy
   docker compose exec api npx prisma db seed
   ```
4. Kiểm tra trạng thái hoạt động:
   ```bash
   curl -f http://localhost:3000/api/v1/health
   ```
