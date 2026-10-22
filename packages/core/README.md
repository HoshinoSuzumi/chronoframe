# @chronoframe/core

Transport-independent photo and album read use cases. The package depends only
on contracts; it has no Nuxt globals, database connections, filesystem or session
implementation. Repository methods are asynchronous and preserve query ordering.

The application injects a repository and trusted request access context. Hidden
album membership excludes photos from anonymous reads; public album listings do
not expose protected membership. Authorized protected album details replace raw
storage references with access-controlled media URLs. Password hashes remain in
internal access records and never appear in response resources.

The first P2 batch introduced reads; the second adds the primary write and
settings use cases described below. Site scoping, database package migration,
and durable job lifecycle remain in later batches. Do not use this interface
for multi-site data until a required Site context is introduced.

The second P2 batch adds album and photo mutations, settings validation and
connection resolution, upload preparation and completion, and protected-access
policy. Application adapters supply the clock, identifier generation, quota,
password hashing, object I/O, native EXIF editing, and task dispatch. SQLite
adapters keep multi-row album changes transactional. HTTP validation, translated
messages, signed cookies, upload transport, and runtime effects remain in Nuxt.

Self-hosted account-wide quota remains unlimited while per-file limits continue
to apply.

Photo metadata edits stage a unique source object before publication. The database
checks the captured source version and atomically updates the photo reference,
resource generation, and any follow-up task. Failed or stale publications discard
only their own staged object; they never restore bytes over a newer edit. Prior
source objects remain available rather than being deleted during publication.

## Platform request boundaries

`createPlatformAccess` accepts an asynchronous `PlatformDirectory`; it does not
open SQLite, infer `DEFAULT_SITE`, or accept client headers as identity. A session
adapter must verify the platform cookie and expiry before passing its internal
user ID. Membership is loaded for every authorization decision. Existing `admin`
roles can mutate/manage a Site; `member` is read-only in this platform policy.
Self-hosted authorization is unchanged.

Public resolution accepts only a canonical DNS hostname from the direct request
URL. The directory must return ownership-verified, active domain mappings and
published Sites; forwarded host and caller-supplied Site IDs are not trusted.
`platformCacheKey`/`platformStateKey` separate Site, audience, user/role, and Host.
Only anonymous unprotected data may enter a public cache. Visitor-protected
responses remain private/no-store, and verified grants must match Site, album,
password revision, and expiry through `hasSiteVisitorGrant`.

These interfaces establish the application boundary. They do not implement a
persistent platform identity directory, email delivery, or signed session/grant
cookies. Until adapters are connected, the cloud/site data routes stay unavailable.
