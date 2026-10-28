import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import Database from 'better-sqlite3'

test('Local account seeding synchronizes regenerated credentials without replacing the account', () => {
  const source = readFileSync('scripts/setup-cloud-local.mjs', 'utf8')
  const sql = source.match(/`(INSERT INTO platform_accounts[^`]+)`/)?.[1]
  assert.ok(sql)
  const db = new Database(':memory:')
  try {
    db.exec(`
      CREATE TABLE platform_users(id INTEGER PRIMARY KEY, email TEXT UNIQUE);
      CREATE TABLE platform_accounts(
        id INTEGER PRIMARY KEY, account_id TEXT, provider_id TEXT,
        user_id INTEGER, password TEXT, created_at INTEGER, updated_at INTEGER,
        UNIQUE(provider_id, account_id)
      );
      INSERT INTO platform_users VALUES(1, 'developer@localhost.test');
    `)
    const seed = db.prepare(sql)
    seed.run('original-hash', 10, 10, 'developer@localhost.test')
    seed.run('regenerated-hash', 20, 20, 'developer@localhost.test')
    assert.deepEqual(db.prepare('SELECT * FROM platform_accounts').all(), [
      {
        id: 1,
        account_id: '1',
        provider_id: 'credential',
        user_id: 1,
        password: 'regenerated-hash',
        created_at: 10,
        updated_at: 20,
      },
    ])
  } finally {
    db.close()
  }
})
