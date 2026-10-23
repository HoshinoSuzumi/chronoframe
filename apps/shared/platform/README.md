# Shared platform adapters

Worker-compatible application adapters used by Cloud and Site. This directory is
not a Nuxt application or a workspace package; consumers import modules explicitly.

- `runtime.ts`: request origin, D1 binding, platform sessions and HTTP errors.
- `context.ts`: authorized portal and public Site contexts and DTOs.
- `crypto.ts`: email/session MAC and visitor password verification.
- `email.ts`: Cloudflare Email Sending binding adapter.
- `visitor.ts`: host-only visitor cookies, password policies and attempt limits.

Business rules remain in `packages/core`; D1 repositories remain in
`packages/platform`. Self-hosted does not import these adapters. Keep this directory
free of native media tools, filesystem storage and other Node-only runtime code.
