import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, writeFile, cp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { openDatabase } from '@chronoframe/database'

/** Exercise actual pre-Site files, including WAL backup and failure rollback. */
test('legacy ownership upgrade preserves rows, assigns memberships, backs up and rolls back failed migrations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chronoframe-site-upgrade-'))
  const migrations = join(root, 'migrations'),
    filename = join(root, 'legacy.sqlite3')
  await cp('packages/database/migrations', migrations, { recursive: true })
  const journal = JSON.parse(
    await readFile(join(migrations, 'meta/_journal.json'), 'utf8'),
  )
  const legacy = {
    ...journal,
    entries: journal.entries.filter((e: { idx: number }) => e.idx < 18),
  }
  await writeFile(
    join(migrations, 'meta/_journal.json'),
    JSON.stringify(legacy),
  )
  let old = openDatabase({ filename, migrationsFolder: migrations })
  old.close()
  let raw = new Database(filename)
  raw
    .prepare(
      "INSERT INTO users(name,email,created_at,is_admin) VALUES('admin','admin@example.test',1700000000,1),('member','member@example.test',1700000001,0)",
    )
    .run()
  raw
    .prepare(
      "INSERT INTO photos(id,title,storage_key) VALUES('legacy','Original','original.jpg')",
    )
    .run()
  raw.prepare("INSERT INTO albums(title) VALUES('Legacy Album')").run()
  raw
    .prepare(
      "INSERT INTO album_photos(album_id,photo_id,position) VALUES(1,'legacy',42)",
    )
    .run()
  raw.close()
  assert.throws(
    () => openDatabase({ filename, migrationsFolder: migrations }),
    /album_slugs.*missing/i,
  )
  // Migration and its journal record must roll back together; the backup remains usable.
  const failure = {
    ...journal,
    entries: [
      ...legacy.entries,
      {
        idx: 18,
        version: '6',
        when: journal.entries.at(-1).when,
        tag: 'failure',
        breakpoints: true,
      },
    ],
  }
  await writeFile(
    join(migrations, 'failure.sql'),
    'CREATE TABLE should_rollback(id INTEGER);\n--> statement-breakpoint\nSELECT * FROM deliberately_missing_table;',
  )
  await writeFile(
    join(migrations, 'meta/_journal.json'),
    JSON.stringify(failure),
  )
  assert.throws(() => openDatabase({ filename, migrationsFolder: migrations }))
  raw = new Database(filename)
  assert.equal(
    raw
      .prepare("SELECT name FROM sqlite_master WHERE name='should_rollback'")
      .get(),
    undefined,
  )
  assert.equal(
    raw.prepare('SELECT count(*) n FROM __drizzle_migrations').get().n,
    18,
  )
  assert.equal(
    raw.prepare("SELECT title FROM photos WHERE id='legacy'").get().title,
    'Original',
  )
  raw.close()
  const backups = (await readdir(root)).filter((n) =>
    n.includes('.pre-migration-'),
  )
  assert.equal(backups.length, 1)
  const backup = new Database(join(root, backups[0]!))
  assert.equal(backup.prepare('SELECT count(*) n FROM photos').get().n, 1)
  backup.close()
  const upgraded = openDatabase({
    filename,
    migrationsFolder: 'packages/database/migrations',
  })
  upgraded.close()
  raw = new Database(filename)
  assert.deepEqual(
    raw.prepare('SELECT id,title,storage_key,site_id FROM photos').all(),
    [
      {
        id: 'legacy',
        title: 'Original',
        storage_key: 'original.jpg',
        site_id: 1,
      },
    ],
  )
  assert.equal(
    raw.prepare('SELECT position FROM album_photos').get().position,
    42,
  )
  assert.equal(
    raw
      .prepare(
        'SELECT slug FROM album_slugs WHERE album_id = 1 AND is_current = 1',
      )
      .get().slug,
    'legacy-album',
  )
  assert.deepEqual(
    raw.prepare('SELECT user_id,role FROM memberships ORDER BY user_id').all(),
    [
      { user_id: 1, role: 'admin' },
      { user_id: 2, role: 'member' },
    ],
  )
  assert.deepEqual(raw.pragma('foreign_key_check'), [])
  const count = raw
    .prepare('SELECT count(*) n FROM __drizzle_migrations')
    .get().n
  raw.close()
  const restarted = openDatabase({
    filename,
    migrationsFolder: 'packages/database/migrations',
  })
  restarted.close()
  raw = new Database(filename)
  assert.equal(
    raw.prepare('SELECT count(*) n FROM __drizzle_migrations').get().n,
    count,
  )
  raw.close()
  await rm(root, { recursive: true, force: true })
})
