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
    .filter((n) => n.endsWith('.sql') && (!legacy || n < '0046_'))
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
  if (legacy) {
    const apply = async (name: string) => {
      for (const sql of splitSqlQuery(
        (
          await readFile(
            new URL('../packages/platform/migrations/' + name, import.meta.url),
            'utf8',
          )
        ).replace(/^--.*$/gm, ''),
      ))
        if (sql.trim()) await db.prepare(sql).run()
    }
    await apply('0046_trials_onboarding.sql')
    // This pending account already confirmed a workspace before the new FK exists.
    await db
      .prepare(
        "INSERT INTO platform_users(id,email,name,created_at,email_verified) VALUES(99,'upgrade@example.test','Upgrade',1,1),(98,'upgrade-zh@example.test','阿明',1,1),(97,'upgrade-custom@example.test','Custom',1,1)",
      )
      .run()
    for (const id of [97, 98, 99])
      await createD1Provisioning(db).defaultWorkspace(id)
    await db
      .prepare(
        'UPDATE platform_account_onboarding SET profile_completed_at=1,workspace_completed_at=1 WHERE user_id IN(97,98,99)',
      )
      .run()
    await apply('0047_onboarding_workspace.sql')
    await db
      .prepare('UPDATE platform_workspaces SET name=? WHERE owner_user_id=99')
      .bind("Upgrade's workspace")
      .run()
    await db
      .prepare('UPDATE platform_workspaces SET name=? WHERE owner_user_id=98')
      .bind('阿明的工作空间')
      .run()
    await db
      .prepare('UPDATE platform_workspaces SET name=? WHERE owner_user_id=97')
      .bind('Custom Studio')
      .run()
    for (const [id, name, suffix] of [
      [96, '😀'.repeat(40), "'s workspace"],
      [95, '😀'.repeat(40), '的工作空间'],
      [94, 'a'.repeat(67) + '😀' + 'b'.repeat(11), "'s workspace"],
      [93, 'c'.repeat(74) + '😀' + 'd'.repeat(4), '的工作空间'],
    ] as const) {
      await db
        .prepare(
          'INSERT INTO platform_users(id,email,name,created_at,email_verified) VALUES(?,?,?,1,1)',
        )
        .bind(id, `astral-${id}@example.test`, name)
        .run()
      const owned = await createD1Provisioning(db).defaultWorkspace(id)
      await db
        .prepare('UPDATE platform_workspaces SET name=? WHERE id=?')
        .bind(name.slice(0, 80 - suffix.length) + suffix, owned.id)
        .run()
      await db
        .prepare(
          'UPDATE platform_account_onboarding SET profile_completed_at=1,workspace_completed_at=1,workspace_id=? WHERE user_id=?',
        )
        .bind(owned.id, id)
        .run()
    }
    await apply('0048_onboarding_workspace_name.sql')
  }
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
    assert.equal(
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS n FROM platform_subscription_events WHERE kind='signup_promotion'",
          )
          .first()
      ).n,
      0,
    )
  } finally {
    await mf.dispose()
  }
})

