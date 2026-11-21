#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

version="${1:?Release version required}"
out="${2:?Absolute output directory required}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]
[[ "$out" = /* ]]
case "$(uname -m)" in
  x86_64) arch=x86_64; platform=x86; fnpack_arch=amd64 ;;
  aarch64) arch=arm64; platform=arm; fnpack_arch=arm ;;
  *) echo 'Unsupported build architecture' >&2; exit 1 ;;
esac

# Use a fresh staging directory, with Linux permissions and symlinks intact.
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
stage="$work/chronoframe"
mkdir -p "$stage" "$out"
cp -r packaging/fnos/{app,cmd,config} "$stage/"
mkdir -p "$stage"/{wizard,app/server/bin,app/ui/images}
chmod +x "$stage"/cmd/*
cp -a apps/self-hosted/.output "$stage/app/server/"
cp -r packages/database/migrations "$stage/app/server/"
install -m 0755 "$(command -v node)" "$stage/app/server/bin/node"
cp LICENSE LICENSING.md "$stage/"
cp apps/self-hosted/public/favicon-96x96.png "$stage/ICON.PNG"
pnpm --filter @chronoframe/media exec node --input-type=module -e '
  import sharp from "sharp"
  const [input, output] = process.argv.slice(1)
  await sharp(input).resize(256, 256).png().toFile(output)
' "$PWD/apps/self-hosted/public/apple-touch-icon.png" "$stage/ICON_256.PNG"
cp "$stage/ICON.PNG" "$stage/app/ui/images/icon_64.png"
cp "$stage/ICON_256.PNG" "$stage/app/ui/images/icon_256.png"
cat > "$stage/manifest" <<EOF
appname=chronoframe
version=$version
platform=$platform
display_name=ChronoFrame
desc=Self-hosted photo management and gallery
maintainer=ChronoFrame contributors
distributor=ChronoFrame contributors
source=thirdparty
service_port=13000
checkport=true
ctl_stop=true
desktop_uidir=ui
desktop_applaunchname=chronoframe.main
disable_authorization_path=false
EOF

# Exercise the staged runtime on the same CPU architecture as the package.
mkdir -p "$work/var" "$work/share" "$work/external library"
export TRIM_PKGVAR="$work/var" TRIM_APPDEST="$stage/app"
export DATABASE_URL="$work/unexpected.sqlite3"
export TRIM_DATA_SHARE_PATHS="$work/share" TRIM_SERVICE_PORT=13000
export TRIM_DATA_ACCESSIBLE_PATHS="$work/external library:$work/unavailable"
trap '"$stage/cmd/main" stop; rm -rf -- "$work"' EXIT
"$stage/cmd/main" start
curl --fail --silent --show-error http://127.0.0.1:13000/api/wizard/fnos-directories |
  node -e '
    const assert = require("node:assert/strict")
    const { directories } = JSON.parse(require("node:fs").readFileSync(0))
    assert.deepEqual(directories, [
      process.env.TRIM_DATA_SHARE_PATHS,
      process.env.TRIM_DATA_ACCESSIBLE_PATHS.split(":")[0],
    ])
  '
"$stage/cmd/main" stop
test -s "$work/share/data/app.sqlite3"
test ! -e "$DATABASE_URL"
# Model an upgrade from a trial package that used the private runtime directory.
mv -- "$work/share/data" "$work/var/data"
"$stage/cmd/main" start
"$stage/cmd/main" stop
test -s "$work/share/data/app.sqlite3"
cmp "$work/var/data/.app-secret" "$work/share/data/.app-secret"
cmp "$work/var/data/.session-password" "$work/share/data/.session-password"
trap 'rm -rf -- "$work"' EXIT

fnpack_version=1.3.3
curl --fail --silent --show-error --location --retry 3 \
  "https://static2.fnnas.com/fnpack/fnpack-${fnpack_version}-linux-${fnpack_arch}" -o "$work/fnpack"
chmod +x "$work/fnpack"
flags=(--nosign)
if [[ -n "${FNPACK_DEVELOPER_KEY:-}" || -n "${FNPACK_DEVELOPER_CERT:-}" ]]; then
  printf '%s\n' "${FNPACK_DEVELOPER_KEY:?Missing fnpack developer key}" > "$work/developer.key"
  printf '%s\n' "${FNPACK_DEVELOPER_CERT:?Missing fnpack developer certificate}" > "$work/developer.crt"
  flags=(--key "$work/developer.key" --cert "$work/developer.crt")
elif [[ "${FNPACK_REQUIRE_SIGNATURE:-}" == true ]]; then
  echo 'Configure FNPACK_DEVELOPER_KEY and FNPACK_DEVELOPER_CERT for release packages.' >&2
  exit 1
fi
(cd "$stage" && "$work/fnpack" build "${flags[@]}")
package="ChronoFrame-v$version-fnos-$arch.fpk"
install -m 0644 "$stage/chronoframe.fpk" "$out/$package"
(cd "$out" && sha256sum "$package" > "$package.sha256")
