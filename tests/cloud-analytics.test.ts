import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import {
  cloudAnalyticsSettings,
  parseMeasurementId,
  saveCloudAnalytics,
} from '../packages/platform/src/cloud-analytics.ts'
import type { PlatformD1 } from '../packages/platform/src/index.ts'

test('GA4 accepts only Measurement IDs or empty values, never scripts', () => {
  assert.equal(parseMeasurementId(' G-ABC1234567 '), 'G-ABC1234567')
  assert.equal(parseMeasurementId(''), '')
  for (const input of [
    null,
    42,
    {},
    '<script>alert(1)</script>',
    'UA-1234',
    'G-ABC<script>',
    'G-A',
  ])
    assert.throws(() => parseMeasurementId(input))
})

test('GA4 settings default off, persist changes atomically with audit, reject stale writes and support disabling', async () => {
  const sqlite = new DatabaseSync(':memory:')
  try {
    sqlite.exec(
      readFileSync(
        new URL(
          '../packages/platform/migrations/0041_cloud_analytics.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    sqlite.exec(
      'CREATE TABLE platform_admin_audit(id TEXT PRIMARY KEY,actor_id INTEGER,action TEXT,target TEXT,reason TEXT,before_json TEXT,after_json TEXT,created_at INTEGER)',
    )
    class Statement {
      values: (string | number | null)[] = []
      sql: string
      constructor(sql: string) {
        this.sql = sql
      }
      bind(...values: (string | number | null)[]) {
        this.values = values
        return this
      }
      async first() {
        return sqlite.prepare(this.sql).get(...this.values) ?? null
      }
      async run() {
        return {
          meta: {
            changes: Number(
              sqlite.prepare(this.sql).run(...this.values).changes,
            ),
          },
        }
      }
    }
    const db = {
      prepare: (sql: string) => new Statement(sql),
      async batch(statements: Statement[]) {
        sqlite.exec('BEGIN')
        try {
          const results = []
          for (const s of statements) results.push(await s.run())
          sqlite.exec('COMMIT')
          return results
        } catch (error) {
          sqlite.exec('ROLLBACK')
          throw error
        }
      },
    } as unknown as PlatformD1
    assert.deepEqual(await cloudAnalyticsSettings(db), {
      measurementId: '',
      revision: 0,
    })
    assert.deepEqual(
      await saveCloudAnalytics(db, 7, {
        measurementId: 'G-ABC1234567',
        revision: 0,
      }),
      { measurementId: 'G-ABC1234567', revision: 1 },
    )
    await assert.rejects(
      saveCloudAnalytics(db, 7, { measurementId: 'G-OTHER12345', revision: 0 }),
      /analytics_configuration_changed/,
    )
    await assert.rejects(
      saveCloudAnalytics(db, 7, { measurementId: '<script>', revision: 1 }),
      /invalid_measurement_id/,
    )
    assert.equal(
      sqlite.prepare('SELECT COUNT(*) AS n FROM platform_admin_audit').get()!.n,
      1,
    )
    assert.deepEqual(
      await saveCloudAnalytics(db, 7, { measurementId: '', revision: 1 }),
      { measurementId: '', revision: 2 },
    )
    const audit = sqlite
      .prepare('SELECT * FROM platform_admin_audit ORDER BY rowid DESC LIMIT 1')
      .get()!
    assert.equal(audit.actor_id, 7)
    assert.equal(
      JSON.parse(String(audit.before_json)).measurementId,
      'G-ABC1234567',
    )
    assert.equal(JSON.parse(String(audit.after_json)).measurementId, '')
  } finally {
    sqlite.close()
  }
})
