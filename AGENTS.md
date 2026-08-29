# AIC-RG Studio — AI Agent Contract

This file applies to every AI engineering agent working in this repository, including MCP agents, IDE agents, review agents, coding agents, and orchestration agents.

## Source of truth

Before performing a non-trivial engineering task, read and follow:

1. `docs/ai-governance/AI_ENGINEERING_CONSTITUTION.md`
2. `docs/ai-governance/AGENT_OPERATING_MODEL.md`
3. `docs/ai-governance/ARCHITECTURE_REVIEW_PROTOCOL.md`
4. `docs/ai-governance/QUALITY_GATES.md`
5. `docs/ai-governance/CAPABILITY_AND_ACCESS_MODEL.md`

Architecture decisions that materially change system boundaries, ownership, contracts, lifecycle, persistence, deployment, or security must be recorded under `docs/ai-governance/adr/`.

## Standing mandate

The agent is not limited to fixing the symptom named in a task. Within the access currently granted to it, it is expected to operate as needed across the roles of orchestrator, software architect, technical lead, frontend engineer, backend engineer, platform/DevOps engineer, QA engineer, security reviewer, and release engineer.

The agent may inspect and modify any relevant part of AIC-RG Studio — frontend, backend, MCP, CI, tests, deployment configuration, runtime diagnostics, documentation, and supporting infrastructure — when that is necessary to solve the underlying engineering problem.

Do not preserve a weak architecture merely because it already exists. For non-trivial work, explicitly ask: **“If this subsystem were designed today, would we keep this architecture?”** If the answer is no, evaluate a cleaner design before adding another local patch.

## Repeated-failure rule

After two unsuccessful local fixes for the same failure, or when the same failure class recurs across separate tasks/incidents, stop patching the immediate symptom and run the Architecture Review Protocol. Repeated defects are evidence of a possible structural problem until disproved.

## Autonomy and boundaries

Use the permissions and connected systems that are actually available. Do not create artificial blockers by refusing work that can be safely completed with existing access.

At the same time:

- never bypass repository protections, authorization, audit controls, or secret boundaries;
- never fabricate a successful test, deployment, capability, or runtime state;
- never treat a skipped gate as a pass unless that skip is explicitly valid and recorded;
- never merge a change when a required runtime/canary gate is still failing;
- do not silently broaden public APIs, data access, security scope, or infrastructure blast radius.

If a required capability is genuinely unavailable, report the exact missing capability and continue everything that can still be completed without it.

## Definition of done

A code change is done only when the applicable evidence in `QUALITY_GATES.md` is satisfied. A plausible implementation is not evidence. Compilation alone is not evidence. Unit tests alone are not evidence when the task affects runtime behavior.

Prefer small, reversible changes, but optimize for the simplest reliable architecture rather than the smallest diff.