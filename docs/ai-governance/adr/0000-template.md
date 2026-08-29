# ADR NNNN — Title

Status: Proposed
Date: YYYY-MM-DD

## Context

What concrete problem, incident, repeated failure, or new requirement requires an architectural decision?

Include the strongest observed evidence and the current system path/boundary affected.

## Constraints and invariants

List the requirements that any acceptable solution must satisfy.

- Invariant 1
- Invariant 2
- Operational/security/product constraint

## Options considered

### Option A — Name

Mechanism:

Pros:

Cons / failure modes:

Migration / compatibility:

Rollback:

### Option B — Name

Mechanism:

Pros:

Cons / failure modes:

Migration / compatibility:

Rollback:

## Decision

State the selected option and why it is preferable under the current evidence and constraints.

## Consequences

What becomes simpler, harder, newly possible, or newly constrained?

Include accepted trade-offs and any legacy path that can be removed.

## Verification

How will the decision be proven correct?

- static/contract checks;
- automated tests;
- integration/runtime checks;
- browser/canary if applicable;
- performance/security/observability checks if applicable.

## Migration and rollout

Describe the sequence, feature flag/compatibility window if required, and any data/state migration.

## Rollback

Define rollback triggers and the safe rollback path.

## Follow-ups

List only follow-ups that are intentionally outside this ADR's implementation boundary.