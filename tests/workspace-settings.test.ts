import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, readdir } from 'node:fs/promises'
import { parseWorkspaceSettingsUpdate } from '../packages/contracts/src/workspace-settings.ts'
import {
  workspaceSettings,
  updateWorkspaceSettings,
  WorkspaceSettingsError,
} from '../packages/platform/src/workspace-settings.ts'
import {
  accountSetup,
  saveAccountSetup,
} from '../packages/platform/src/onboarding.ts'
import { createD1Provisioning } from '../packages/platform/src/provisioning.ts'
import type { PlatformD1 } from '../packages/platform/src/index.ts'
import { splitSqlQuery } from './helpers/sql.ts'

const require = createRequire(import.meta.url)
const { Miniflare, convertV4MiniflareOptions } = createRequire(
  require.resolve('wrangler/package.json'),
)('miniflare')
const migration = '0049_workspace_settings.sql'
/** Create a real D1 database, optionally pausing before the workspace revision migration. */
async function fixture(upgrade = false) {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-10-26',
      script: 'export default {fetch(){return new Response("ok")}}',
      d1Databases: ['DB'],
    }),
  )
  const db = await mf.getD1Database('DB')
  const apply = async (name: string) => {
    for (const sql of splitSqlQuery(
      await readFile(
        new URL('../packages/platform/migrations/' + name, import.meta.url),
        'utf8',
      ),
    ))
      if (sql.trim()) await db.prepare(sql).run()
  }
  for (const name of (
    await readdir(new URL('../packages/platform/migrations', import.meta.url))
  )
    .filter((n) => n.endsWith('.sql'))
    .sort())
    if (!(upgrade && name === migration)) await apply(name)
  await db
    .prepare(
      "INSERT INTO platform_users(id,email,name,created_at,email_verified) VALUES(1,'owner@test.example','Owner',1,1),(2,'member@test.example','Member',1,1),(3,'other@test.example','Other',1,1),(4,'admin@test.example','Admin',1,1)",
    )
    .run()
  const store = createD1Provisioning(db)
  const own = await store.defaultWorkspace(1)
  const other = await store.defaultWorkspace(3)
  await db
    .prepare(
      "INSERT INTO platform_memberships(user_id,workspace_id,role) VALUES(2,?,'member'),(4,?,'admin')",
    )
    .bind(own.id, own.id)
    .run()
  return { db, own, other, apply, close: () => mf.dispose() }
}
const status = (code: number) => (error: unknown) =>
  error instanceof WorkspaceSettingsError && error.statusCode === code

test('Workspace settings only accept a bounded name and optimistic revision', () => {
  assert.deepEqual(
    parseWorkspaceSettingsUpdate({ name: '  工作区 Studio  ', revision: 1 }),
    { name: '工作区 Studio', revision: 1 },
  )
  for (const value of [
    null,
    [],
    {},
    { name: '', revision: 1 },
    { name: ' '.repeat(4), revision: 1 },
    { name: 'x'.repeat(81), revision: 1 },
    { name: 'bad\nname', revision: 1 },
    { name: 'Studio', revision: 0 },
    { name: 'Studio', revision: 1.5 },
    { name: 'Studio', revision: '1' },
    { name: 'Studio', revision: 1, canEdit: true },
    { name: 'Studio', revision: 1, owner_user_id: 2 },
  ])
    assert.throws(() => parseWorkspaceSettingsUpdate(value))
})