test('Upgrade preserves existing accounts and only prompts newly registered accounts', async () => {
  const { db, mf } = await fixture(true)
  try {
    assert.equal((await accountSetup(db, 1)).required, false)
    const restored = await accountSetup(db, 99)
    const owned = await db
      .prepare('SELECT id FROM platform_workspaces WHERE owner_user_id=99')
      .first()
    assert.equal(restored.step, 3)
    assert.equal(restored.workspace?.customized, false)
    assert.equal((await accountSetup(db, 98)).workspace?.customized, false)
    assert.equal((await accountSetup(db, 97)).workspace?.customized, true)
    for (const id of [93, 94, 95, 96])
      assert.equal(
        (await accountSetup(db, id)).workspace?.customized,
        false,
        `UTF-16 default ${id}`,
      )
    assert.equal(restored.workspace?.id, owned.id)
    assert.equal(
      (
        await db
          .prepare(
            'SELECT workspace_id FROM platform_account_onboarding WHERE user_id=99',
          )
          .first()
      ).workspace_id,
      owned.id,
    )
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

test('Concurrent skip wins before provisioning without leaving a site, slug or domain', async () => {
  const { db, mf } = await fixture()
  try {
    let setup = await accountSetup(db, 1)
    setup = await saveAccountSetup(db, 1, {
      step: 1,
      revision: setup.revision,
      name: 'Alice',
    })
    setup = await saveAccountSetup(db, 1, {
      step: 2,
      revision: setup.revision,
      name: 'Alice Team',
    })
    let release!: () => void, reached!: () => void
    const barrier = new Promise<void>((resolve) => {
      release = resolve
    })
    const ready = new Promise<void>((resolve) => {
      reached = resolve
    })
    const fenced = {
      prepare: (sql: string) => db.prepare(sql),
      batch: async (
        statements: import('../packages/platform/src/index.ts').D1Statement[],
      ) => {
        reached()
        await barrier
        return db.batch(statements)
      },
    }
    const creating = saveAccountSetup(fenced, 1, {
      step: 3,
      revision: setup.revision,
      name: 'Gallery',
      slug: 'race-gallery',
    })
    const rejected = assert.rejects(creating, { statusCode: 409 })
    await ready
    await saveAccountSetup(db, 1, {
      step: 3,
      revision: setup.revision,
      skip: true,
    })
    release()
    await rejected
    for (const table of [
      'platform_sites',
      'platform_site_slugs',
      'platform_domains',
    ])
      assert.equal(
        (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n,
        0,
      )
    assert.equal((await accountSetup(db, 1)).required, false)
  } finally {
    await mf.dispose()
  }
})

test('Setup returns to the workspace step after ownership changes; inactive plans never display an active trial', async () => {
  const { db, mf, workspace } = await fixture()
  try {
    let setup = await accountSetup(db, 1)
    setup = await saveAccountSetup(db, 1, {
      step: 1,
      revision: setup.revision,
      name: 'Alice',
    })
    setup = await saveAccountSetup(db, 1, {
      step: 2,
      revision: setup.revision,
      name: 'Alice Team',
    })
    await db
      .prepare('UPDATE platform_workspaces SET owner_user_id=3 WHERE id=?')
      .bind(workspace.id)
      .run()
    assert.equal((await accountSetup(db, 1)).step, 2)
    const replacement = await createD1Provisioning(db).defaultWorkspace(1)
    assert.notEqual(replacement.id, workspace.id)
    assert.equal((await accountSetup(db, 1)).step, 2)
    await assert.rejects(
      saveAccountSetup(db, 1, {
        step: 3,
        revision: setup.revision,
        name: 'Gallery',
        slug: 'no-new-workspace',
      }),
      { statusCode: 409 },
    )
    assert.equal(
      (
        await db
          .prepare(
            'SELECT COUNT(*) AS n FROM platform_workspaces WHERE owner_user_id=1',
          )
          .first()
      ).n,
      1,
    )
    await db
      .prepare('UPDATE platform_workspaces SET owner_user_id=2 WHERE id=?')
      .bind(replacement.id)
      .run()
    await db
      .prepare('UPDATE platform_workspaces SET owner_user_id=1 WHERE id=?')
      .bind(workspace.id)
      .run()
    const now = Date.now(),
      offer = await workspaceTrial(db, 1, workspace.id, now)
    await claimWorkspaceTrial(db, 1, workspace.id, offer.offer!.revision, now)
    await db
      .prepare("UPDATE platform_plans SET active=0 WHERE id='creator'")
      .run()
    assert.equal(
      (await workspaceEntitlements(db, workspace.id, 'platform', now)).id,
      'free',
    )
    assert.equal(
      (await workspaceTrial(db, 1, workspace.id, now)).trial?.state,
      'expired',
    )
  } finally {
    await mf.dispose()
  }
})

test('Missing mail bindings preserve budgets; ended notices are not sent from an old backlog', async () => {
  const { db, mf, workspace } = await fixture()
  try {
    const now = Date.now(),
      offer = await workspaceTrial(db, 1, workspace.id, now)
    const claim = await claimWorkspaceTrial(
      db,
      1,
      workspace.id,
      offer.offer!.revision,
      now,
    )
    const end = claim.trial!.expiresAt,
      reported: string[] = [],
      sent: string[] = []
    const mail = {
      async send(message: { to: string }) {
        sent.push(message.to)
        return { messageId: 'notice' }
      },
    }
    await deliverTrialMail(
      db,
      undefined,
      'https://app.example.test',
      end - DAY,
      (stage) => reported.push(stage),
    )
    assert.deepEqual(reported, ['binding_unavailable'])
    assert.equal(
      (
        await db
          .prepare('SELECT COUNT(*) AS n FROM platform_trial_mail')
          .first()
      ).n,
      0,
    )
    await db
      .prepare(
        "INSERT INTO platform_trial_mail(id,user_id,cycle,notice_days,available_at) VALUES('old-queued',1,?,0,?)",
      )
      .bind(end, end)
      .run()
    await deliverTrialMail(db, mail, 'https://app.example.test', end + 2 * DAY)
    assert.equal(sent.length, 0)
    assert.equal(
      (
        await db
          .prepare(
            "SELECT state FROM platform_trial_mail WHERE id='old-queued'",
          )
          .first()
      ).state,
      'cancelled',
    )
    assert.equal(
      (
        await db
          .prepare('SELECT COUNT(*) AS n FROM platform_trial_mail')
          .first()
      ).n,
      1,
    )
    assert.equal(
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS n FROM platform_subscription_events WHERE kind='signup_promotion'",
          )
          .first()
      ).n,
      0,
    )
  } finally {
    await mf.dispose()
  }
})

test('A failed retry-state write does not prevent later notices or cleanup', async () => {
  const { db, mf, workspace } = await fixture()
  try {
    const now = Date.now(),
      other = await createD1Provisioning(db).defaultWorkspace(3)
    for (const [user, id] of [
      [1, workspace.id],
      [3, other.id],
    ]) {
      const offer = await workspaceTrial(db, user!, id!, now)
      await claimWorkspaceTrial(db, user!, id!, offer.offer!.revision, now)
    }
    const end = now + 14 * DAY
    await db
      .prepare(
        "INSERT INTO platform_trial_mail(id,user_id,cycle,notice_days,available_at,state) VALUES('cleanup',1,?,0,?,'failed')",
      )
      .bind(end - 1, now - 31 * DAY)
      .run()
    const failure: import('../packages/platform/src/index.ts').D1Statement = {
      bind() {
        return this
      },
      async first() {
        return null
      },
      async run() {
        throw Error('Retry database unavailable')
      },
    }
    const faulty = {
      prepare: (sql: string) =>
        sql.startsWith('UPDATE platform_trial_mail SET state=?')
          ? failure
          : db.prepare(sql),
      batch: (
        statements: import('../packages/platform/src/index.ts').D1Statement[],
      ) => db.batch(statements),
    }
    const reports: string[] = [],
      delivered: string[] = []
    await deliverTrialMail(
      faulty,
      {
        async send(message: { to: string }) {
          if (message.to === 'alice@example.test')
            throw Error('Provider rejected recipient')
          delivered.push(message.to)
          return { messageId: 'other' }
        },
      },
      'https://app.example.test',
      end - DAY,
      (stage) => reports.push(stage),
    )
    assert.deepEqual(reports, ['delivery', 'retry_state'])
    assert.deepEqual(delivered, ['social@example.test'])
    assert.equal(
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS n FROM platform_trial_mail WHERE id='cleanup'",
          )
          .first()
      ).n,
      0,
    )
  } finally {
    await mf.dispose()
  }
})

