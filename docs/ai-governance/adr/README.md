# Architecture Decision Records

Use ADRs for durable engineering decisions that materially affect system boundaries, state ownership, lifecycle, contracts, persistence, deployment topology, security model, or major technology choices.

## Naming

Use sequential names:

`NNNN-short-kebab-title.md`

Example:

`0001-preview-state-ownership.md`

## Status

Use one of:

- Proposed
- Accepted
- Superseded
- Deprecated

When superseding an ADR, link both records.

## What belongs in an ADR

An ADR should capture:

- the concrete problem/evidence;
- constraints and invariants;
- credible alternatives considered;
- the selected decision and why;
- consequences/trade-offs;
- migration/rollback considerations;
- verification criteria.

Do not create ADRs for routine implementation details that do not create a durable architectural constraint.

Start from `0000-template.md`.