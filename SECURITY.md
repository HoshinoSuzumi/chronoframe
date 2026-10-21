# Security Policy

[简体中文](SECURITY_zh.md)

## Supported versions

Security fixes target the latest stable release of ChronoFrame. Older releases do not receive guaranteed backports; upgrade to the latest stable release to receive fixes.

Development branches, prereleases and build-test images are intended for testing and are not supported as production releases. Reports affecting them are still welcome, especially if the same issue affects a stable release.

## Report a vulnerability

Please report suspected vulnerabilities privately through GitHub Security Advisories using [Report a vulnerability](https://github.com/HoshinoSuzumi/chronoframe/security/advisories/new).

If that option is unavailable, email **[contact@chronoframe.art](mailto:contact@chronoframe.art)** with the subject `ChronoFrame security report`.

Do not include unpatched vulnerability details, exploit code or credentials in public issues, pull requests, Discussions or Discord messages. For ordinary bugs and feature requests, use [GitHub Issues](https://github.com/HoshinoSuzumi/chronoframe/issues/new/choose).

Please include:

- The affected version or commit, image tag, deployment method and relevant configuration.
- A description of the issue, its impact and any required access or preconditions.
- Minimal reproduction steps or a proof of concept using test data.
- Relevant API requests, responses and logs with secrets and personal data removed.
- Whether the issue affects a fresh installation, an initialized instance or an upgrade.
- Any suggested mitigation or fix, and your preferred name for public credit, if desired.

Never send real passwords, session cookies, OAuth secrets, storage credentials, private photos or a production database. If reproducing the issue requires sensitive material, describe what is needed first so we can agree on a suitable way to share it. Email is not an end-to-end encrypted reporting channel.

## Handling and disclosure

Maintainers will review reports, request clarification when necessary, and coordinate fixes and disclosure with the reporter. This is a community-maintained project; response and remediation times depend on availability and severity, and no fixed service-level commitment is offered. If you receive no response, follow up in the same private channel.

Please coordinate public disclosure until a fix or practical mitigation is available. Confirmed issues may be documented in a [GitHub Security Advisory](https://github.com/HoshinoSuzumi/chronoframe/security/advisories) and release notes, including affected versions, remediation steps and reporter credit with permission.

## Scope and testing

Reports involving authentication, authorization, setup endpoints, uploads, media processing, storage access, private albums, credentials or unintended exposure of photo metadata are welcome. Dependency vulnerabilities are relevant when they can affect ChronoFrame; include the reachable code path or expected impact when possible.

Test only on instances and data you own or have explicit permission to assess. The public demo and other users' deployments are not authorized testing targets. Avoid service disruption, destructive operations and accessing other people's data. If you encounter exposed data, stop testing and report the minimum evidence needed to explain the issue privately.

## Self-hosting precautions

- Keep ChronoFrame and the host environment updated. Check release notes before upgrading and back up persistent data and external storage.
- Complete initial setup in a trusted environment before exposing the instance publicly. Use a strong administrator password and HTTPS.
- Restrict access to databases, backups, original files and the persistent session secret. Use storage credentials with only the permissions the instance needs.
- Enable `NUXT_TRUST_PROXY=true` only when the application is reachable exclusively through a trusted proxy that replaces client-supplied forwarding headers.
- Review photo visibility and metadata settings before publishing, particularly GPS locations and other personal information.

See the [deployment guide](docs/guide/getting-started.md) and [update guide](docs/guide/updates.md) for operational details.