test('Trial history keeps the claimed workspace state when querying another workspace', async () => {
  const { db, mf, workspace } = await fixture()
  try {
    const now = Date.now(),
      offer = await workspaceTrial(db, 1, workspace.id, now)
    await claimWorkspaceTrial(db, 1, workspace.id, offer.offer!.revision, now)
    const other = await createD1Provisioning(db).defaultWorkspace(3)
    await db
      .prepare(
        "INSERT INTO platform_memberships(user_id,workspace_id,role) VALUES(1,?,'member')",
      )
      .bind(other.id)
      .run()
    const result = await workspaceTrial(db, 1, other.id, now)
    assert.equal(result.reason, 'not_owner')
    assert.equal(result.trial?.workspaceId, workspace.id)
    assert.equal(result.trial?.state, 'active')
    assert.equal(
      (await workspaceTrial(db, 1, other.id, now + 15 * DAY)).trial?.state,
      'expired',
    )
  } finally {
    await mf.dispose()
  }
})

test('Revoked owner membership suppresses new and previously queued trial reminders', async () => {
  const { db, mf, workspace } = await fixture()
  try {
    const now = Date.now(),
      offer = await workspaceTrial(db, 1, workspace.id, now)
    const claim = await claimWorkspaceTrial(
      db,
      1,
      workspace.id,
      offer.offer!.revision,
      now,
    )
    const end = claim.trial!.expiresAt
    await db
      .prepare(
        'DELETE FROM platform_memberships WHERE user_id=1 AND workspace_id=?',
      )
      .bind(workspace.id)
      .run()
    let sent = 0
    const mail = {
      async send() {
        sent++
        return { messageId: 'unexpected' }
      },
    }
    await deliverTrialMail(db, mail, 'https://app.example.test', end - 2 * DAY)
    assert.equal(
      (
        await db
          .prepare('SELECT COUNT(*) AS n FROM platform_trial_mail')
          .first()
      ).n,
      0,
    )
    await db
      .prepare(
        "INSERT INTO platform_trial_mail(id,user_id,cycle,notice_days,available_at) VALUES('before-revoke',1,?,3,?)",
      )
      .bind(end, end - 2 * DAY)
      .run()
    await deliverTrialMail(db, mail, 'https://app.example.test', end - 2 * DAY)
    assert.equal(sent, 0)
    assert.equal(
      (
        await db
          .prepare(
            "SELECT state FROM platform_trial_mail WHERE id='before-revoke'",
          )
          .first()
      ).state,
      'cancelled',
    )
  } finally {
    await mf.dispose()
  }
})

