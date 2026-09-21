FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV BANNER="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
RUN pnpm build \
 && mkdir -p scripts \
 && pnpm exec esbuild src/db/migrate.ts  --bundle --platform=node --format=esm --outfile=scripts/migrate.mjs --banner:js="$BANNER" \
 && pnpm exec esbuild src/worker/index.ts --bundle --platform=node --format=esm --outfile=scripts/worker.mjs  --banner:js="$BANNER" --external:pg-native

FROM base AS runner
ENV NODE_ENV=production
ENV MIGRATIONS_DIR=/app/migrations
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src/db/migrations ./migrations
EXPOSE 3000
CMD ["node", "server.js"]
