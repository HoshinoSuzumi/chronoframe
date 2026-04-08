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
RUN NODE_OPTIONS="--max-old-space-size=8192" pnpm run build
RUN find ./.output -type f -name '*.map' -delete

FROM alpine:3.22 AS runtime_deps
RUN apk add --no-cache nodejs libstdc++ ca-certificates

FROM scratch AS runtime
WORKDIR /app

COPY --from=runtime_deps /usr/bin/node /usr/bin/node
COPY --from=runtime_deps /usr/lib /usr/lib
COPY --from=runtime_deps /usr/share /usr/share
COPY --from=runtime_deps /lib /lib
COPY --from=runtime_deps /etc/ssl /etc/ssl

COPY --from=build /usr/src/app/.output ./.output
COPY --from=build /usr/src/app/server/database/migrations ./server/database/migrations

EXPOSE 3000
VOLUME ["/app/data"]

ENV NODE_ENV=production
ENV NITRO_PORT=3000
ENV NITRO_HOST=0.0.0.0
ENV DATABASE_URL=./data/app.sqlite3
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

CMD ["/usr/bin/node", ".output/server/index.mjs"]