test('Workspace reconfirmation after a profile change survives refresh and blocks premature site creation', async () => {
  const { db, mf } = await fixture()
  try {
    let state = await accountSetup(db, 1)
    state = await saveAccountSetup(db, 1, {
      step: 1,
      revision: state.revision,
      name: 'Alice',
    })
    state = await saveAccountSetup(db, 1, {
      step: 2,
      revision: state.revision,
      name: "Alice's workspace",
    })
    state = await saveAccountSetup(db, 1, {
      step: 1,
      revision: state.revision,
      name: 'Bob',
      reconfirmWorkspace: true,
    })
    assert.equal(state.step, 2)
    assert.equal((await accountSetup(db, 1)).step, 2)
    await assert.rejects(
      saveAccountSetup(db, 1, {
        step: 3,
        revision: state.revision,
        name: 'Gallery',
        slug: 'pending-workspace',
      }),
      { statusCode: 409 },
    )
    state = await saveAccountSetup(db, 1, {
      step: 2,
      revision: state.revision,
      name: "Bob's workspace",
    })
    assert.equal(state.step, 3)
    assert.equal(state.workspace?.name, "Bob's workspace")
    state = await saveAccountSetup(db, 1, {
      step: 2,
      revision: state.revision,
      name: 'Custom Team',
    })
    state = await saveAccountSetup(db, 1, {
      step: 1,
      revision: state.revision,
      name: 'Charlie',
      reconfirmWorkspace: false,
    })
    assert.equal(state.step, 3)
    assert.equal(state.workspace?.name, 'Custom Team')
  } finally {
    await mf.dispose()
  }
})

