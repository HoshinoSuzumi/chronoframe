---
name: prod-container-verify
description: Reproduce, fix, and validate feature requests or bugs in a production-like Docker flow for ChronoFrame. Use when the agent should iterate via built images, run a minimal local container, complete onboarding/login in the browser, and verify behavior end-to-end before reporting results.
argument-hint: Requirement or bug to verify in production-like container
---

# Production-Like Container Verification (ChronoFrame)

Use this skill when the user asks the agent to simulate production testing and validation, then iterate fixes end-to-end in Docker.

## When To Use

- User asks to "simulate production" or "validate in a real container"
- Bug is hard to trust via local dev server only
- Feature acceptance requires onboarding, login, and browser validation
- User explicitly wants all verification done from built images, not direct local run

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
