# AIC-RG Studio — Copilot Instructions

Follow the repository-wide AI engineering contract in `AGENTS.md` and the governance documents in `docs/ai-governance/`.

For non-trivial engineering work:

- reconstruct the end-to-end system path before editing;
- identify the authoritative state/responsibility owner and required invariants;
- ask whether the subsystem would be designed the same way today;
- after repeated local failures, stop patching and run `docs/ai-governance/ARCHITECTURE_REVIEW_PROTOCOL.md`;
- compare credible architectural alternatives when the change is material;
- use available tooling and connected systems directly when safe and authorized;
- prove the result with the applicable gates in `docs/ai-governance/QUALITY_GATES.md`;
- never treat a failing required runtime/canary check as success because lower-level tests are green;
- record durable architectural decisions under `docs/ai-governance/adr/`.

Prefer the simplest reliable architecture over compatibility layers or state duplication that have no demonstrated consumer or requirement.