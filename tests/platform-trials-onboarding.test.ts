import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, readdir } from 'node:fs/promises'
import { splitSqlQuery } from './helpers/sql.ts'
import {
  accountSetup,
  saveAccountSetup,
} from '../packages/platform/src/onboarding.ts'
import {
  workspaceTrial,
  claimWorkspaceTrial,
} from '../packages/platform/src/trials.ts'
import { workspaceEntitlements } from '../packages/platform/src/entitlements.ts'
import { reconcileSubscriptions } from '../packages/platform/src/subscriptions.ts'
import { deliverTrialMail } from '../packages/platform/src/trial-mail.ts'
import { createD1Provisioning } from '../packages/platform/src/provisioning.ts'
const require = createRequire(import.meta.url)
const { Miniflare, convertV4MiniflareOptions } = createRequire(
  require.resolve('wrangler/package.json'),
)('miniflare')
const DAY = 86400000
async function fixture(legacy = false) {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-10-26',
      script: 'export default {fetch(){return new Response("ok")}}',
      d1Databases: ['DB'],
    }),
  )
  const db = await mf.getD1Database('DB')
  for (const name of (
    await readdir(new URL('../packages/platform/migrations', import.meta.url))
  )
    .filter((n) => n.endsWith('.sql') && (!legacy || !n.startsWith('0046_')))
    .sort())
    for (const sql of splitSqlQuery(
      (
        await readFile(
          new URL('../packages/platform/migrations/' + name, import.meta.url),
          'utf8',
        )
      ).replace(/^--.*$/gm, ''),
    ))
      if (sql.trim()) await db.prepare(sql).run()
  await db
    .prepare(
      "INSERT INTO platform_users(id,email,name,created_at,email_verified) VALUES(1,'alice@example.test','alice@example.test',1,1),(2,'member@example.test','Member',1,1),(3,'social@example.test','Social Nick',1,1)",
    )
    .run()
  if (legacy)
    for (const sql of splitSqlQuery(
      (
        await readFile(
          new URL(
            '../packages/platform/migrations/0046_trials_onboarding.sql',
            import.meta.url,
          ),
          'utf8',
        )
      ).replace(/^--.*$/gm, ''),
    ))
      if (sql.trim()) await db.prepare(sql).run()
  await db
    .prepare(
      "INSERT INTO platform_accounts(id,account_id,provider_id,user_id,created_at,updated_at) VALUES(3,'provider-user','github',3,1,1)",
    )
    .run()
  const provisioning = createD1Provisioning(db)
  const workspace = await provisioning.defaultWorkspace(1)
  await db
    .prepare(
      "INSERT INTO platform_memberships(user_id,workspace_id,role) VALUES(2,?,'member')",
    )
    .bind(workspace.id)
    .run()
  await db
    .prepare(
      "INSERT INTO platform_plans(id,name,policy_json,active,monthly_price) SELECT 'creator','Creator',policy_json,1,1000 FROM platform_plans WHERE id='free'",
    )
    .run()
  await db
    .prepare(
      "UPDATE platform_trial_settings SET enabled=1,plan_id='creator',days=14 WHERE id=1",
    )
    .run()
  return { db, mf, workspace }
}
test('Onboarding uses provider name or email local part, persists steps, preserves a custom workspace and creates one site across retries', async () => {
  const { db, mf, workspace } = await fixture()
  try {
    let state = await accountSetup(db, 1)
    assert.equal(state.required, true)
    assert.equal(state.name, 'alice')
    assert.equal(state.step, 1)
    assert.equal((await accountSetup(db, 3)).name, 'Social Nick')
    await assert.rejects(
      saveAccountSetup(db, 1, {
        step: 3,
        revision: state.revision,
        name: 'Gallery',
        slug: 'alice-gallery',
      }),
      { statusCode: 409 },
    )
    await assert.rejects(
      saveAccountSetup(db, 1, {
        step: 1,
        revision: state.revision,
        name: '\n',
      }),
      { statusCode: 400 },
    )
    state = await saveAccountSetup(db, 1, {
      step: 1,
      revision: state.revision,
      name: 'Alice',
    })
    assert.equal(state.step, 2)
    assert.equal(state.name, 'Alice')
    state = await saveAccountSetup(db, 1, {
      step: 2,
      revision: state.revision,
      name: 'Custom space',
    })
    assert.equal(state.workspace?.id, workspace.id)
    assert.equal(state.workspace?.name, 'Custom space')
    const request = {
      step: 3,
      revision: state.revision,
      name: 'Alice gallery',
      slug: 'alice-gallery',
    }
    const results = await Promise.allSettled([
      saveAccountSetup(db, 1, request),
      saveAccountSetup(db, 1, request),
    ])
    assert.ok(results.some((r) => r.status === 'fulfilled'))
    state = await accountSetup(db, 1)
    assert.equal(state.required, false)
    assert.equal(state.site?.slug, 'alice-gallery')
    assert.equal(
      (
        await db
          .prepare(
            'SELECT COUNT(*) AS n FROM platform_sites WHERE workspace_id=?',
          )
          .bind(workspace.id)
          .first()
      ).n,
      1,
    )
    assert.equal((await saveAccountSetup(db, 1, request)).required, false)
    const other = await accountSetup(db, 3)
    await saveAccountSetup(db, 3, {
      step: 1,
      revision: other.revision,
      name: 'Social Nick',
    })
    let resumed = await accountSetup(db, 3)
    resumed = await saveAccountSetup(db, 3, {
      step: 2,
      revision: resumed.revision,
      name: 'Social space',
    })
    resumed = await saveAccountSetup(db, 3, {
      step: 3,
      revision: resumed.revision,
      skip: true,
    })
    assert.equal(resumed.required, false)
    assert.equal(resumed.site, null)
  } finally {
    await mf.dispose()
  }
})
test('Trials are explicit, owner-only, once per account, revision-fenced, and leave later paid assignments intact', async () => {
  const { db, mf, workspace } = await fixture()
  const now = Date.now()
  try {
    assert.equal((await workspaceTrial(db, 1, workspace.id, now)).trial, null)
    const blocked = await workspaceTrial(db, 2, workspace.id, now)
    assert.equal(blocked.reason, 'not_owner')
    await assert.rejects(
      claimWorkspaceTrial(db, 2, workspace.id, blocked.offer!.revision, now),
      { statusCode: 409 },
    )
    const offer = await workspaceTrial(db, 1, workspace.id, now)
    assert.equal(offer.eligible, true)
    assert.equal(offer.offer?.planName, 'Creator')
    await assert.rejects(claimWorkspaceTrial(db, 1, workspace.id, '0:0', now), {
      statusCode: 409,
    })
    const claimed = await Promise.all([
      claimWorkspaceTrial(db, 1, workspace.id, offer.offer!.revision, now),
      claimWorkspaceTrial(db, 1, workspace.id, offer.offer!.revision, now + 1),
    ])
    assert.equal(claimed[0].trial?.expiresAt, claimed[1].trial?.expiresAt)
    assert.equal(
      (await db.prepare('SELECT COUNT(*) AS n FROM platform_trials').first()).n,
      1,
    )
    assert.equal(
      (await workspaceEntitlements(db, workspace.id, 'platform', now)).id,
      'creator',
    )
    const end = claimed[0].trial!.expiresAt
    assert.equal(
      (await workspaceEntitlements(db, workspace.id, 'platform', end)).id,
      'free',
    )
    await db
      .prepare(
        "UPDATE platform_workspace_plans SET source='payment',expires_at=?,revision=revision+1 WHERE workspace_id=?",
      )
      .bind(now + 60 * DAY, workspace.id)
      .run()
    const paid = await workspaceTrial(db, 1, workspace.id, now + 100)
    assert.equal(paid.trial?.state, 'converted')
    await reconcileSubscriptions(db, end + 1)
    assert.equal(
      (await workspaceEntitlements(db, workspace.id, 'platform', end + 1)).id,
      'creator',
    )
    assert.equal(
      (
        await claimWorkspaceTrial(
          db,
          1,
          workspace.id,
          offer.offer!.revision,
          end + 1,
        )
      ).trial?.state,
      'converted',
    )
  } finally {
    await mf.dispose()
  }
})
test('Trial reminders deduplicate, suppress stale/converted notices and do not become registration grants', async () => {
  const { db, mf, workspace } = await fixture()
  const now = Date.now()
  const sent: string[] = []
  try {
    const offer = await workspaceTrial(db, 1, workspace.id, now)
    const claim = await claimWorkspaceTrial(
      db,
      1,
      workspace.id,
      offer.offer!.revision,
      now,
    )
    const mail = {
      async send(message: { to: string }) {
        sent.push(message.to)
        return { messageId: 'mail-' + sent.length }
      },
    }
    const end = claim.trial!.expiresAt
    await deliverTrialMail(db, mail, 'https://app.example.test', end - 2 * DAY)
    await deliverTrialMail(db, mail, 'https://app.example.test', end - 2 * DAY)
    assert.equal(sent.length, 1)
    await deliverTrialMail(db, mail, 'https://app.example.test', end - DAY / 2)
    assert.equal(sent.length, 2)
    await db
      .prepare(
        "UPDATE platform_workspace_plans SET source='payment' WHERE workspace_id=?",
      )
      .bind(workspace.id)
      .run()
    await deliverTrialMail(db, mail, 'https://app.example.test', end + 1)
    assert.equal(sent.length, 2)
  } finally {
    await mf.dispose()
  }
})

