FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build && pnpm exec tsx --version >/dev/null \
 && mkdir -p scripts \
 && pnpm exec esbuild src/db/migrate.ts --bundle --platform=node --format=esm --outfile=scripts/migrate.mjs --packages=external \
 && pnpm exec esbuild src/worker/index.ts --bundle --platform=node --format=esm --outfile=scripts/worker.mjs --packages=external

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src/db/migrations ./src/db/migrations
COPY --from=build /app/node_modules/postgres ./node_modules/postgres
COPY --from=build /app/node_modules/pg-boss ./node_modules/pg-boss
EXPOSE 3000
CMD ["node", "server.js"]
