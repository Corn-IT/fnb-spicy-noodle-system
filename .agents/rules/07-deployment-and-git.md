# 07 — Triển khai & Git (Deployment & Git Convention Rules)

> Áp dụng cho: Mọi Agent, mọi Phase. Kết hợp skill: `git-workflow-pro`.

---

## 1. Docker Compose Production

```yaml
# docker-compose.yml
version: '3.8'
services:
  caddy:
    image: caddy:2-alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    depends_on: [api]

  api:
    build: ./apps/api-server
    environment:
      - FNB_DATABASE_URL=postgresql://fnb:${DB_PASSWORD}@db:5432/fnb_pos
      - NODE_ENV=production
    depends_on: [db]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/v1/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: fnb_pos
      POSTGRES_USER: fnb
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data

  backup:
    image: postgres:16-alpine
    entrypoint: /bin/sh -c "cron && crond -f"
    # Cron: pg_dump lúc 03:00 → compress → upload R2
    volumes:
      - ./scripts/backup.sh:/backup.sh
    depends_on: [db]

volumes:
  caddy_data:
  pgdata:
```

## 2. Dockerfile Rules

### `apps/api-server/Dockerfile`:
- Multi-stage build:
  - Stage `builder`: install deps + compile TypeScript
  - Stage `runner`: copy `dist/` + `node_modules` (production only)
- **MUST** dùng `node:20-alpine` làm base image.
- **MUST** chạy dưới non-root user.
- **MUST** có HEALTHCHECK.

```dockerfile
# Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Runner
FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup -g 1001 -S fnb && adduser -S fnb -u 1001
COPY --from=builder --chown=fnb:fnb /app/dist ./dist
COPY --from=builder --chown=fnb:fnb /app/node_modules ./node_modules
COPY --from=builder --chown=fnb:fnb /app/prisma ./prisma
COPY --from=builder --chown=fnb:fnb /app/package.json .
USER fnb
EXPOSE 3000
HEALTHCHECK CMD curl -f http://localhost:3000/api/v1/health || exit 1
CMD ["node", "dist/main.js"]
```

### `apps/web-app/`:
- Build thành static files → deploy Cloudflare Pages. Không cần Docker.

## 3. Environment Variables

