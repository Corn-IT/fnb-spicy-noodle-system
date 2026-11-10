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
