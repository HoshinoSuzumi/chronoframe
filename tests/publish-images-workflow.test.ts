import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  chmod,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { parse } = createRequire(require.resolve('wrangler/package.json'))(
  'yaml',
)
const source = await readFile(
  new URL('../.github/workflows/publish-images.yml', import.meta.url),
  'utf8',
)
const workflow = parse(source)
const steps = workflow.jobs.prepare.steps
const environment = {
  PATH: dirname(process.execPath) + ':' + process.env.PATH,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  RELEASE_EVENT: 'workflow_dispatch',
  MANUAL: 'true',
  RELEASE_BRANCH: 'main',
  RELEASE_VERSION: '1.1.0',
  RELEASE_TAG: 'v1.1.0',
  GITHUB_RUN_ID: '123456',
  GITHUB_REPOSITORY: 'HoshinoSuzumi/chronoframe',
  GITHUB_REF: 'refs/heads/main',
  PUBLISH_GHCR: 'true',
  PUBLISH_DOCKERHUB: 'false',
}
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, {
    cwd,
    env: environment,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
function runStep(name: string, cwd: string, env: Record<string, string> = {}) {
  const step = [...steps, ...workflow.jobs.release.steps].find(
    (s: any) => s.name === name,
  )
  assert(step?.run, name)
  return spawnSync('bash', ['-e', '-o', 'pipefail', '-c', step.run], {
    cwd,
    env: {
      ...environment,
      GITHUB_OUTPUT: join(cwd, 'output'),
      GITHUB_STEP_SUMMARY: join(cwd, 'summary'),
      ...env,
    },
    encoding: 'utf8',
  })
}
function success(result: ReturnType<typeof runStep>) {
  assert.equal(result.status, 0, result.stderr + result.stdout)
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'chronoframe-release-'))
  const remote = join(root, 'origin.git'),
    work = join(root, 'work')
  git(root, 'init', '--bare', '--initial-branch=main', remote)
  git(root, 'clone', remote, work)
  git(work, 'config', 'user.name', 'Fixture')
  git(work, 'config', 'user.email', 'fixture@example.invalid')
  await mkdir(join(work, '.github/workflows'), { recursive: true })
  await writeFile(join(work, '.github/workflows/publish-images.yml'), source)
  await writeFile(
    join(work, 'package.json'),
    JSON.stringify({ name: 'fixture', version: '1.0.2' }, null, 2) + '\n',
  )
  git(work, 'add', '.')
  git(work, 'commit', '-m', 'Initial fixture')
  git(work, 'switch', '-c', 'feature')
  await writeFile(join(work, 'feature.txt'), 'feature')
  git(work, 'add', '.')
  git(work, 'commit', '-m', 'Feature')
  git(work, 'switch', 'main')
  git(work, 'merge', '--no-ff', 'feature', '-m', 'Merge feature')
  git(work, 'push', 'origin', 'main')
  return { root, remote, work }
}
test('manual releases use a scoped credential and only the originating run publishes', () => {
  const checkout = steps.find((s: any) => s.name === 'Checkout repository')
  assert.match(checkout.with.token, /secrets\.RELEASE_TOKEN/)
  assert.match(checkout.with.token, /github\.token/)
  assert.match(
    workflow.jobs['build-and-push'].if,
    /needs\.prepare\.outputs\.publish == 'true'/,
  )
  assert(workflow.jobs.manifest.needs.includes('build-and-push'))
  assert(workflow.jobs.release.needs.includes('manifest'))
})
test('manual preparation keeps merge history, tags atomically, uses HoshinoSuzumi and resumes only its immutable tag', async () => {
  const f = await fixture()
  try {
    const base = git(f.work, 'rev-parse', 'HEAD')
    assert.equal(
      git(f.work, 'rev-list', '--parents', '-n', '1', base).split(' ').length,
      3,
    )
    const missing = runStep('Validate manual release credential', f.work, {
      RELEASE_TOKEN: '',
    })
    assert.notEqual(missing.status, 0)
    assert.match(missing.stdout, /Configure RELEASE_TOKEN/)
    success(
      runStep('Validate manual release credential', f.work, {
        RELEASE_TOKEN: 'fixture-only',
      }),
    )
    success(runStep('Select publishing run', f.work))
    success(runStep('Validate release version and targets', f.work))
    success(runStep('Commit version and create release tag', f.work))
    const commit = git(f.remote, 'rev-parse', 'refs/tags/v1.1.0^{commit}')
    assert.equal(git(f.remote, 'rev-parse', 'refs/heads/main'), commit)
    assert.equal(git(f.work, 'rev-parse', 'HEAD^'), base)
    assert.equal(
      JSON.parse(git(f.remote, 'show', `${commit}:package.json`)).version,
      '1.1.0',
    )
    assert.equal(
      git(f.work, 'show', '-s', '--format=%an <%ae>', commit),
      'HoshinoSuzumi <26276464+HoshinoSuzumi@users.noreply.github.com>',
    )
    assert.equal(git(f.work, 'cat-file', '-t', 'refs/tags/v1.1.0'), 'tag')
    success(
      runStep('Select publishing run', f.work, {
        RELEASE_EVENT: 'push',
        GITHUB_REF: 'refs/tags/v1.1.0',
      }),
    )
    assert.match(
      await readFile(join(f.work, 'output'), 'utf8'),
      /publish=false/,
    )
    assert.match(
      await readFile(join(f.work, 'summary'), 'utf8'),
      /actions\/runs\/123456/,
    )
    await writeFile(join(f.work, 'later.txt'), 'later')
    git(f.work, 'add', '.')
    git(f.work, 'commit', '-m', 'Later source change')
    git(f.work, 'push', 'origin', 'main')
    const later = git(f.remote, 'rev-parse', 'refs/heads/main')
    success(runStep('Commit version and create release tag', f.work))
    assert.equal(git(f.work, 'rev-parse', 'HEAD'), commit)
    assert.equal(git(f.remote, 'rev-parse', 'refs/heads/main'), later)
    assert.equal(
      git(f.remote, 'rev-parse', 'refs/tags/v1.1.0^{commit}'),
      commit,
    )
    const foreign = runStep('Commit version and create release tag', f.work, {
      GITHUB_RUN_ID: '999999',
    })
    assert.notEqual(foreign.status, 0)
    assert.match(foreign.stderr, /refusing to overwrite/)
    git(f.work, 'tag', 'v1.0.2', base)
    git(f.work, 'tag', '-a', 'v1.0.3', '-m', 'Ordinary external release', base)
    git(
      f.work,
      'commit',
      '--allow-empty',
      '-m',
      'External release',
      '-m',
      'ChronoFrame-Publish-Images-Run: 123456',
    )
    git(f.work, 'tag', 'v1.0.4')
    for (const tag of ['v1.0.2', 'v1.0.3', 'v1.0.4']) {
      await writeFile(join(f.work, 'output'), '')
      success(
        runStep('Select publishing run', f.work, {
          RELEASE_EVENT: 'push',
          GITHUB_REF: `refs/tags/${tag}`,
        }),
      )
      assert.equal(
        await readFile(join(f.work, 'output'), 'utf8'),
        'publish=true\n',
      )
    }
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})
test('concurrent source changes reject the entire push without leaving a release tag', async () => {
  const f = await fixture()
  try {
    const other = join(f.root, 'other')
    git(f.root, 'clone', f.remote, other)
    git(other, 'config', 'user.name', 'Fixture')
    git(other, 'config', 'user.email', 'fixture@example.invalid')
    await writeFile(join(other, 'concurrent.txt'), 'concurrent')
    git(other, 'add', '.')
    git(other, 'commit', '-m', 'Concurrent update')
    git(other, 'push', 'origin', 'main')
    const latest = git(f.remote, 'rev-parse', 'refs/heads/main')
    const result = runStep('Commit version and create release tag', f.work)
    assert.notEqual(result.status, 0)
    assert.equal(git(f.remote, 'rev-parse', 'refs/heads/main'), latest)
    assert.equal(
      spawnSync(
        'git',
        ['show-ref', '--verify', '--quiet', 'refs/tags/v1.1.0'],
        { cwd: f.remote, env: environment },
      ).status,
      1,
    )
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})
test('invalid versions, empty targets and outdated release-source workflows fail before publishing', async () => {
  const f = await fixture()
  try {
    for (const value of ['1.1.0+build', '1.01.0', '1.1.0;echo bad'])
      assert.notEqual(
        runStep('Validate release version and targets', f.work, {
          RELEASE_VERSION: value,
        }).status,
        0,
      )
    assert.notEqual(
      runStep('Validate release version and targets', f.work, {
        PUBLISH_GHCR: 'false',
        PUBLISH_DOCKERHUB: 'false',
      }).status,
      0,
    )
    await writeFile(
      join(f.work, '.github/workflows/publish-images.yml'),
      'name: Legacy publish\n',
    )
    assert.notEqual(runStep('Select publishing run', f.work).status, 0)
    assert.equal(
      git(f.remote, 'rev-parse', 'refs/heads/main'),
      git(f.work, 'rev-parse', 'HEAD'),
    )
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

test('a release whose package version is already correct still marks its annotated tag without an empty commit', async () => {
  const f = await fixture()
  try {
    const original = git(f.work, 'rev-parse', 'HEAD')
    success(
      runStep('Commit version and create release tag', f.work, {
        RELEASE_VERSION: '1.0.2',
        RELEASE_TAG: 'v1.0.2',
      }),
    )
    assert.equal(git(f.remote, 'rev-parse', 'refs/heads/main'), original)
    assert.equal(
      git(f.remote, 'rev-parse', 'refs/tags/v1.0.2^{commit}'),
      original,
    )
    success(
      runStep('Select publishing run', f.work, {
        RELEASE_EVENT: 'push',
        GITHUB_REF: 'refs/tags/v1.0.2',
      }),
    )
    assert.equal(
      await readFile(join(f.work, 'output'), 'utf8'),
      'publish=false\n',
    )
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

test('release notes are validated before image publication and transferred as an artifact', async () => {
  assert.equal(workflow.jobs.prepare.outputs.changelog, undefined)
  const generate = steps.findIndex(
    (s: any) => s.name === '📝 Generate changelog',
  )
  const resolve = steps.findIndex(
    (s: any) => s.name === 'Resolve immutable release commit',
  )
  const upload = steps.findIndex((s: any) => s.name === 'Upload release notes')
  assert(generate > resolve)
  assert(upload > generate)
  assert.equal(workflow.jobs['build-and-push'].needs, 'prepare')
  assert.equal(steps[upload].uses, 'actions/upload-artifact@v4')
  assert.equal(steps[upload].with['if-no-files-found'], 'error')
  const download = workflow.jobs.release.steps.find(
    (s: any) => s.name === 'Download validated release notes',
  )
  assert.equal(download.uses, 'actions/download-artifact@v4')
  assert.equal(download.with.name, steps[upload].with.name)
  assert.equal(download.with.path, '${{ runner.temp }}')
  const create = workflow.jobs.release.steps.find(
    (s: any) => s.name === '📝 Create Release',
  )
  assert.equal(create.with.body, undefined)
  assert.equal(create.with.body_path, '${{ runner.temp }}/release-notes.md')
  const f = await fixture()
  try {
    git(f.work, 'tag', 'v1.0.2')
    success(runStep('Commit version and create release tag', f.work))
    const bin = join(f.root, 'bin'),
      scripts = join(f.work, 'scripts')
    await mkdir(bin)
    await mkdir(scripts)
    await writeFile(
      join(bin, 'npx'),
      `#!/bin/sh
printf '%s\\n' "$@" > "$NPX_ARGUMENTS_FILE"
if [ "$RELEASE_NOTE_FIXTURE_EMPTY" != true ]; then
  printf '[log] ## Features\\n[log] \\n[log] - Public release changes (@PublicMaintainer)\\n'
fi
`,
    )
    await chmod(join(bin, 'npx'), 0o755)
    await writeFile(
      join(scripts, 'changelog-contributors.mjs'),
      `import fs from 'node:fs';fs.writeFileSync(process.env.CONTRIBUTOR_RANGE_FILE,process.argv[2]);if(process.env.RELEASE_NOTE_FIXTURE_EMPTY!=='true')console.log('### ❤️ Contributors\\n\\n- Public Maintainer (@PublicMaintainer)')`,
    )
    const notes = join(f.root, 'notes.md')
    const env = {
      PATH: bin + ':' + environment.PATH,
      RELEASE_NOTES_FILE: notes,
      IS_PRERELEASE: 'false',
      NPX_ARGUMENTS_FILE: join(f.root, 'args'),
      CONTRIBUTOR_RANGE_FILE: join(f.root, 'range'),
    }
    success(runStep('📝 Generate changelog', f.work, env))
    const body = await readFile(notes, 'utf8')
    assert.match(body, /## Features/)
    assert.match(body, /### ❤️ Contributors/)
    assert.match(body, /@PublicMaintainer/)
    assert(!body.includes('[log]'))
    assert(!body.includes('ChronoFrame-Publish-Images-Run'))
    assert.equal(await readFile(join(f.root, 'range'), 'utf8'), 'v1.0.2..HEAD')
    assert(
      (await readFile(join(f.root, 'args'), 'utf8')).includes('--from=v1.0.2'),
    )
    const output = await readFile(join(f.work, 'output'), 'utf8').catch(
      () => '',
    )
    assert(!output.includes('changelog'))
    const empty = runStep('📝 Generate changelog', f.work, {
      ...env,
      RELEASE_NOTES_FILE: join(f.root, 'empty.md'),
      RELEASE_NOTE_FIXTURE_EMPTY: 'true',
    })
    assert.notEqual(empty.status, 0)
    assert.match(empty.stdout, /Generated release notes are empty/)
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})