### Naming Convention & Dual Compatibility (`DISCREPANCY-ENV-01`):
- Prefix: `FNB_` cho project-specific vars trong Docker Compose Production, đồng thời khai báo biến chuẩn (`DATABASE_URL`, `JWT_SECRET`, `PORT`, `CORS_ORIGIN`) để tương thích trực tiếp với Prisma CLI (`npx prisma migrate dev`).
- Module cấu hình của `apps/api-server` **MUST** đọc theo thứ tự ưu tiên: `process.env.FNB_DATABASE_URL ?? process.env.DATABASE_URL` (tương tự cho `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `PORT`, `CORS_ORIGIN`).
- Format: `SCREAMING_SNAKE_CASE`.

### Required vars (`apps/api-server/.env.example`):
```env
# Database (Both FNB_ prefix and standard Prisma CLI var)
FNB_DATABASE_URL=postgresql://user:password@localhost:5432/fnb_pos?schema=public
DATABASE_URL=postgresql://user:password@localhost:5432/fnb_pos?schema=public

# JWT
FNB_JWT_SECRET=your-64-char-random-secret
JWT_SECRET=your-64-char-random-secret
FNB_JWT_EXPIRES_IN=15m
JWT_EXPIRES_IN=15m
FNB_JWT_REFRESH_EXPIRES_IN=7d

# Server
FNB_PORT=3000
PORT=3000
FNB_CORS_ORIGIN=https://pos.yourdomain.com
CORS_ORIGIN=https://pos.yourdomain.com

# Cloudflare R2
FNB_R2_ACCOUNT_ID=
FNB_R2_ACCESS_KEY_ID=
FNB_R2_SECRET_ACCESS_KEY=
FNB_R2_BUCKET_NAME=fnb-pos-assets
FNB_R2_BACKUP_BUCKET=fnb-pos-backups

# VietQR (optional)
FNB_VIETQR_BANK_ID=
FNB_VIETQR_ACCOUNT_NO=
FNB_VIETQR_ACCOUNT_NAME=

# Node
NODE_ENV=development
```

- **NEVER** commit `.env` vào git.
- **MUST** có `.env.example` với tất cả variable names (không có real values).
- **MUST** validate required env vars khi startup — fail fast nếu thiếu.

## 4. Git Branch Strategy

```
main ← production-ready, protected
  └── develop ← integration branch
        ├── feat/pos-delta-split
        ├── feat/cashflow-settlement
        ├── fix/pos-merge-takeaway-guard
        └── ...
hotfix/* ← branch từ main, merge lại main + develop
```

- `feat/<module>-<description>` — feature mới.
- `fix/<module>-<description>` — sửa lỗi.
- `hotfix/<description>` — sửa khẩn cấp trên production.
- **NEVER** push trực tiếp lên `main` hoặc `develop`.

## 5. Commit Message Convention (Conventional Commits)

```
<type>(<scope>): <description>

[optional body]
[optional footer]
```

### Types:
`feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`

### Scopes:
`shared`, `api`, `web`, `pos`, `cashflow`, `inventory`, `hr`, `mdm`, `rbac`, `infra`

### Ví dụ:
```
feat(pos): implement delta split 3 kitchen stations
fix(cashflow): exclude TRANSFER payments from expected cash formula
test(pos): add MOVE/MERGE/SWAP integration tests with row locking
docs(bmad): create PRD-Master document for Phase 1
chore(infra): add docker-compose.yml with Caddy + PostgreSQL
```

- **MUST** viết bằng English (commit messages).
- **MUST** atomic — mỗi commit = 1 logical change.

## 6. Docker Image Tagging

- Format: `fnb-api:<version>-<short-sha>` (VD: `fnb-api:1.0.0-a1b2c3d`).
- Version theo semver: `MAJOR.MINOR.PATCH`.
- Tag `latest` luôn trỏ tới production build mới nhất.

## 7. Deployment Pipeline

```
Push feat/* → PR tới develop → Review → Merge
develop → (auto-deploy staging nếu có)
develop → PR tới main → Final Review → Merge → Production
```

### Khi merge vào `main`:
1. Build Docker image cho api-server.
2. Push/build trên VPS qua `docker compose`.
3. Run migrations: `docker compose exec api npx prisma migrate deploy`.
4. Health check: verify `/api/v1/health` trả về 200.

## 8. Infrastructure Cost Target

- **Target:** 120.000đ – 150.000đ/tháng tổng cộng.
- VPS: 2 vCPU, 4GB RAM, 40GB NVMe SSD (~120k/tháng).
- Frontend CDN: Cloudflare Pages (miễn phí).
- File storage: Cloudflare R2 (miễn phí 10GB, miễn phí egress).
- Backup: Cloudflare R2 (miễn phí).
- SSL: auto via Caddy + Let's Encrypt (miễn phí).
- **NEVER** dùng managed services đắt tiền (AWS RDS, Heroku, Vercel Pro) cho quy mô này.

## 9. .gitignore

```gitignore
# Dependencies
node_modules/

# Build
dist/
.turbo/

# Environment
.env
*.env.local

# Database
apps/api-server/prisma/*.db

# Coverage
coverage/

# OS
.DS_Store
Thumbs.db
```

### MUST commit:
- `docker-compose.yml`, `Dockerfile`, `Caddyfile`
- `.env.example`
- `prisma/schema.prisma`, `prisma/migrations/`
- `pnpm-lock.yaml`

### NEVER commit:
- `.env`, `node_modules/`, `dist/`, database files, `coverage/`
