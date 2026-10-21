# Jobs

Embedded workers use explicit job/Site/resource/source/pipeline/attempt identities. A database adapter owns short claims, lease renewal, retries and compare-and-swap completion. `runOneJob` retains its processing slot until native work settles, even when heartbeat loss aborts the cooperative signal.

Claims count attempts, including crashes. The SQLite adapter recovers only expired leases during polling; startup never resets another live worker. Every result, stage, heartbeat and failure is checked against its attempt. Unsupported pipeline versions remain failed until a compatible worker or deliberate migration handles them.

Publication callbacks run synchronously inside the same transaction as completion. They must contain no object I/O. Source tombstones survive resource deletion. Managed source replacement invalidates the earlier generation before bytes are published, while the first input digest remains attached to retries. Duplicate callbacks cannot reapply domain writes.

Payloads are validated operational references. Storage configuration and credentials remain outside payloads, resolved from an immutable connection revision. Upload transport/session persistence is a separate boundary from job durability.
