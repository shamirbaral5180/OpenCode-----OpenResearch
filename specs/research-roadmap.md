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

## Knowledge base decisions

The knowledge base is the foundation for persistent memory, verification
context, multi-agent coordination, and monitoring. Decisions:

- **Storage: local-first.** SQLite on device, in the same database as the rest
  of the application. No server custody. Optional end-to-end encrypted sync is a
  later, opt-in feature. This preserves true air-gapped operation and user data
  ownership.
- **Scope: per project/workspace by default.** Entities, claims, and edges are
  keyed by `project_id` and isolated. Cross-project linking is an explicit,
  advanced opt-in, never automatic. This avoids contamination and privacy leaks
  in multi-user or sensitive environments.
- **Model: entities, claims, edges.** A lightweight graph, not a heavy RDF
  store. Claims reference the evidence ledger by `source_id` and `source_topic`
  so the knowledge base stays auditable back to primary sources.
- **Dedupe:** entities dedupe by `(project_id, kind, normalized_name)`; edges
  dedupe by `(project_id, from, to, relation)`.
- **No vectors yet.** Embeddings and semantic retrieval are a future layer on
  top of this store; the durable, portable truth is the relational graph.
- **Relevance:** context injection ranks prior knowledge by keyword overlap
  (stopword-filtered), source-topic match, claim status (contradictions first),
  and entity co-occurrence, using the current question as the query. This is a
  deterministic stand-in; embeddings/semantic retrieval remain a future layer.

## Live monitoring decisions (deferred, recorded for direction)

1. While the app is open (always available).
2. Local background service for air-gapped/privacy-sensitive users.
3. Server-side monitoring only as an explicit opt-in for users who accept cloud
   processing.

Server-side must never be the only option.

## Multi-agent orchestration decisions (deferred, recorded for direction)

- Planner autonomy: medium-high, with hard caps.
- Max 4-6 concurrent subagents; max depth 2-3 levels.
- A user-configurable cost ceiling per research run (sensible default in the
  low single-digit dollar range or token equivalent).
- Show an estimated cost before launching a heavy multi-agent run and prefer
  "propose plan, user confirms" for expensive runs over silent autonomy.

### Implemented orchestration

- Roles: `research` (planner/synthesizer), `research-scout` (discovery),
  `research-reviewer` (verification), `research-redteam` (adversarial
  falsification). All workers are read-only and cannot delegate or write reports.
- Limits enforced in code at the task chokepoint, not prompt-only:
  `max_concurrent_subagents` (default 6), `subagent_depth` (default 1, workers do
  not re-spawn), and `research_budget_usd` (default 3) summed over the subagent
  session subtree. `0` disables a guard.
- Confirm gate implemented: the `research_plan` tool presents subquestions,
  assigned agents, and an honest cost estimate, and requires explicit user
  approval. Approval is persisted on the root research session and enforced at
  the task chokepoint once the projected worker count meets
  `research_plan_threshold` (default 3; `0` always requires a plan). Small
  delegations below the threshold stay frictionless.
- Remaining: a pre-run cost estimate shown by the UI, and richer plan editing.

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
