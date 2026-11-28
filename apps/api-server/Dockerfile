FROM node:20-alpine AS builder
WORKDIR /app
ENV COREPACK_HOME=/usr/local/share/corepack
RUN apk add --no-cache openssl \
  && npm install -g corepack@latest \
  && corepack enable \
  && corepack prepare pnpm@12.18.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/api-server/package.json ./apps/api-server/package.json
COPY apps/web-app/package.json ./apps/web-app/package.json
RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY apps/api-server ./apps/api-server

RUN pnpm --filter @fnb/shared build \
  && pnpm --filter @fnb/api-server exec prisma generate \
  && pnpm --filter @fnb/api-server build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV COREPACK_HOME=/usr/local/share/corepack
RUN apk add --no-cache openssl \
  && npm install -g corepack@latest \
  && corepack enable \
  && corepack prepare pnpm@12.18.0 --activate

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/tsconfig.base.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/api-server/package.json /app/apps/api-server/tsconfig.json ./apps/api-server/
COPY --from=builder /app/apps/api-server/node_modules ./apps/api-server/node_modules
COPY --from=builder /app/apps/api-server/dist ./apps/api-server/dist
COPY --from=builder /app/apps/api-server/src ./apps/api-server/src
COPY --from=builder /app/apps/api-server/prisma ./apps/api-server/prisma
COPY --from=builder /app/apps/api-server/prisma.config.ts ./apps/api-server/prisma.config.ts
COPY --from=builder /app/apps/api-server/docker-entrypoint.sh ./apps/api-server/docker-entrypoint.sh

RUN sed -i 's/\r$//' /app/apps/api-server/docker-entrypoint.sh \
  && chmod +x /app/apps/api-server/docker-entrypoint.sh \
  && chown -R node:node /app/apps/api-server

USER node
WORKDIR /app/apps/api-server
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/v1/health | grep -q '"status":"ok"' || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
