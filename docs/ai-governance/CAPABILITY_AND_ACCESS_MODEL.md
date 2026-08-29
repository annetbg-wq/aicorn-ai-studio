# Capability and Access Model

Engineering roles and tool permissions are different things.

An agent may be responsible for architecture, implementation, QA, deployment, and diagnostics, but it can only execute actions supported by the credentials, connectors, APIs, and repository permissions actually available in the current environment.

This document defines how the agent should reason about that boundary without turning it into unnecessary human hand-offs.

## 1. Capability domains

At the start of a task, determine the status of the domains relevant to the work:

| Domain | Typical capability |
| --- | --- |
| Repository | read code/history, create branches/commits/PRs, inspect CI |
| CI | run or inspect required checks and artifacts |
| Runtime/deployment | inspect deployments, logs, revisions, variables/config, trigger deployment when authorized |
| Database | inspect schema/migrations, run diagnostics, verify connectivity and configured access |
| Browser/runtime UI | open Studio, exercise user flows, observe DOM/network/console/runtime state |
| MCP control plane | inspect tool health, execute diagnostics, exercise Studio automation capabilities |
| External integrations | verify configured provider/service behavior when required by the task |
| Observability | query logs/traces/metrics and correlate an operation end to end |

## 2. Self-diagnostic expectation

Where practical, the platform should expose explicit capability/self-diagnostic status instead of failing only when a tool is invoked.

Preferred form:

- repository/GitHub: `configured | unavailable | degraded`;
- database/Supabase: `configured | unavailable | degraded`;
- deploy/Railway: `configured | unavailable | degraded`;
- browser/canary: `configured | unavailable | degraded`;
- required credentials: report presence/status without exposing secret values.

The MCP control plane should evolve toward returning this capability map directly.

## 3. No artificial blockers

If the agent has sufficient access to perform a safe action, it should perform it rather than asking a human to repeat the action manually.

Examples:

- if repository write access exists, create the branch/commit/PR directly;
- if deployment/log access exists, inspect the failing revision directly;
- if database diagnostics exist, verify the connection instead of assuming a schema issue;
- if browser automation exists, reproduce the runtime failure rather than inferring it only from unit tests.

## 4. No imaginary permissions

Never claim to have executed an action that the environment did not permit.

When a required capability is missing:

1. name the exact missing capability;
2. distinguish whether it is permission, configuration, credential, connector, network, or product functionality;
3. continue all independent investigation and implementation that remains possible;
4. request only the minimum additional access needed;
5. after access is restored, resume from the last verified point rather than restarting blindly.

## 5. Least privilege for persistent credentials

Do not broaden long-lived credentials merely to make automation easier.

Prefer the minimum repository/project/service scope that supports the required operation. If an already-connected first-class connector provides the capability, avoid creating a duplicate permanent credential unless there is a concrete technical reason.

## 6. Separate capability failures from product failures

A missing `GITHUB_TOKEN`, deploy credential, database URL, or provider configuration is a control-plane/configuration failure. It is not evidence that the Studio product architecture is wrong.

Conversely, once the capability is confirmed healthy, do not continue blaming infrastructure for a reproducible application lifecycle defect.

Diagnosis should explicitly mark the boundary where infrastructure is proven healthy and the product path begins.

## 7. Auditability

Actions that change shared state should remain attributable through the underlying system's normal audit surface: commit, PR, deployment record, database migration, MCP operation id, or equivalent.

Do not route around those mechanisms merely to gain more autonomy.

## 8. Target state for AIC-RG Studio MCP

The MCP control plane should eventually be able to answer, without trial-and-error calls:

- GitHub configured?
- repository write configured?
- CI observable/triggerable?
- Railway deploy configured?
- Supabase/database diagnostics configured?
- browser/canary configured?
- current environment/revision?
- which capabilities are read-only versus write-enabled?

That capability report should be used by the agent before a complex autonomous run so that missing access is discovered early and reported precisely.