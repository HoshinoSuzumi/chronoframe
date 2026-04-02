FROM node:22.22.2-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /usr/src/app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/webgl-image/package.json ./packages/webgl-image/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /usr/src/app
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=deps /usr/src/app/packages/webgl-image/node_modules ./packages/webgl-image/node_modules
COPY . .
RUN NODE_OPTIONS="--max-old-space-size=4096" pnpm run build:deps
RUN NODE_OPTIONS="--max-old-space-size=4096" pnpm run build

FROM node:22.22.2-alpine AS runtime
RUN apk update && apk add --no-cache perl exiftool
WORKDIR /app

COPY --from=build /usr/src/app/.output ./.output
COPY --from=build /usr/src/app/packages/webgl-image/dist ./packages/webgl-image/dist
COPY --from=build /usr/src/app/scripts ./scripts
COPY --from=build /usr/src/app/server/database/migrations ./server/database/migrations

EXPOSE 3000
VOLUME ["/app/data"]

ENV NODE_ENV=production
ENV NITRO_PORT=3000
ENV NITRO_HOST=0.0.0.0

# node scripts/migrate.mjs first
CMD ["sh", "-c", "node scripts/migrate.mjs && node .output/server/index.mjs"]