test('Ineligible assignments cannot consume enqueue capacity ahead of a valid reminder', async () => {
  const { db, mf, workspace } = await fixture()
  try {
    const now = Date.now(),
      offer = await workspaceTrial(db, 1, workspace.id, now)
    const claim = await claimWorkspaceTrial(
        db,
        1,
        workspace.id,
        offer.offer!.revision,
        now,
      ),
      end = claim.trial!.expiresAt
    await db.batch([
      db
        .prepare(
          "WITH RECURSIVE ids(id) AS(SELECT 10 UNION ALL SELECT id+1 FROM ids WHERE id<60) INSERT INTO platform_users(id,email,created_at,email_verified) SELECT id,'inactive-'||id||'@example.test',?,1 FROM ids",
        )
        .bind(now),
      db
        .prepare(
          "INSERT INTO platform_workspaces(id,name,owner_user_id,created_at) SELECT id,'Inactive '||id,id,? FROM platform_users WHERE id BETWEEN 10 AND 60",
        )
        .bind(now),
      db.prepare(
        "INSERT INTO platform_memberships(user_id,workspace_id,role) SELECT id,id,'admin' FROM platform_users WHERE id BETWEEN 10 AND 60",
      ),
      db
        .prepare(
          "INSERT INTO platform_workspace_plans(workspace_id,plan_id,starts_at,source) SELECT id,'free',?,'manual' FROM platform_users WHERE id BETWEEN 10 AND 60",
        )
        .bind(now),
      db
        .prepare(
          "INSERT INTO platform_trials(user_id,workspace_id,plan_id,settings_revision,started_at,expires_at) SELECT id,id,'creator',1,?,? FROM platform_users WHERE id BETWEEN 10 AND 60",
        )
        .bind(now, end - 1),
    ])
    const sent: string[] = []
    await deliverTrialMail(
      db,
      {
        async send(message: { to: string }) {
          sent.push(message.to)
          return { messageId: 'valid-reminder' }
        },
      },
      'https://app.example.test',
      end - 2 * DAY,
    )
    assert.deepEqual(sent, ['alice@example.test'])
    assert.equal(
      (
        await db
          .prepare('SELECT COUNT(*) AS n FROM platform_trial_mail')
          .first()
      ).n,
      1,
    )
  } finally {
    await mf.dispose()
  }
})

test('Confirmed workspace naming intent is persisted independently of the name text', async () => {
  const { db, mf } = await fixture()
  try {
    let state = await accountSetup(db, 1)
    state = await saveAccountSetup(db, 1, {
      step: 1,
      revision: state.revision,
      name: 'Alice',
    })
    state = await saveAccountSetup(db, 1, {
      step: 2,
      revision: state.revision,
      name: "Alice's workspace",
      workspaceCustomized: false,
    })
    assert.equal(state.workspace?.customized, false)
    assert.equal((await accountSetup(db, 1)).workspace?.customized, false)
    state = await saveAccountSetup(db, 1, {
      step: 2,
      revision: state.revision,
      name: "Alice's workspace",
    })
    assert.equal((await accountSetup(db, 1)).workspace?.customized, false)
    // Explicit customization remains custom even when the text equals a default.
    state = await saveAccountSetup(db, 1, {
      step: 2,
      revision: state.revision,
      name: "Alice's workspace",
      workspaceCustomized: true,
    })
    assert.equal((await accountSetup(db, 1)).workspace?.customized, true)
    state = await saveAccountSetup(db, 1, {
      step: 2,
      revision: state.revision,
      name: "Alice's workspace",
    })
    assert.equal((await accountSetup(db, 1)).workspace?.customized, true)
    // Older clients omit the flag; preserve their names conservatively.
    state = await saveAccountSetup(db, 1, {
      step: 2,
      revision: state.revision,
      name: 'Old client name',
    })
    assert.equal(state.workspace?.customized, true)
  } finally {
    await mf.dispose()
  }
})
