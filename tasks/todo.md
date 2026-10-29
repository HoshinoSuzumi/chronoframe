# Persist Onboarding Site Preferences

## Task 1: Add the failing wizard-submit regression test

**Description:** Reproduce the reported loss of non-default Site Info
preferences at the actual wizard submit route boundary before changing
production code.

**Acceptance criteria:**

- [x] A payload using `albums`, `dark`, and `fixed` expects those exact app
      settings to be persisted.
- [x] An invalid enum value is rejected before persistence.
- [x] The first run fails for the reported missing writes.

**Verification:**

- [x] Run the new test file directly with `node --experimental-strip-types --test`.
- [x] Run `tests/wizard-fields.test.ts` and `tests/wizard-guard.test.ts`.

**Dependencies:** None

**Files likely touched:**

- `tests/wizard-site-persistence.test.ts`

**Estimated scope:** Small

## Task 2: Create the shared Site Info contract and persistence helper

**Description:** Centralize validation and persistence for every field rendered
by the wizard's Site Info step, including the three enum-backed preferences.

**Acceptance criteria:**

- [x] The schema accepts all documented valid values and rejects unsupported
      values.
- [x] New preference fields remain optional for backward compatibility.
- [x] Every provided preference is written under the `app` namespace.

**Verification:**

- [x] The regression test reaches the GREEN state after route integration.
- [x] Focused lint and formatting checks pass for the new helper.

**Dependencies:** Task 1

**Files likely touched:**

- `apps/self-hosted/server/services/wizard/site-settings.ts`

**Estimated scope:** Small

## Task 3: Align both wizard Site Info endpoints

**Description:** Replace the duplicated incomplete schemas and write sequences
in the aggregate submit endpoint and the compatibility per-step endpoint with
the shared Site Info contract.

**Acceptance criteria:**

- [x] `POST /api/wizard/submit` persists the three non-default preferences.
- [x] `POST /api/wizard/site` uses the same validation and persistence rules.
- [x] Admin, storage, map, session, and wizard-completion behavior is unchanged.

**Verification:**

- [x] New and existing focused wizard tests pass.
- [x] Review the diff to confirm no frontend or unrelated API changes.

**Dependencies:** Tasks 1 and 2

**Files likely touched:**

- `apps/self-hosted/server/api/wizard/submit.post.ts`
- `apps/self-hosted/server/api/wizard/site.post.ts`

**Estimated scope:** Small

## Checkpoint: Server behavior

- [x] Regression test is green.
- [x] Invalid enums remain rejected.
- [x] Existing wizard tests are green.

## Task 4: Run final quality and behavior verification

**Description:** Prove the focused fix and check that it introduces no broader
regression, keeping baseline failures distinct from change-caused failures.

**Acceptance criteria:**

- [x] Focused tests, lint, formatting, and build pass.
- [x] Full-test results are recorded accurately.
- [x] Isolated runtime smoke verification is complete; browser control was
      unavailable, so the built server, persisted settings API, and rendered root
      response were checked directly.
- [x] Phase 3 results are documented for the final implementation commit.

**Verification:**

- [x] `pnpm lint`
- [ ] `pnpm fmt:check` (six unrelated/baseline files fail; changed files pass)
- [x] Full test command under pinned Node 22.23.3 (279 passed, 2 skipped)
- [x] `pnpm build` under pinned Node 22.23.3
- [x] `git status --short --branch`

**Dependencies:** Task 3

**Files likely touched:** None beyond generated ignored artifacts

**Estimated scope:** Small

## Checkpoint: Ready for review

- [x] All task acceptance criteria are met within the recorded browser-tool limit.
- [x] Final implementation diff is narrow and committed separately from the
      regression-only commit.
- [x] The feature branch is pushed to `origin`.
