# syntax=docker/dockerfile:1.7
# Build from the repo root: docker build -f apps/api/Dockerfile .

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate
WORKDIR /repo

FROM base AS build
# lockfile first so the dependency layer is cached between code changes
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @coopswap/api...
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @coopswap/shared build && pnpm --filter @coopswap/api build
# a pruned, production-only node_modules for just the api (+ shared)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm --filter @coopswap/api deploy --prod --legacy /out

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production MIGRATIONS_DIR=/app/migrations
WORKDIR /app
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
COPY --chown=node:node database/migrations ./migrations
USER node
EXPOSE 4000 9464
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD node -e "fetch('http://127.0.0.1:4000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# migrations are a separate step (see docs/operations.md), not part of boot
CMD ["node", "--import", "./dist/tracing.js", "dist/server.js"]
