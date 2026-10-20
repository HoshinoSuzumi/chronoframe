# @chronoframe/geocoding

Framework-independent geocoding providers and normalization.

`createGeocodingServices` receives language lookup, HTTP transport, shared rate
limiter, retry implementation/policy and logger. It never reads application
settings. Create one limiter per process and reuse it across provider instances;
it does not coordinate limits across processes. Distributed quotas belong to the
later worker/queue stages. The application selects credentials and providers.

Run `pnpm check:packages` and `pnpm test` from the workspace root.
