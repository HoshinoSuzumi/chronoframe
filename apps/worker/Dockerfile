# syntax=docker/dockerfile:1
FROM node:22.23.3-alpine AS base
RUN --mount=type=secret,id=proxy_ca --mount=type=secret,id=ca_bundle \
    if [ -f /run/secrets/ca_bundle ]; then export SSL_CERT_FILE=/run/secrets/ca_bundle; fi; \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    apk add --no-cache ca-certificates perl exiftool && corepack enable
WORKDIR /app
FROM base AS dependencies
COPY . .
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    NODE_USE_ENV_PROXY=1 pnpm install --frozen-lockfile --prod --ignore-scripts --filter @chronoframe/worker... \
    && chown -R node:node /app
FROM base
WORKDIR /app
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=dependencies --chown=node:node /app/packages ./packages
COPY --from=dependencies --chown=node:node /app/apps/worker ./apps/worker
COPY --from=dependencies --chown=node:node /app/package.json ./package.json
ARG PROCESSOR_VERSION=development
ENV CHRONOFRAME_PROCESSOR_VERSION=$PROCESSOR_VERSION
USER node
ENV NODE_ENV=production
CMD ["node", "--experimental-strip-types", "apps/worker/src/index.ts"]
