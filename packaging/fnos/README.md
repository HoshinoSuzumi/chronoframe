# ChronoFrame for fnOS

Run **Build fnOS FPK** in GitHub Actions and download the `fnos-arm64` or
`fnos-x86_64` artifact. Each contains a versioned FPK and its SHA-256 checksum.
Manual releases include both packages when **打包 FPK** is checked (the default).

Install the FPK in the fnOS App Center, start ChronoFrame, and open its desktop
icon to run the setup wizard. The service uses TCP port 13000. SQLite, secrets
and logs live in the application's private persistent directory. The default
photo storage uses the ChronoFrame application share. For another volume, grant
write access in the fnOS application settings, restart ChronoFrame, and select
that directory in the setup wizard or storage settings. Create a separate storage
configuration when switching directories so existing photos retain their storage
association.

To build on a native Linux x86_64 or ARM64 machine with the workspace's Node and
pnpm versions, install the frozen dependencies, run `pnpm build:deps` and
`pnpm build`, then run `bash packaging/fnos/build.sh <version> <absolute-output-directory>`.
The build checks the staged service on port 13000 before packaging.

The test workflow can produce unsigned packages for local debugging. To publish
signed release packages, configure repository secrets `FNPACK_DEVELOPER_KEY` and
`FNPACK_DEVELOPER_CERT` with the PEM contents issued for the developer account.
