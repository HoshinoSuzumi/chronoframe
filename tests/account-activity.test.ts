import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import {
  recordAccountActivity,
  ACCOUNT_ACTIVITY_INTERVAL,
} from '../packages/platform/src/account-activity.ts'
import {
  deletionDeadline,
  DAY,
} from '../packages/platform/src/account-lifecycle.ts'
import type { PlatformD1 } from '../packages/platform/src/index.ts'

test('authenticated API activity is throttled, monotonic, separate from login and unavailable to unverified, suspended or deleted users', async () => {
  const sqlite = new DatabaseSync(':memory:')
  try {
    sqlite.exec(
      'CREATE TABLE platform_users(id INTEGER PRIMARY KEY,email_verified INTEGER,last_login_at INTEGER); CREATE TABLE platform_account_controls(user_id INTEGER,suspended INTEGER); CREATE TABLE platform_account_deletions(user_id INTEGER)',
    )
    sqlite.exec(
      readFileSync(
        new URL(
          '../packages/platform/migrations/0042_account_activity.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    sqlite.exec(
      'INSERT INTO platform_users VALUES(1,1,123,NULL),(2,0,123,NULL),(3,1,123,NULL),(4,1,123,NULL); INSERT INTO platform_account_controls VALUES(3,1); INSERT INTO platform_account_deletions VALUES(4)',
    )
    const db = {
      prepare(sql: string) {
        return {
          bind(...values: (number | string | null)[]) {
            return {
              async run() {
                return {
                  meta: {
                    changes: Number(sqlite.prepare(sql).run(...values).changes),
                  },
                }
              },
            }
          },
        }
      },
    } as unknown as PlatformD1
    const now = 100 * DAY
    assert.equal(await recordAccountActivity(db, 1, now), true)
    assert.equal(
      await recordAccountActivity(db, 1, now + ACCOUNT_ACTIVITY_INTERVAL - 1),
      false,
    )
    assert.equal(await recordAccountActivity(db, 1, now - DAY), false)
    assert.equal(
      await recordAccountActivity(db, 1, now + ACCOUNT_ACTIVITY_INTERVAL),
      true,
    )
    assert.equal(
      sqlite
        .prepare('SELECT last_login_at FROM platform_users WHERE id=1')
        .get()!.last_login_at,
      123,
    )
    for (const id of [2, 3, 4, 0, -1, NaN, 999])
      assert.equal(await recordAccountActivity(db, id, now), false)
    sqlite.exec('INSERT INTO platform_account_deletions VALUES(1)')
    assert.equal(await recordAccountActivity(db, 1, now + DAY), false)
    assert.equal(
      sqlite
        .prepare('SELECT last_active_at FROM platform_users WHERE id=1')
        .get()!.last_active_at,
      now + ACCOUNT_ACTIVITY_INTERVAL,
    )
  } finally {
    sqlite.close()
  }
})
test('verified-account deadlines follow the latest activity/login, retain legacy fallback, and leave unverified deadlines unchanged', () => {
  const now = 200 * DAY
  const settings = {
    enabled: true,
    inactiveDays: 90,
    unverifiedDays: 14,
    retentionDays: 15,
    warningDays: [7, 3],
    activatedAt: 1,
    revision: 1,
  }
  const old = {
    email_verified: 1,
    created_at: now - 120 * DAY,
    last_login_at: now - 100 * DAY,
  }
  assert.equal(
    deletionDeadline({ ...old, last_active_at: now }, settings),
    now + 90 * DAY,
  )
  assert.equal(
    deletionDeadline(
      { ...old, last_login_at: now, last_active_at: now - DAY },
      settings,
    ),
    now + 90 * DAY,
  )
  assert.equal(deletionDeadline(old, settings), now - 10 * DAY)
  assert.equal(
    deletionDeadline(
      { ...old, email_verified: 0, last_active_at: now },
      settings,
    ),
    now - 106 * DAY,
  )
  assert.equal(
    deletionDeadline(
      { ...old, last_active_at: now, lifecycle_grace_until: now + 100 * DAY },
      settings,
    ),
    now + 100 * DAY,
  )
})
