# Database

SQLite schema, migration history, DTO projection and repository implementations for the self-hosted application. The application supplies the database filename, migration directory, logging and close hook. `openDatabase` owns no global singleton and supports consistent online backups.

Core repository methods return promises so callers await persistence; SQLite executes each transaction synchronously and never holds it across asynchronous object I/O. A future PostgreSQL adapter must implement the same atomic repository operations, rather than exposing driver transactions to core. `persistenceErrorCode` maps constraint and contention failures without returning raw SQL messages to clients.

Migrations are canonical here. `server/database/migrations` remains a compatibility symlink for existing commands; production images copy these files to the historical runtime path. Do not edit released migrations. Back up the database and its committed WAL with the SQLite backup API before upgrading. Restore a backup using the matching application version when a migration changes constraints.

The default self-hosted Site is fixed by its entry, while every site repository requires an explicit existing Site. Migration creates default Workspace/Site memberships and enforces immutable ownership and same-site relationships. Settings uniqueness and caches include Site. Historical storage connection configurations are retained as immutable revisions for existing object references.

Current album slugs are exclusive per Site. A historical slug can be claimed by the same or another album, and deleting an album releases all its slugs. Automatic slug generation adds a suffix when a current slug conflicts; custom reuse of a current slug returns a conflict.

`pnpm db:migrate` and application startup use the same journal-compatible runner. Existing files with pending migrations receive a consistent `*.pre-migration-*.sqlite3` backup before changes. Schema and journal updates share a transaction, foreign keys are checked before commit, and enforcement is restored afterwards. Keep backups with their matching application versions; restoring only an older binary does not reverse schema constraints.

Jobs use source generations, retained deletion tombstones, leases, attempt tokens and input digests. Resource mutation and follow-up task creation share one transaction. Publication guards live only inside the publication transaction and roll back with it; workers never hold database transactions during native processing or storage I/O.

Upload reservations advance the resource generation before transport plans are issued. Their incoming storage reference may differ from the source still published in the photo row, even after a plan is cancelled. Maintenance snapshots therefore read the published photo reference while retaining the current resource generation as their compare-and-swap token. A later reservation, mutation, or publication invalidates that token; cancellation never rolls the generation back or revives older workers.
