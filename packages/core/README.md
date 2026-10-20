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

Photo object edits and database updates retain the existing cross-system
consistency boundary; source-version fencing and durable task recovery belong
to the later jobs batch. Self-hosted account-wide quota remains unlimited while
per-file limits continue to apply.
