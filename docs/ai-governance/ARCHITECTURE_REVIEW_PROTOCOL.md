# Architecture Review Protocol

Use this protocol when a task materially changes architecture or when the repeated-failure rule in `AGENTS.md` is triggered.

The purpose is to determine whether the defect belongs to a local implementation or to the structure of the subsystem itself.

## 1. State the observed failure precisely

Record facts, not interpretations:

- expected behavior;
- actual behavior;
- first failing observable;
- last proven-good observable;
- environment where it reproduces;
- whether it is deterministic, intermittent, or timing-sensitive;
- which checks are green and which are red.

Do not call a suspected cause a root cause before it is demonstrated.

## 2. Map the end-to-end path

Write the actual execution/data path in order.

For each hop capture:

- producer;
- value/event/contract;
- consumer;
- ownership;
- sync/async boundary;
- lifecycle assumption;
- observable evidence;
- invariant.

Example:

`PreviewController.notifyCompiling → useStudio setPreviewUrl → Studio facade memo → App render → EngineWorkspace → PreviewCanvas → iframe mount`

This kind of path should make it possible to identify the exact transition where an invariant stops holding.

## 3. Identify architectural smells

Explicitly check for:

- multiple owners of the same mutable state;
- state copied instead of derived;
- controller state mirrored into UI state without a single authority;
- render/lifecycle timing used as a synchronization mechanism;
- excessive facade/adapter layers with no independent contract value;
- hidden mutable singletons;
- duplicated integrations;
- compatibility code with no remaining consumer;
- retry loops hiding ordering defects;
- status values that claim success before the user-visible artifact exists;
- tests coupled to implementation while missing the real invariant.

Finding a smell is not proof by itself; connect it to the observed failure.

## 4. Establish the minimum required invariants

Describe what the subsystem must guarantee independent of implementation.

For each invariant define how it can be observed or tested.

Example for preview lifecycle:

- when backend build state becomes `ready`, the frontend must receive a stable preview identity/URL;
- exactly one authoritative owner determines whether a preview is renderable;
- the render decision cannot depend on a transient intermediate value that can be lost between async updates;
- the browser canary must observe the preview iframe (or replacement render surface) within the defined timeout;
- failures must expose the last successful lifecycle transition.

## 5. Compare architecture options

Evaluate at least two credible options for a material redesign. Include “keep current architecture and fix locally” when it is genuinely viable.

For each option document:

- state/responsibility owner;
- sequence of transitions;
- layers removed/added;
- compatibility impact;
- failure modes;
- diagnostic quality;
- testability;
- migration effort;
- rollback effort;
- expected effect on future complexity.

Prefer the option that satisfies the invariants with the fewest independent moving parts and the clearest ownership model.

## 6. Prove or disprove the architectural hypothesis

Before a broad refactor, seek a discriminating test or instrumentation point that can tell the options apart.

Examples:

- log the value at every state transition with a shared correlation id;
- assert facade memo dependencies and component render inputs;
- mount the render component against a controlled state owner;
- bypass one suspected intermediary in an experiment branch;
- compare event timestamps to detect race/order inversions.

An experiment branch may be intentionally unmergeable if it is designed only to prove a hypothesis. Label it as such.

## 7. Choose the change boundary

Select one of:

- local fix — architecture is sound and one implementation violates it;
- targeted refactor — ownership/lifecycle is weak in a bounded area;
- subsystem redesign — current boundaries make the invariants inherently difficult to guarantee;
- platform change — the issue belongs to shared infrastructure or cross-cutting contracts.

Explain why the chosen boundary is neither too narrow nor unnecessarily broad.

## 8. Plan migration and rollback

For any change that alters a durable boundary, specify:

- migration sequence;
- compatibility window, if real consumers require it;
- data/state migration if applicable;
- feature flag or controlled rollout if warranted;
- rollback trigger;
- rollback procedure;
- observability required during rollout.

Do not add compatibility machinery when there is no actual compatibility requirement.

## 9. Verify against the original failure

A review is incomplete until the chosen design is tested against the exact user-visible/system-visible failure that triggered it.

Passing new unit tests without clearing the original canary, runtime path, or production/staging failure does not close the investigation.

## 10. Record durable decisions

If the review changes system boundaries, state ownership, lifecycle, persistence, deployment topology, public contracts, security model, or major technology choices, create an ADR in `docs/ai-governance/adr/`.

The ADR must include the evidence that caused the decision and the consequences the team accepts.