test('Upgrade preserves existing accounts and only prompts newly registered accounts', async () => {
  const { db, mf } = await fixture(true)
  try {
    assert.equal((await accountSetup(db, 1)).required, false)
    await db
      .prepare(
        "INSERT INTO platform_users(id,email,name,created_at,email_verified) VALUES(4,'new@example.test','new@example.test',1,1)",
      )
      .run()
    assert.equal((await accountSetup(db, 4)).required, true)
  } finally {
    await mf.dispose()
  }
})

test('Trial offers enforce availability, verification, plan revision and existing gift entitlements', async () => {
  const { db, mf, workspace } = await fixture()
  try {
    const now = Date.now()
    const initial = await workspaceTrial(db, 1, workspace.id, now)
    await db
      .prepare('UPDATE platform_plans SET revision=revision+1 WHERE id=?')
      .bind('creator')
      .run()
    await assert.rejects(
      claimWorkspaceTrial(db, 1, workspace.id, initial.offer!.revision, now),
    )
    assert.equal(
      (await db.prepare('SELECT COUNT(*) AS n FROM platform_trials').first()).n,
      0,
    )
    await db
      .prepare('UPDATE platform_users SET email_verified=0 WHERE id=1')
      .run()
    assert.equal(
      (await workspaceTrial(db, 1, workspace.id, now)).reason,
      'unverified',
    )
    await db
      .prepare('UPDATE platform_users SET email_verified=1 WHERE id=1')
      .run()
    await db
      .prepare('UPDATE platform_trial_settings SET starts_at=? WHERE id=1')
      .bind(now + DAY)
      .run()
    assert.equal(
      (await workspaceTrial(db, 1, workspace.id, now)).reason,
      'not_started',
    )
    await db
      .prepare(
        'UPDATE platform_trial_settings SET starts_at=NULL,ends_at=? WHERE id=1',
      )
      .bind(now)
      .run()
    assert.equal(
      (await workspaceTrial(db, 1, workspace.id, now)).reason,
      'ended',
    )
    await db
      .prepare('UPDATE platform_trial_settings SET ends_at=NULL WHERE id=1')
      .run()
    await db
      .prepare(
        "UPDATE platform_workspace_plans SET source='promotion',expires_at=?,revision=revision+1 WHERE workspace_id=?",
      )
      .bind(now + DAY, workspace.id)
      .run()
    assert.equal(
      (await workspaceTrial(db, 1, workspace.id, now)).reason,
      'existing_entitlement',
    )
    const expired = await workspaceTrial(db, 1, workspace.id, now + 2 * DAY)
    assert.equal(expired.eligible, true)
    await claimWorkspaceTrial(
      db,
      1,
      workspace.id,
      expired.offer!.revision,
      now + 2 * DAY,
    )
    assert.equal(
      (await workspaceTrial(db, 1, workspace.id, now + 2 * DAY)).trial?.state,
      'active',
    )
  } finally {
    await mf.dispose()
  }
})
