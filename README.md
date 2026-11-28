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
│   ├── architecture/                       # ERD (20 bảng), State Machines, Sequences, Audit Report
│   └── stories/                            # 21 User Stories chi tiết (story-01 .. story-21)
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

Chạy duy nhất 1 lệnh dưới đây từ thư mục gốc để tự động sinh Prisma Client, tạo toàn bộ 20 bảng (20 SQL migrations) + ràng buộc CHECK và nạp sẵn dữ liệu mẫu (30 bàn vật lý, 6 danh mục thực đơn, 164 món ăn/topping chuẩn kèm tuỳ chọn đổi món thông minh, nhân sự & 4 tài khoản mẫu):

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
| **Chủ quán (`SUPERADMIN`)** | `superadmin` | `Password@123` | Toàn quyền tuyệt đối trên 14 nhóm quyền (POS Desktop & `/pos/touch`, Thực đơn `/menu`, Hoá đơn, Kho, Kết ca, Nhân sự, Lịch tuần, Bảng lương, MDM, Phân quyền RBAC, Cài đặt). |
| **Quản lý (`ADMIN`)** | `admin` | `Password@123` | Toàn quyền vận hành nghiệp vụ (trừ huỷ hoá đơn đã thu tiền `invoices:void` và thao tác `@SuperAdminOnly` ở `/rbac`). |
| **Kiểm toán (`ADMIN_VIEW`)** | `adminview` | `Password@123` | Chỉ xem (`view`) và xuất Excel (`export`) các phân hệ quản trị & báo cáo. |
| **Thu ngân (`CASHIER`)** | `thungan` | `Password@123` | Bán hàng POS Desktop & `/pos/touch`, Tách bếp, Chuyển/Ghép/Đổi bàn, Thanh toán, Nhập kho, Kết ca (Blind Mode), Bảng công (chỉ xem). |

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
| `pnpm db:setup` | Chạy `prisma generate` + migration + seed; chỉ dùng với DB mới vì seed xoá `order_items` và reset menu. |
| `pnpm db:seed` | Reset danh mục món rồi nạp dữ liệu mẫu; xoá toàn bộ `order_items`, không chạy trên DB có dữ liệu cần giữ. |

---

## 6. Triển khai Production với Docker Compose

Khi triển khai lên máy chủ VPS Production:

1. Sao chép `.env.production.example` thành `.env` và `.env.production`. Đặt `POSTGRES_PASSWORD` trong `.env`; dùng cùng thông tin đăng nhập trong `FNB_DATABASE_URL`/`DATABASE_URL` của `.env.production`; cập nhật `DOMAIN`, `CORS_ORIGIN`, JWT secrets và `FNB_SEED_INITIAL_PASSWORD` (chuỗi ngẫu nhiên riêng, tối thiểu 16 ký tự).
2. Khởi chạy PostgreSQL và API trước, chưa bật Caddy:
   ```bash
   docker compose up -d --build postgres api-server
   ```
3. Container `api-server` đợi PostgreSQL healthy, sau đó chạy `prisma migrate deploy` trước khi khởi động NestJS. Nếu migration lỗi, API không khởi động. Theo dõi log và kiểm tra trạng thái migration:
   ```bash
   docker compose logs api-server
   docker compose exec api-server npx prisma migrate status
   ```
4. Chỉ trên DB production mới hoàn toàn, nạp dữ liệu ban đầu đúng một lần:
   ```bash
   docker compose exec api-server npx prisma db seed
   ```
   Tất cả tài khoản seed dùng `FNB_SEED_INITIAL_PASSWORD`. **Không chạy lại trên DB đang vận hành:** script seed hiện tại xoá `order_items` và reset danh mục món trước khi nạp lại. Đổi mật khẩu từng tài khoản sau khi đăng nhập.
5. Khởi chạy Caddy:
   ```bash
   docker compose up -d caddy
   ```
6. Kiểm tra trạng thái hoạt động qua domain HTTPS đã cấu hình:
   ```bash
   curl -f https://pos.yourdomain.vn/api/v1/health
   ```
