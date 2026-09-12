# OpenResearch product strategy and roadmap

This document records the product direction. It is a strategy reference, not an
implementation spec. Update it when priorities change.

## Product thesis

OpenResearch should be the strongest research tool in the world: an evidence-led
deep-research system that accumulates verifiable knowledge instead of resetting
every conversation. The user connects MCP servers, skills, plugins, and models
(cloud or local); the application owns the research methodology, the evidence
ledger, and the verification guarantees.

## Primary user

Individual power researchers: analysts, academics, journalists, students, and
independent investigators. Optimize for research speed and evidence quality
first; enterprise administration is a supporting concern, not the design center.

## Positioning

Harness only. OpenResearch is the research engine, not the data. Users bring
their own MCP servers, skills, and plugins. Do not build and maintain first-party
data connectors as the primary strategy; make it trivial to plug in external
capability and make the harness so good that connectors want to integrate.

## Model strategy

All of the above. Support frontier cloud providers (OpenAI, Anthropic, Google,
and others) plus local and self-hosted models (Ollama, vLLM, and similar). Model
choice should be a routing and policy decision, not an architectural one.

## Verification posture

Enforced verification by default: every consequential externally verifiable
claim must resolve to a ledger record, and DOIs, URLs, and quotations must be
checked before a report can finalize. Rigor should be configurable and lockable
per workspace once enterprise controls exist, but the default is strict.
Prompt-only guidance (`assisted`) is not sufficient as the default.

## Capability roadmap

Ranked by research impact ("wow" factor), not by implementation cost.

### Tier 1 — transformative

1. **Persistent knowledge base.** Cross-session memory plus a living knowledge
   graph of sources, claims, entities, relationships, and contradictions. This
   is the single biggest differentiator: understanding should accumulate over
   weeks and months, track how claims evolve, and surface contradictions.
2. **Multi-agent research teams.** Planner, scout, verifier, and red-team agents
   that debate and cross-check each other. The adversarial/red-team element is
   what reduces hallucination and confirmation bias.
3. **Live monitoring.** Continuous watching of a topic, person, company, or
   policy with alerts when new evidence appears. Turns a one-shot query engine
   into an ongoing research partner.

### Tier 2 — strong

4. **Quant/dataset analysis.** Ingest real datasets, run statistics and
   regressions, and embed results in reports. Bridges qualitative and
   quantitative research.
5. **Auto-generated deliverables.** Slide decks, briefs, dashboards, and
   datasets generated directly from the evidence ledger.

### Tier 3 — table stakes later

6. **Collaboration.** Shared projects, inline review, comments, and approval
   workflows. Important for teams but secondary to research quality.

## Enterprise priorities

Ranked for serious research environments (universities, labs, government,
defense, pharma), where research integrity and legality dominate.

1. **Air-gapped/on-prem.** Fully offline operation with local models and
   self-hosted search/DB. Removes data-exfiltration risk and enables sensitive or
   proprietary data.
2. **Data residency.** Region-pinned storage and processing. Frequently
   non-negotiable for grants, institutional policy, and regulation.
3. **Audit & compliance export.** Full provenance trails, tamper-evident logs,
   and reproducible methodology. SOC2/GDPR-ready exports.
4. **SSO/RBAC/teams.** SAML/OIDC, roles, per-team permissions and quotas.
5. **Cost governance.** Per-user budgets, model routing, spend dashboards.

## Non-goals

- Being a general coding agent or autonomous software builder.
- Bypassing verification for speed.
- First-party maintenance of the long tail of data connectors.

## Guiding constraints

- The evidence ledger is the source of truth; reports are generated from it, not
  from the model.
- Permissions and verification are enforcement mechanisms in code, not prompt
  promises.
- Never let a write, citation, or artifact escape the reports/ boundary.
- Every capability must preserve auditability and reproducibility.
