# @chronoframe/storage

Instance-scoped storage providers for Self-hosted and future cloud entry points.

Import from `@chronoframe/storage` or its declared provider/interface subpaths.
Construct `StorageManager` with explicit configuration and an optional structural
logger. The application owns global instances, configuration reloads and Nitro
lifecycle. Local, S3 and OpenList retain their existing behavior and capabilities.
Configuration and errors may contain sensitive information: only trusted server
code should instantiate providers or access configuration. Upload lifecycle logs
keep the existing sanitized metadata policy.

Run `pnpm check:packages` and `pnpm test` from the workspace root.
