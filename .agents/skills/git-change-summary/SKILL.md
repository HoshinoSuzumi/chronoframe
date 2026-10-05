---
name: git-change-summary
description: Generate an English commit message, PR title, and PR description for project changes. Use when the user invokes this skill or asks to generate/regenerate commit or pull-request text, including Chinese requests such as 生成提交信息、生成 PR 标题和描述. Return all three by default unless the user explicitly restricts the requested output.
---

# Git Change Summary

Draft copy-ready Git text grounded in the final change and its verification evidence. This skill generates text; it does not authorize creating commits, staging changes, pushing branches, or creating/updating pull requests.

## Establish the scope

- Use the user's specified change, commits, branch comparison, or PR as the scope. Use conversation context to understand the problem and accepted requirements, but verify the final state where repository access is available.
- For a commit message without an explicit scope, inspect `git status --short` and the staged diff. If nothing is staged, inspect the working-tree diff and relevant untracked files. Never stage files just to draft a message.
- For a PR, use the requested base/ref or the locally available tracked base when it is clear. Inspect the branch diff and relevant commit history; include uncommitted work only when it is part of the intended PR. Do not guess `main`/`master` or fetch merely to generate text.
- When the base or scope is unavailable, draft from the verified changes and state the scope assumption briefly outside the copyable text. Ask only if ambiguity would materially change the summary.
- Honor applicable repository instructions. If a PR template exists, follow it for the description while keeping the three-deliverable response format below.
- Summarize the resulting implementation, not every intermediate edit. Exclude reverted approaches, removed temporary artifacts, and unrelated changes unless they affect behavior or verification.

## Language and content

- Default to English for all three deliverables, even when the request is in Chinese. Use another language when explicitly requested.
- Use Conventional Commits for the commit subject and PR title: `type(scope): concise outcome`. Choose a concrete component scope when useful; omit it for cross-cutting changes. Choose the type from the actual change (`fix`, `feat`, `refactor`, `docs`, `chore`, etc.).
- Prefer a short imperative subject, ideally at most 72 characters. Avoid generic titles such as "update code" and avoid implying unrelated scope.
- Write the commit body as concise bullets covering the meaningful final changes. A trivial change can use only a subject; do not add bullets just to fill the template.
- Lead the PR description with the concrete problem and the resulting behavior. Include a before/after example only when it helps the reviewer.
- Scale detail to the change. Use `### Changes` and `### Validation` for changes with several review-relevant points; a simple change can use one short paragraph plus validation. Add `### Limitations` only for actual material constraints or known remaining work.
- Explain behavior and purpose before implementation details. Do not copy the conversation chronology or claim an unverified user-visible outcome as proven.
- Include only evidence-backed validation. Distinguish lint, compilation, build, logic tests, and real browser/container checks. Do not imply one proves another.
- Identify checks that ran before subsequent relevant edits, checks that could not run, and tests removed after execution when that distinction matters. Do not reuse old success claims as verification of the latest changes.
- Do not run expensive builds or tests merely to draft text; use available evidence, and say verification was not performed when appropriate. Never invent commands, passing checks, benchmarks, screenshots, or coverage.
- If there are breaking changes, use `!` and a `BREAKING CHANGE:` footer when warranted, and describe the compatibility impact in the PR.

## Output format

Default to exactly these three labeled, separately copyable artifacts in this order. Do not put labels inside the code fences. Replace the illustrative placeholders with actual content; omit unnecessary commit-body bullets and optional PR sections.

**Commit message**

```text
fix(component): describe the concrete outcome

- Describe a meaningful final change
- Describe another meaningful change when needed
```

**PR title**

```text
fix(component): describe the problem resolved and resulting behavior
```

**PR description**

```markdown
Explain the problem and how the final change addresses it.

### Changes

- Describe the resulting behavior and relevant implementation.

### Validation

- Report completed checks and material verification gaps accurately.

### Limitations

- Include only known material limitations; omit this section when none apply.
```

Generate all three when the user asks for commit/PR text without explicitly narrowing the output. If the user says "only the commit message", "只生成 PR 标题和描述", or another clear restriction, return just those artifacts. Subsequent requests to translate or regenerate preserve the intended change scope and apply the latest requested format or language.
