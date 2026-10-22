#!/usr/bin/env node
// Historical command uses the same backup-aware runner as application startup.
try {
  await import('./migrate-database.ts')
} catch (error) {
  console.error('Migration failed:', error)
  process.exitCode = 1
}
