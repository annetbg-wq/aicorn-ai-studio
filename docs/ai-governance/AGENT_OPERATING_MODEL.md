# Agent Operating Model

This is the default execution loop for non-trivial engineering work in AIC-RG Studio.

## 0. Establish capability and scope

Before diagnosis, determine which capabilities are actually available: repository read/write, CI, runtime/deploy, database, browser/canary, logs/metrics, and any external service needed by the task.

Do not confuse a missing credential or connector with a product defect.

Read the relevant product contracts, ADRs, tests, and existing implementation before proposing a solution.

## 1. Reconstruct the real system path

Trace the user-visible or system-visible path end to end. Do not stop at the file named in the ticket.

For a UI/runtime problem this may include:

`event/source → controller/service → state owner → facade/selector → render boundary → child component → browser/runtime artifact`

For a backend/platform problem this may include:

`request/event → contract → validation → application service → persistence/external dependency → outbox/side effect → observability → caller response`

Mark each transition with the invariant that should hold there.

## 2. Classify the task

Classify the problem as one or more of:

- local implementation defect;
- contract mismatch;
- state/lifecycle defect;
- concurrency/race defect;
- integration/configuration defect;
- deployment/runtime defect;
- observability gap;
- security/privacy defect;
- performance/capacity defect;
- architectural debt or boundary failure.

If evidence is insufficient, instrument first rather than guessing.

## 3. Run the architecture test

For a non-trivial problem, answer:

1. What is the authoritative owner of the relevant state or responsibility?
2. How many transitions/layers are involved?
3. Which transitions are necessary and which are historical?
4. If this subsystem were designed today, would we preserve this structure?
5. Can complexity be removed instead of patched?

If the repeated-failure trigger in `AGENTS.md` is met, run the full `ARCHITECTURE_REVIEW_PROTOCOL.md` before another fix.

## 4. Generate alternatives

For material architectural work, compare at least two credible options.

A useful comparison includes:

- mechanism;
- expected invariant;
- failure modes;
- state ownership;
- amount of new code versus removed code;
- migration/compatibility requirements;
- testability;
- operational visibility;
- rollback path.

Choose one and state why it is preferable for this repository now.

## 5. Make the smallest architecture-correct change

Prefer a focused implementation, but do not define “small” only by line count. A slightly larger change that removes a fragile layer can be safer than a tiny workaround that adds another hidden dependency.

Keep unrelated refactors out of the change unless they are required to restore a violated invariant.

## 6. Add evidence while implementing

Add or improve the diagnostic and test surface needed to prove the fix.

Depending on the task, this can include:

- unit tests;
- contract tests;
- integration tests;
- lifecycle/state transition tests;
- browser/E2E tests;
- runtime health assertions;
- structured logs/traces;
- benchmark/load checks;
- security checks.

A regression test should fail for the old behavior for the relevant reason, not simply execute the changed code.

## 7. Execute quality gates

Run all applicable gates from `QUALITY_GATES.md`. Do not stop at the first green layer when the defect exists at a later layer.

If a lower-level gate is green but a runtime gate is red, the runtime result wins and the task remains unresolved.

## 8. Diagnose failures from the narrowest proven boundary

When a verification step fails, update the system path with what is now known and continue from the last proven invariant.

Avoid broad speculative rewrites. Narrow the failure boundary first, then decide whether the correct next move is instrumentation, a local fix, or architectural redesign.

## 9. Delivery discipline

Use a branch/PR for meaningful changes unless the authorized workflow explicitly calls for another path.

The PR should state:

- problem and observed evidence;
- root cause or strongest supported diagnosis;
- architecture choice and rejected alternative(s), when relevant;
- implementation summary;
- tests/gates run;
- runtime verification result;
- known limitations/risks;
- rollback notes for higher-risk changes.

Do not merge while a required canary/runtime gate is failing.

## 10. Post-change learning

After a meaningful fix, ask what permanent improvement prevents recurrence. Add the appropriate regression test, invariant, diagnostic, self-check, ADR, or quality gate.

If the incident exposed unnecessary architecture, create a follow-up only when the simplification cannot safely be included in the current change. Do not normalize known structural defects as permanent background debt without recording them.