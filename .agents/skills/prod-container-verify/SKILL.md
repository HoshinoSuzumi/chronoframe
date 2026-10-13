---
name: prod-container-verify
description: Build and run ChronoFrame in Docker for verification only when the user explicitly requests both building and runtime testing in a Docker environment. Do not use for routine development, debugging, or bug fixes; use the local development server, checking port 3000 first and starting pnpm run dev if it is not running.
---

# Production-Like Container Verification (ChronoFrame)

Use this skill only when the user explicitly requests building and running tests in a Docker environment.

## When To Use

- The request must explicitly require both a Docker image build and runtime testing in Docker, such as "build and run in Docker to verify this fix".
- A request to "simulate production", perform end-to-end/browser validation, develop a feature, debug, or fix a bug does not activate this skill unless it also explicitly requires Docker building and runtime testing.
- Do not choose Docker verification solely because an issue is difficult to reproduce or requires onboarding/login.

## Default For Routine Development

For everyday development, debugging, bug fixes, and verification without the explicit Docker requirement, use the local development server:

1. Check whether the development server is already listening on port `3000` (for example, `lsof -nP -iTCP:3000 -sTCP:LISTEN`).
2. If it is running, reuse it at `http://localhost:3000`.
3. If it is not running, start `pnpm run dev` from the repository root and wait until it is ready before browser verification.
4. If another process occupies port `3000`, identify it before proceeding; do not stop it automatically or mistake it for the development server.

## Outcome

- The agent reproduces the issue (or validates the requirement) in a running container
- The agent implements fixes and repeats image-based verification until pass
- The final report includes what was tested, what changed, and what remains risky

## Standard Workflow

1. Understand target behavior
- Extract expected behavior, failure symptoms, and acceptance criteria
- Convert to a short checklist of observable browser outcomes

2. Prepare code changes (if needed)
- Analyze likely root causes
- Implement minimal, focused fixes
- Run fast local checks first when possible (typecheck/tests/lint) to reduce rebuild loops

3. Build image for each validation cycle
- Always validate using a Docker image, not direct local app run
- Build command:

```bash
docker build -t chronoframe-dev .
```

4. Start minimal container
- Use this baseline command (adjust only if the scenario requires extra env/volume/network):

```bash
docker run -d \
  --name chronoframe \
  -p 3000:3000 \
  -e NUXT_SESSION_PASSWORD=Xxn0IFH/kOi9trCvwrr9SDJll6KNm8aYLFJ2oe5oePw= \
  chronoframe
```

5. Resolve container conflicts before retest
- If container name already exists: stop/remove old container, then rerun
- If `3000` is occupied: either free the port or remap and test on mapped port
- If image is stale: rebuild before rerun
- Use a time-stamped image tag for each validation cycle so rebuilds are explicit and traceable

6. Browser verification (required)
- Open app in integrated browser
- Complete onboarding user creation and login flow
- During onboarding, keep all optional fields at defaults
- For MapLibre required field, enter any non-empty value
- Continue to target page/flow and validate requirement or bug fix

7. Iterative loop (required)
- If fail: collect failure evidence (steps, observed behavior, logs), update code, rebuild image, rerun container, retest in browser
- Repeat until acceptance criteria pass or a hard blocker is identified

8. Completion checks
- Container starts successfully from latest image
- Onboarding + login are completed in browser
- Target behavior matches expected acceptance criteria
- No new obvious regressions seen in touched flows

9. Report format
- Repro status: reproduced / not reproduced
- Fix status: fixed / partially fixed / blocked
- Validation environment: time-stamped image tag, container run settings, tested URL/port
- Test evidence: key steps and observations
- Risks and follow-up: residual edge cases, suggested next checks

## Decision Points

- Need more than minimal startup config?
- Add env vars or mounts only when the test cannot proceed with baseline command

- Onboarding flow changed by product updates?
- Keep defaults where possible; only fill mandatory fields required by current UI

- Cannot reproduce after multiple cycles?
- Confirm exact user scenario, data preconditions, and whether issue may be environment-specific

## Guardrails

- Do not claim validation success without browser verification
- Do not skip rebuild between meaningful code changes
- Prefer minimal changes and preserve unrelated behavior
- Keep all production-like testing image-driven to avoid drift from local runtime
