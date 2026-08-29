## Problem and evidence

Describe the observed failure/requirement, the last proven-good boundary, and the first failing boundary.

## Architecture assessment

- [ ] For a non-trivial change, I identified the authoritative owner of the affected state/responsibility.
- [ ] I asked whether this subsystem would be designed the same way today.
- [ ] If the repeated-failure trigger was met, I ran `docs/ai-governance/ARCHITECTURE_REVIEW_PROTOCOL.md`.
- [ ] For a material architecture change, I compared at least two credible options or documented the hard constraint that forced one option.
- [ ] A durable architectural decision has an ADR when required.

## Implementation

Summarize the selected approach, important boundaries changed, and any legacy path removed or intentionally retained.

## Verification

Check only applicable gates and include the exact commands/runs/evidence in the PR description.

- [ ] Contract/static correctness
- [ ] Unit/component tests
- [ ] Integration tests
- [ ] Production build
- [ ] Runtime smoke
- [ ] Browser/E2E/canary
- [ ] Security/privacy checks
- [ ] Performance/capacity checks
- [ ] Observability/diagnostic checks
- [ ] Post-deploy verification

Skipped gates and reason:

## Runtime result

State the highest verified level from `docs/ai-governance/QUALITY_GATES.md` (`IMPLEMENTED`, `STATIC PASS`, `TEST PASS`, `RUNTIME PASS`, `CANARY PASS`, `DEPLOY VERIFIED`, `BLOCKED`, `FAILED`, or `EXPERIMENT`).

A required failing canary/runtime gate means this PR is not a verified fix.

## Risk and rollback

Describe known risks and rollback for changes with meaningful runtime, data, security, or deployment impact.