FROM node:22.23.3-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /usr/src/app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY scripts/self-hosted.mjs ./scripts/
COPY apps/self-hosted/package.json ./apps/self-hosted/
COPY packages/console/package.json ./packages/console/
COPY packages/gallery/package.json ./packages/gallery/
COPY packages/webgl-image/package.json ./packages/webgl-image/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/core/package.json ./packages/core/
COPY packages/database/package.json ./packages/database/
COPY packages/jobs/package.json ./packages/jobs/
COPY packages/processing/package.json ./packages/processing/
COPY packages/storage/package.json ./packages/storage/
COPY packages/media/package.json ./packages/media/
COPY packages/geocoding/package.json ./packages/geocoding/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /usr/src/app
COPY . .
RUN pnpm run prepare \
    && NODE_OPTIONS="--max-old-space-size=4096" pnpm run build:deps \
    && pnpm run build \
    && find ./apps/self-hosted/.output -type f -name '*.map' -delete

FROM node:22.23.3-alpine AS runtime_deps
RUN apk add --no-cache ca-certificates perl exiftool \
	&& install -Dm755 "$(readlink -f /usr/bin/perl)" /opt/runtime-bin/perl \
	&& install -Dm755 "$(readlink -f /usr/bin/env)" /opt/runtime-bin/env \
	&& install -Dm755 "$(readlink -f /usr/bin/exiftool)" /opt/runtime-bin/exiftool \
	&& mkdir -p /opt/runtime-tmp \
	&& chmod 1777 /opt/runtime-tmp

FROM scratch AS runtime
WORKDIR /app

COPY --from=runtime_deps /usr/local/bin/node /usr/bin/node
COPY --from=runtime_deps /opt/runtime-bin/perl /usr/bin/perl
COPY --from=runtime_deps /opt/runtime-bin/env /usr/bin/env
COPY --from=runtime_deps /opt/runtime-bin/exiftool /usr/bin/exiftool
COPY --from=runtime_deps /usr/lib /usr/lib
COPY --from=runtime_deps /usr/share /usr/share
COPY --from=runtime_deps /lib /lib
COPY --from=runtime_deps /etc/ssl /etc/ssl
# scratch has no temporary directory; uploads and image processing need one.
COPY --from=runtime_deps --chmod=1777 /opt/runtime-tmp /tmp

COPY --from=build /usr/src/app/apps/self-hosted/.output ./.output
COPY --from=build /usr/src/app/packages/database/migrations ./server/database/migrations
COPY --from=build /usr/src/app/LICENSE /usr/src/app/LICENSING.md ./

EXPOSE 3000
VOLUME ["/app/data"]

ENV NODE_ENV=production
ENV NITRO_PORT=3000
ENV NITRO_HOST=0.0.0.0
ENV DATABASE_URL=./data/app.sqlite3
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
ENV EXIFTOOL_PATH=/usr/bin/exiftool

CMD ["/usr/bin/node", ".output/server/index.mjs"]
