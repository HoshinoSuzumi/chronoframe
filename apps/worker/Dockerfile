# syntax=docker/dockerfile:1
FROM node:22.23.3-alpine
RUN --mount=type=secret,id=proxy_ca --mount=type=secret,id=ca_bundle \
    if [ -f /run/secrets/ca_bundle ]; then export SSL_CERT_FILE=/run/secrets/ca_bundle; fi; \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    apk add --no-cache ca-certificates perl exiftool && corepack enable
WORKDIR /app
COPY . .
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    NODE_USE_ENV_PROXY=1 pnpm install --frozen-lockfile --prod --ignore-scripts --filter @chronoframe/worker... \
    && chown -R node:node /app
USER node
ENV NODE_ENV=production
CMD ["node", "--experimental-strip-types", "apps/worker/src/index.ts"]