test('Workspace details remain membership scoped and only current administrators can rename', async () => {
  const f = await fixture()
  try {
    const own = await workspaceSettings(f.db, 1, f.own.id)
    assert.equal(own.canEdit, true)
    assert.equal((await workspaceSettings(f.db, 2, f.own.id)).canEdit, false)
    await assert.rejects(workspaceSettings(f.db, 3, f.own.id), status(404))
    await assert.rejects(
      updateWorkspaceSettings(f.db, 2, f.own.id, {
        name: 'No',
        revision: own.revision,
      }),
      status(403),
    )
    await assert.rejects(
      updateWorkspaceSettings(f.db, 1, f.other.id, { name: 'No', revision: 1 }),
      status(404),
    )
    const saved = await updateWorkspaceSettings(f.db, 4, f.own.id, {
      name: 'New Studio',
      revision: own.revision,
    })
    assert.equal(saved.name, 'New Studio')
    assert.equal(saved.revision, own.revision + 1)
    assert.deepEqual(Object.keys(saved).sort(), [
      'canEdit',
      'id',
      'name',
      'revision',
    ])
    assert.equal(
      (await workspaceSettings(f.db, 3, f.other.id)).name,
      f.other.name,
    )
  } finally {
    await f.close()
  }
})

test('Concurrent edits and a revoked membership cannot overwrite accepted names', async () => {
  const f = await fixture()
  try {
    const own = await workspaceSettings(f.db, 1, f.own.id)
    const results = await Promise.allSettled([
      updateWorkspaceSettings(f.db, 1, f.own.id, {
        name: 'First',
        revision: own.revision,
      }),
      updateWorkspaceSettings(f.db, 4, f.own.id, {
        name: 'Second',
        revision: own.revision,
      }),
    ])
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
    const rejected = results.find((r) => r.status === 'rejected')
    assert(rejected?.status === 'rejected' && status(409)(rejected.reason))
    const accepted = await workspaceSettings(f.db, 1, f.own.id)
    const guarded: PlatformD1 = {
      prepare: (sql) => f.db.prepare(sql),
      batch: async (statements) => {
        await f.db
          .prepare(
            'DELETE FROM platform_memberships WHERE user_id=4 AND workspace_id=?',
          )
          .bind(f.own.id)
          .run()
        return f.db.batch(statements)
      },
    }
    await assert.rejects(
      updateWorkspaceSettings(guarded, 4, f.own.id, {
        name: 'Revoked',
        revision: accepted.revision,
      }),
      status(404),
    )
    assert.equal(
      (await workspaceSettings(f.db, 1, f.own.id)).name,
      accepted.name,
    )
    await f.db
      .prepare(
        'INSERT INTO platform_account_controls(user_id,suspended) VALUES(1,1)',
      )
      .run()
    await assert.rejects(workspaceSettings(f.db, 2, f.own.id), status(404))
  } finally {
    await f.close()
  }
})

test('An upgrade preserves names and legacy name writers invalidate stale settings', async () => {
  const f = await fixture(true)
  try {
    await f.apply(migration)
    const before = await workspaceSettings(f.db, 1, f.own.id)
    assert.equal(before.name, f.own.name)
    assert.equal(before.revision, 1)
    let setup = await accountSetup(f.db, 1)
    setup = await saveAccountSetup(f.db, 1, {
      step: 1,
      revision: setup.revision,
      name: 'Owner',
    })
    setup = await saveAccountSetup(f.db, 1, {
      step: 2,
      revision: setup.revision,
      name: 'Default workspace',
      workspaceCustomized: false,
    })
    assert.equal(setup.workspace?.customized, false)
    await assert.rejects(
      updateWorkspaceSettings(f.db, 1, f.own.id, {
        name: 'Stale',
        revision: before.revision,
      }),
      status(409),
    )
    const current = await workspaceSettings(f.db, 1, f.own.id)
    await updateWorkspaceSettings(f.db, 1, f.own.id, {
      name: 'My Studio',
      revision: current.revision,
    })
    const after = await accountSetup(f.db, 1)
    assert.equal(after.workspace?.name, 'My Studio')
    assert.equal(after.workspace?.customized, true)
    assert.equal(after.revision, setup.revision + 1)
    await assert.rejects(
      saveAccountSetup(f.db, 1, {
        step: 2,
        revision: setup.revision,
        name: 'Old default',
        workspaceCustomized: false,
      }),
      (error: unknown) =>
        !!error &&
        typeof error === 'object' &&
        'statusCode' in error &&
        error.statusCode === 409,
    )
  } finally {
    await f.close()
  }
})
