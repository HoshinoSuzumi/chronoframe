# Implementation Plan: Persist Onboarding Site Preferences

## Overview

Fix the self-hosted setup wizard so the Site Info selections for home view,
theme, and home-header layout survive wizard completion. The frontend already
stores and submits these values; the work is limited to the server validation
and persistence path, with regression coverage at the wizard submit boundary.

## Validation Summary

- Confirmed on current `origin/main` and the `v1.0.2` tag that the complete
  step submits the full wizard Site Info object to `POST /api/wizard/submit`.
- Confirmed the submit route validates only `title`, `slogan`, `avatarUrl`, and
  `author`. Zod therefore strips `homeView`, `appearance.theme`, and
  `appearance.homeHeaderLayout` before the handler receives the parsed body.
- Executed the current submit handler with a non-default Site Info payload. Its
  captured app-setting writes contained only `app:title`; none of the three
  selected preferences were written.
- Confirmed the setting registry already defines all three keys, defaults, and
  enum constraints, and the gallery already consumes their persisted values.
- Confirmed `server/api/wizard/site.post.ts` repeats the same incomplete Site
  Info contract even though no repository client currently calls it.
- Installed the frozen dependency graph without tracked changes, then ran the
  focused existing wizard tests: 9 passed, 0 failed.

## Architecture Decisions

- Define one shared Site Info Zod schema for both wizard endpoints instead of
  duplicating enum lists. This removes the current drift risk while preserving
  the per-step endpoint for compatibility.
- Keep the three preference fields optional. The active wizard supplies them
  from schema defaults, while optionality preserves compatibility with older
  clients or previously stored wizard state.
- Persist an optional preference whenever it is not `undefined`; do not use a
  truthiness check as the persistence contract.
- Keep the frontend and gallery consumers unchanged because payload capture and
  downstream consumption are already correct.

## Task List

### Phase 1: Reproduce the server-boundary failure

- [x] Task 1: Add a route-level wizard submission regression test.
  - Submit a complete wizard payload containing `albums`, `dark`, and `fixed`.
  - Assert all three non-default values reach the app-settings persistence
    boundary along with the existing Site Info fields.
  - Assert an unsupported enum value is rejected before settings are written.
  - Run the new test against the current code and capture the expected RED
    failure.

### Checkpoint: Reproduction

- [x] The new regression test fails for the missing preference writes, not for
      test-harness or dependency-resolution reasons.
- [x] Existing focused wizard tests remain green.

### Phase 2: Apply the minimal server fix

- [x] Task 2: Add a shared wizard Site Info contract and persistence helper.
  - Validate `homeView` as `photos | albums`.
  - Validate `appearance.theme` as `light | dark | system`.
  - Validate `appearance.homeHeaderLayout` as `embedded | fixed`.
  - Preserve the existing required and optional text-field behavior.
- [x] Task 3: Use the shared contract and persistence helper from both
      `submit.post.ts` and `site.post.ts`.
  - Persist each provided preference through `settingsManager.set('app', ...)`.
  - Do not change admin, storage, map, session, or completion behavior.

### Checkpoint: Fixed behavior

- [x] The RED regression test turns GREEN.
- [x] Invalid preference values are rejected.
- [x] The focused wizard test set passes.

### Phase 3: Verification

- [x] Task 4: Run scoped quality gates and the broader repository gates.
  - Run the new regression test and existing wizard tests directly with the
    repository's Node test runner.
  - Run `pnpm lint` and `pnpm fmt:check`.
  - Run `pnpm test` and distinguish any unrelated baseline failure from a
    regression introduced by this change.
  - Run `pnpm build`.
  - If the isolated self-hosted setup can be exercised safely, complete one
    browser smoke test with the non-default selections and verify General
    Settings plus gallery behavior after the hard redirect.
    - Browser control was unavailable, so verification used an isolated built
      server instead: submit returned 200, the public settings API returned
      `albums` / `dark` / `fixed`, and the rendered gallery root returned 200.

### Checkpoint: Complete

- [x] All acceptance criteria are met within the recorded browser-tool limit.
- [x] Only the intended Site Info server contract, wizard routes, regression
      test, and task notes are changed.
- [x] The regression and implementation are committed as focused branch commits,
      and the feature branch is pushed to `origin`.

## Expected Files

- `apps/self-hosted/server/services/wizard/site-settings.ts` (new shared
  schema/persistence helper)
- `apps/self-hosted/server/api/wizard/submit.post.ts`
- `apps/self-hosted/server/api/wizard/site.post.ts`
- `tests/wizard-site-persistence.test.ts` (new regression coverage)

## Risks and Mitigations

| Risk                                              | Impact | Mitigation                                                                                       |
| ------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| Duplicate Site Info contracts drift again         | Medium | Both endpoints import the same schema and persistence helper.                                    |
| Older clients omit new preference fields          | Medium | Keep each new field optional and write only provided values.                                     |
| Invalid strings reach settings persistence        | Medium | Reject them with explicit Zod enums before any handler side effects.                             |
| Test proves calls but not user-visible behavior   | Low    | Verify current downstream consumers, then perform an isolated browser smoke test when practical. |
| Broad checks expose unrelated repository failures | Low    | Run focused gates first and report baseline failures separately.                                 |

## Open Questions

None. The current contracts and existing setting definitions provide the needed
values and compatibility behavior.
