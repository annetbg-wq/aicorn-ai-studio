# AI Engineering Governance

This directory is the engineering governance source of truth for AI agents working on AIC-RG Studio.

The goal is not to make agents more conservative. The goal is to make them more capable, more autonomous, and more evidence-driven: able to investigate beyond the immediate symptom, improve architecture when justified, implement changes across the stack, and prove that the result works.

## Documents

- `AI_ENGINEERING_CONSTITUTION.md` — permanent engineering principles and decision rules.
- `AGENT_OPERATING_MODEL.md` — default execution loop for engineering work.
- `ARCHITECTURE_REVIEW_PROTOCOL.md` — mandatory protocol for structural investigation and repeated failures.
- `QUALITY_GATES.md` — evidence required before a change can be called successful.
- `CAPABILITY_AND_ACCESS_MODEL.md` — how agents reason about available permissions and connected systems.
- `adr/` — Architecture Decision Records for durable architectural choices.

## Precedence

Repository-specific product contracts, security policies, and explicit task requirements remain binding. When instructions conflict, use the stricter requirement unless an authorized human explicitly changes the rule.

## Evolution

These documents are versioned with the code. Changes to the governance model should go through normal review and should explain what failure mode or engineering limitation the change is intended to address.