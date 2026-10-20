# Database

SQLite schema, migration history, DTO projection and repository implementations for the self-hosted application. The application supplies the database filename, migration directory, logging and close hook. `openDatabase` owns no global singleton and supports consistent online backups.

Core repository methods return promises so callers await persistence; SQLite executes each transaction synchronously and never holds it across asynchronous object I/O. A future PostgreSQL adapter must implement the same atomic repository operations, rather than exposing driver transactions to core. `persistenceErrorCode` maps constraint and contention failures without returning raw SQL messages to clients.

Migrations are canonical here. `server/database/migrations` remains a compatibility symlink for existing commands; production images copy these files to the historical runtime path. Do not edit released migrations. Back up the database and its committed WAL with the SQLite backup API before upgrading. Restore a backup using the matching application version when a migration changes constraints.
