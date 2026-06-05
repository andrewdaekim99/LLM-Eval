# syntax=docker/dockerfile:1.7
# Multi-stage Dockerfile for the Yardstick dashboard.
#
# The dashboard is read-only: it consumes the SQLite DB + run artifacts
# produced by `pnpm yardstick run …` on the host. At runtime we mount
# ./runs and ./.cache from the host as read-only volumes (see
# docker-compose.yml at the repo root).
#
# Build context is the workspace root; the Dockerfile path is
# apps/dashboard/Dockerfile.

# ── build stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
RUN apk add --no-cache python3 make g++ libc6-compat
RUN corepack enable
WORKDIR /app

# Copy the whole workspace (the .dockerignore prunes node_modules / .next /
# .cache / dist / .env etc.). Simpler than chasing per-package COPYs across
# a pnpm workspace.
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @yardstick/core build
RUN pnpm --filter @yardstick/dashboard build

# ── runtime stage ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Next's standalone output (with outputFileTracingRoot = workspace root)
# emits a self-contained server tree rooted at apps/dashboard/server.js.
COPY --from=build /app/apps/dashboard/.next/standalone ./
COPY --from=build /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=build /app/apps/dashboard/public ./apps/dashboard/public

# Pre-create read-only mount points so an empty host dir doesn't fail.
RUN mkdir -p /app/runs /app/.cache

EXPOSE 3000
CMD ["node", "apps/dashboard/server.js"]
