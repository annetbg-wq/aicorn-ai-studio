# Quality Gates

A change may be called successful only when the gates applicable to its real failure surface are satisfied.

Not every task requires every gate. The agent must state which gates are applicable, which are not, and why.

## Gate 1 — Contract and static correctness

Use as applicable:

- typecheck / compilation;
- schema validation;
- API/contract compatibility checks;
- lint/static analysis;
- configuration validation;
- migration validation.

A static pass proves only static correctness.

## Gate 2 — Unit and component behavior

Run relevant unit/component tests and add regression coverage for the changed invariant.

A regression test should distinguish the broken behavior from the fixed behavior rather than merely exercise a code path.

## Gate 3 — Integration behavior

Required when the task crosses module, process, persistence, network, or external-service boundaries.

Examples:

- frontend ↔ backend contract;
- backend ↔ database;
- backend ↔ queue/storage/provider;
- MCP ↔ GitHub/Railway/Supabase;
- controller ↔ state owner ↔ renderer.

Mocks do not substitute for a real configured integration when the defect exists in the integration itself.

## Gate 4 — Production build

Required for changes that affect packaged frontend/backend/runtime artifacts.

The build must succeed under the same build path used for deployment or preview generation, not only under a local development shortcut.

## Gate 5 — Runtime smoke

Required for user-visible or runtime-lifecycle changes.

Verify the actual application/runtime artifact starts and reaches the expected state.

Examples:

- health/readiness endpoint corresponds to the new runtime;
- Studio can load;
- a generated preview reaches a renderable state;
- the changed backend path accepts a real request;
- the expected deploy revision is serving.

## Gate 6 — Browser/E2E/canary

Required when the defect is observable only after browser rendering, navigation, lifecycle, interaction, or a multi-service flow.

A failed required canary keeps the change unresolved even when compilation, unit tests, build, and lower-level smoke checks are green.

For Preview/Studio changes, the canary must validate the final render surface, not merely backend `ready` status.

## Gate 7 — Security and privacy

Required when a change affects:

- authorization/authentication;
- data scope/ACL;
- secrets or credentials;
- external callbacks/webhooks;
- user-generated code execution;
- sandbox boundaries;
- storage/database access;
- public network exposure.

Use targeted security checks and document any changed threat surface.

## Gate 8 — Performance and capacity

Required when a change can materially affect latency, memory, CPU, concurrency, generation time, build time, throughput, or external-service cost.

Use a before/after benchmark or a defined threshold where practical. A benchmark skip is valid only when the repository's rules explicitly permit it and the reason is recorded.

## Gate 9 — Observability

For meaningful runtime changes, ensure failure can be located without reconstructing the entire incident manually.

As applicable, verify:

- structured logs;
- trace/correlation identifiers;
- lifecycle/status events;
- actionable error messages;
- diagnostic state/self-checks;
- metrics or dashboards for critical paths.

## Gate 10 — Delivery verification

Before merge/release:

- required checks are green;
- required runtime/canary evidence is green;
- unresolved experimental branches are not merged as fixes;
- known limitations are explicit;
- rollback is understood for higher-risk changes.

After deployment when applicable, verify the deployed revision rather than assuming CI success equals runtime success.

## Result vocabulary

Use precise status language:

- `IMPLEMENTED` — code change exists;
- `STATIC PASS` — compile/type/schema/static checks passed;
- `TEST PASS` — specified automated test suites passed;
- `RUNTIME PASS` — relevant runtime behavior was observed successfully;
- `CANARY PASS` — end-to-end/browser canary passed;
- `DEPLOY VERIFIED` — expected revision is serving and the relevant post-deploy check passed;
- `BLOCKED` — a required external capability is unavailable;
- `FAILED` — a required gate is red;
- `EXPERIMENT` — change exists to test a hypothesis and is not a mergeable fix yet.

Do not compress these distinctions into an unsupported generic `PASS`.