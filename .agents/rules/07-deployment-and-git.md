---
trigger: model_decision
description: Docker Compose production deployment, Caddyfile reverse proxy, environment setup, and Git branch/commit conventions.
---

# 07 — Triển khai & Git (Deployment & Git Convention Rules)

> Áp dụng cho: Mọi Agent thao tác trên Docker, Caddy, Environment Variables và Git workflow. Đồng bộ 100% với `docker-compose.yml`, `Dockerfile.caddy`, `Caddyfile` và `.env.example` tại root.

---

## 1. Kiến trúc Docker Compose Production (`docker-compose.yml`)

Hệ thống chạy gói gọn trong **3 container** trên mạng nội bộ `fnb_internal`:
1. **`postgres` (`postgres:16-alpine`):** `POSTGRES_DB=fnb_pos`, `POSTGRES_USER=postgres`, tối ưu bộ nhớ (`shared_buffers=512MB`, `max_connections=80`, `mem_limit: 1200m`), volume `pgdata`, healthcheck `pg_isready`.
2. **`api-server` (`apps/api-server/Dockerfile`):** `NODE_ENV=production`, `NODE_OPTIONS="--max-old-space-size=768"`, `mem_limit: 1200m`, đọc `env_file: .env.production`, expose cổng `3000` nội bộ, healthcheck `wget -qO- http://127.0.0.1:3000/api/v1/health`.
3. **`caddy` (`Dockerfile.caddy`):** Multi-stage build static `apps/web-app` vào `/srv/web-app` và chạy Caddy reverse proxy (`mem_limit: 256m`, ports `80:80`, `443:443`, volume `caddy_data`).

### Quy tắc Reverse Proxy (`Caddyfile`):
- `/api/*` và `/socket.io/*` → `reverse_proxy api-server:3000`.
- `/assets/*` và `/audio/*` (JS/CSS hash & Vietnamese MP3 voice clips) → `Cache-Control: public, max-age=31536000, immutable`.
- SPA fallback (`try_files {path} /index.html`) → `Cache-Control: no-cache`.
- Bắt buộc duy trì security headers: `HSTS`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Permissions-Policy` cho phép `geolocation=(self)` (phục vụ QR GPS Geofence).

---

## 2. Environment Variables (`.env.example` & `.env.production.example`)

- Backend (`apps/api-server/src/config/env.config.ts`) hỗ trợ song song tiền tố `FNB_*` và biến chuẩn:
  - `FNB_DATABASE_URL` / `DATABASE_URL` (PostgreSQL URL)
  - `FNB_JWT_SECRET` / `JWT_SECRET` (**tối thiểu 64 ký tự**)
  - `FNB_JWT_EXPIRES_IN` / `JWT_EXPIRES_IN` (mặc định `15m`)
  - `FNB_JWT_REFRESH_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` (mặc định `7d`)
  - `FNB_PORT` / `PORT` (mặc định `3000`)
  - `FNB_CORS_ORIGIN` / `CORS_ORIGIN`
  - `FNB_SEED_INITIAL_PASSWORD` — bắt buộc khi seed production, tối thiểu 16 ký tự; đặt trước lần seed đầu tiên.
  - Tuỳ chọn: `FNB_R2_*` (Cloudflare R2), `FNB_VAPID_PUBLIC_KEY` / `FNB_VAPID_PRIVATE_KEY` / `FNB_VAPID_SUBJECT` (Web Push — nếu bỏ trống hệ thống tự sinh & lưu trong PostgreSQL).
- Frontend: `VITE_API_BASE_URL`, `VITE_SOCKET_URL`.
- **NEVER** commit `.env` hoặc `.env.production`.

---

## 3. Git Branch Strategy & Commit Convention

```
main ← production-ready
  └── develop ← integration branch
        ├── feat/<scope>-<description>
        ├── fix/<scope>-<description>
        └── ...
hotfix/<description> ← branch từ main, merge lại main + develop
```

### Conventional Commits (English):
```
<type>(<scope>): <description>
```
- **Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`
- **Scopes:** `shared`, `api`, `web`, `pos`, `menu`, `discounts`, `invoices`, `cashflow`, `payment-qr`, `inventory`, `hr`, `payroll`, `mdm`, `rbac`, `settings`, `dashboard`, `infra`
- Mỗi commit phải atomic (1 thay đổi logic rõ ràng).

---

## 4. Production Deploy Checklist

1. Chạy `pnpm -r typecheck && pnpm -r test && pnpm -r lint` trước khi merge vào `main`.
2. Cài mới: đặt `FNB_SEED_INITIAL_PASSWORD`, sau đó chạy `docker compose up -d --build postgres api-server` để API tự migrate trước khi khởi động. Xác nhận log và `docker compose exec api-server npx prisma migrate status`.
3. Chỉ với DB hoàn toàn mới, chạy `docker compose exec api-server npx prisma db seed` đúng một lần trước khi mở traffic. Mọi tài khoản seed dùng mật khẩu trên. Lệnh seed hiện tại reset menu và xoá `order_items`; **NEVER** chạy trên DB production đang có dữ liệu cần giữ.
4. Sau khi seed thành công, chạy `docker compose up -d caddy`, đăng nhập và đổi mật khẩu các tài khoản seed.
5. Nếu nền tảng deploy không gọi Docker entrypoint này, release job **MUST** chạy `pnpm db:migrate` trước khi khởi động hoặc chuyển traffic sang API mới.
6. Kiểm tra `/api/v1/health` trả `200 OK` với `"status":"ok","database":"connected"`.

## 5. MUST / NEVER Commit

- **MUST commit:** `docker-compose.yml`, `Dockerfile.caddy`, `apps/api-server/Dockerfile`, `Caddyfile`, `.env.example`, `.env.production.example`, `prisma/schema.prisma`, `prisma/migrations/`, `pnpm-lock.yaml`, BMAD project skills/module records and `skills-lock.json`.
- **NEVER commit:** `.env`, `.env.production`, `certs/*`, `node_modules/`, `dist/`, `coverage/`.

## 6. BMAD Skills & Project Runtime

- Version the project BMAD entry skills, module records and `skills-lock.json`; keep `bmad-build` / `bmad-build-auto` on the same BMAD Method release as the `bmad` / Core Tools runtime.
- BMAD setup scripts require `uv`. The Skills CLI currently requires Node.js `>=22.20.0`; use that for skill management without changing the Node runtime used by the POS app.
- Initial project installation (run with Node.js `>=22.20.0`):

```bash
npx skills add bmad-code-org/BMAD-METHOD/skills/core-tools --skill bmad bmod-core-tools -a codex -y
npx skills add bmad-code-org/BMAD-METHOD/skills/method --skill bmad-build bmad-build-auto bmod-method -a codex -y
```

- Then run the `bmad` skill's `bmad setup` flow to generate or repair `_bmad/`. If an implementation request is already authorized, setup is part of that work; do not pause to ask permission. **NEVER** hand-write `_bmad/scripts` or bypass a parser error with a temporary skill copy.
- If `render_skill.py` reports old template syntax, update the project skills with `npx skills update -p -y`, run `bmad setup`, then render the project-local skill again. Preserve retired skills until the user authorizes removal.
- `_bmad/` and `_bmad-output/` are generated local runtime and planning artifacts; keep them ignored. Commit the skill sources and lock so another developer can reproduce setup.

If the app shell has Node.js older than 22.20.0, run the CLI with an isolated newer runtime instead of changing the app toolchain:

```bash
npx --yes --package=node@22.20.0 --package=skills@1.9.0 -c 'skills update -p -y'
```
