# Tier 2 specification: quantitative analysis and generated deliverables

Status: draft for review
Scope: product + implementation spec for roadmap Tier 2 items 4 and 5
(`specs/research-roadmap.md`). This is not yet an approval to build.

## 1. Why these, and in this order

The roadmap ranks quant/dataset analysis (item 4) before auto-generated
deliverables (item 5). That ordering is deliberate and this spec follows it:

- Quantitative work strengthens the **core research capability**. Today the
  product can find and cite sources but cannot reason over data. "Is this
  effect real, and how big?" is a first-class research question that the
  current stack answers only in prose.
- Deliverable formatting (slides, briefs, dashboards) is output polish layered
  on whatever the ledger and analysis already contain. Building it first would
  produce prettier artifacts without better research.

Both must obey the existing invariants: the evidence ledger is the source of
truth (`specs/research-policy.md`), enforcement lives in code, and no write,
citation, or artifact may escape the `reports/` boundary.

## 2. Current state (grounded in the code)

- Evidence ledger: append-only JSONL at `reports/<topic>/evidence.jsonl`,
  fields in `packages/core/src/research-evidence.ts:25-35`. Latest record per
  `source_id` wins (`collapse`, same file lines 78-82).
- Report gate: `report_write` (`packages/openresearch/src/tool/report-write.ts`)
  validates sections and `[S#]` citations via
  `packages/core/src/research-report.ts` and generates `sources.md` from the
  ledger, never from the model.
- Knowledge graph: SQLite (`packages/core/src/knowledge/*`), project-scoped,
  populated best-effort from the ledger. `EntityKind` already includes
  `"dataset"` (`schema.ts:28`) but nothing uses it.
- Read-only workers: scout/reviewer/redteam have `bash`, `edit`, and `task`
  denied (`packages/core/src/plugin/research.ts:5-27`,
  `packages/openresearch/src/agent/agent.ts:198`). There is **no code
  execution** available to research agents.
- Tooling: no CSV parser, no statistics/regression library, no charting in the
  research app. `decimal.js` exists in `packages/openresearch` (not core).
  `marked` + `shiki` render markdown in other apps.

Consequence: statistics must run **in-process** in a tool, not via a shell or
Python. Any new numeric result must attach to the ledger and survive the same
citation/validation gate as prose.

## 3. Design principles

1. **Ledger is the source of truth.** Every quantitative result that reaches a
   report is a ledger artifact with a stable ID and reproducible inputs.
   Reports cite numbers the same way they cite sources.
2. **Reproducibility over convenience.** A computation records the dataset
   identity, a content hash, the exact operation and parameters, and the
   software version. Re-running the same inputs yields the same output.
3. **No hidden execution.** All analysis is deterministic, local, and
   dependency-light. No shell, no arbitrary code, no network.
4. **Fail loud, not plausible.** Degenerate inputs (empty columns, n below
   threshold, non-numeric data, missing values) produce structured errors or
   explicit caveats rather than silent numbers.
5. **Deterministic artifacts.** Generated deliverables derive from the ledger
   and the analysis store; the model does not hand-author the numbers.

## 4. Part A — Quant / dataset analysis (first)

### 4.1 New core module: `packages/core/src/research-data.ts`

Pure, effect-free logic (mirrors `research-evidence.ts` style), so it is easy to
unit test without the app runtime. It owns:

- Dataset descriptor schema and parsing.
- A minimal, well-defined statistics surface.
- The analysis-record schema and its serialization.

Proposed schemas (Effect `Schema`, snake_case JSON fields to match the ledger):

```ts
// Dataset descriptor, registered as a ledger-adjacent artifact.
DatasetSchema = Schema.Struct({
  dataset_id: Schema.String,          // D1, D2, ...
  title: Schema.String,
  path: Schema.String,                // reports/<topic>/data/<file>
  format: Schema.Literals(["csv", "tsv"]),
  rows: Schema.Number,
  columns: Schema.Array(Schema.Struct({
    name: Schema.String,
    type: Schema.Literals(["number", "string", "date", "boolean", "empty"]),
    missing: Schema.Number,
  })),
  sha256: Schema.String,              // content hash of the data file
  retrievedAt: Schema.String,
  source_id: Schema.optional(Schema.String), // optional link to an evidence S#
})

// One reproducible computation over one dataset.
AnalysisSchema = Schema.Struct({
  analysis_id: Schema.String,         // A1, A2, ...
  dataset_id: Schema.String,
  operation: Schema.Literals([
    "describe", "correlation", "group_summary", "regression_ols", "t_test", "trend",
  ]),
  params: Schema.Record(Schema.String, Schema.Unknown),
  result: Schema.Unknown,             // operation-specific structured payload
  n: Schema.Number,                   // observations actually used
  warnings: Schema.Array(Schema.String),
  software: Schema.String,            // e.g. "openresearch-stats/1"
  computedAt: Schema.String,
})
```

Storage: `reports/<topic>/datasets.jsonl` and `reports/<topic>/analyses.jsonl`,
append-only, same collapse-by-id discipline as the evidence ledger. Reuse
`ResearchArtifact.allowed` for boundary checks.

### 4.2 Statistics surface (v1)

Deliberately small and defensible. Implement in `packages/core/src/research-stats.ts`
(pure functions, no I/O):

- `describe(column)`: n, missing, min, max, mean, median, stddev (sample),
  quartiles. Numerically careful accumulation (compensated/Welford summation)
  to avoid float drift, with no new dependency in core.
- `correlation(x, y)`: Pearson and Spearman (rank), pairwise-complete.
- `groupSummary(group, value)`: per-group n/mean/median/stddev.
- `regressionOls(y, xs)`: ordinary least squares with coefficients, standard
  errors, t-statistics, R², adjusted R², and n. No regularization, no
  interactions in v1.
- `tTest(a, b)`: two-sample Welch's t-test with df, t, and a two-sided p-value.
- `trend(x, y)`: linear trend with slope, intercept, R², and n.

Explicit non-goals for v1: multivariate imputation, weighted samples, time
series models, causal inference, panel/fixed effects, multiple-testing
correction, and any "significant" verdict worded as certainty. Correlation is
never reported as causation (see `plugin/research.ts:223`).

### 4.3 CSV parsing (v1)

- Implement a small, strict RFC-4180-ish parser in core rather than adding a
  dependency, or add a single vetted parser to the catalog. Recommend the
  former for v1: the app is air-gap-capable and dependency-light, and the
  parser surface (quoted fields, escaped quotes, CRLF, delimiter override) is
  small and fully testable.
- Type inference is conservative: a column is `number` only if every non-missing
  value parses as a finite number; otherwise `string`. Never silently coerce.
- Hard caps: max file size (configurable, default ~50 MB) and max rows scanned
  for inference; report truncation explicitly.
- Malformed rows produce structured per-row errors and are excluded, with the
  excluded count surfaced. The parser never "repairs" data silently.

### 4.4 New tools (registered in `packages/openresearch/src/tool/registry.ts`)

Follow `check_url.ts` / `knowledge.ts` patterns. Both must be added to
`ResearchPrompt.retrievalTools` (`plugin/research.ts:74-153`) so the locked
policy grants them `ask` and surfaces them to agents.

1. `dataset` tool
   - `register` — copy/point to a data file under `reports/<topic>/data/`,
     parse header, infer types, compute hash, write the dataset descriptor.
     Accepts a local path (read is already allowed) or an explicit text payload.
   - `list` / `describe` — return registered datasets and column profiles.
   - `preview` — first N rows as a bounded JSON table for the model.
   - Writes go through `ResearchArtifact.allowed` and the `edit` permission
     (`reports/**`). Read-only workers may call read/list/describe/preview but
     not `register` (it writes).

2. `analyze` tool
   - Input: `topic`, `dataset_id`, `operation`, `params`.
   - Runs the pure core function, appends an `AnalysisSchema` record, returns
     the structured result plus warnings.
   - Refuses to run above a configurable row/column cap without `confirm: true`.
   - Deterministic: same dataset hash + operation + params => identical record
     (apart from `computedAt`).

3. `report_write` integration (Part A)
   - Add an optional `analyses` input: a list of analysis IDs the report relies
     on. The report may reference them as `[A1]` in addition to `[S#]`.
   - Extend `ResearchReport.validate` so `[A#]` citations must resolve to an
     analysis record, and every `verified`-adjacent numeric claim the model
     marks with an `[A#]` must exist. Missing/invalid analysis citations are
     hard errors, exactly like unresolvable `[S#]`.
   - Numeric claims must carry a unit and denominator where applicable; the
     validation warns when an `[A#]`-cited sentence has no unit and no
     "share"/"percent" context. (Warning in v1, not a hard fail, to avoid
     false positives.)

### 4.5 Knowledge graph integration

- When a dataset is registered, upsert an entity of kind `dataset` with
  `external_ids = { sha256, source_id? }` and aliases.
- When an analysis runs, add a claim keyed by
  `origin_key = "<topic>:<analysis_id>"` with `source_id`/`source_topic`
  pointing at the dataset's linked evidence source when present. This keeps the
  graph auditable back to inputs.
- Keep the existing "best-effort projection" semantics: a graph write failure
  never fails the ledger/analysis write.

### 4.6 Policy and prompt updates (`packages/core/src/plugin/research.ts`)

- Add a "Quantitative analysis" workflow paragraph: register the dataset,
  compute analyses, cite `[A#]` next to the numbers, preserve units,
  denominators, base years, and n; never infer causation from correlation;
  never pool incompatible studies; state uncertainty and assumptions.
- Extend the quantitative-synthesis rule (currently line 223) to reference the
  `analyze` tool and the analysis ledger.
- Add `dataset` and `analyze` to `retrievalTools`.

### 4.7 Tests

- `packages/core/test/research-data.test.ts`: CSV parsing edge cases (quotes,
  embedded newlines, CRLF, ragged rows, BOM), type inference, caps, hashing,
  append/collapse semantics.
- `packages/core/test/research-stats.test.ts`: known-answer tests for each
  operation (hand-computed fixtures), degenerate inputs, missing values, and
  numerical stability (e.g. large values, tiny variance).
- `packages/openresearch/test/tool/dataset.test.ts` and `.../analyze.test.ts`:
  permission (`reports/**` only, read-only worker denied writes), determinism,
  boundary rejection, structured errors.
- Extend `packages/core/test/research-report.test.ts` for `[A#]` resolution and
  unit warnings.
- Extend the eval harness (`script/eval/metrics.ts`) with a
  `analysisCoverage` metric: fraction of `[A#]` citations that resolve, and a
  count of uncited analyses relied on by reported numeric claims.

## 5. Part B — Auto-generated deliverables (second)

Only after Part A lands. v1 target is **clean briefs and slide decks generated
deterministically from the ledger**; dashboards are a later slice.

### 5.1 New tool: `deliverable`

A single tool with `kind ∈ { "brief", "slides" }`, writing under the same
`reports/<topic>/` boundary:

- `brief` — a tightened one-page brief: question, headline findings with `[S#]`
  and `[A#]` citations, key numbers from analyses, counterevidence, and the
  source register excerpt. Rendered to Markdown, then validated with the same
  citation rules as the report.
- `slides` — a deterministic deck. v1 emits a self-contained HTML deck (one
  `<section>` per slide, inline CSS) and/or a Markdown "slide source" file.
  Slides are generated from structured inputs (sections of the validated
  report + analysis results), not free-form model text.

Generation is a pure function in core
(`packages/core/src/research-deliverable.ts`) that takes validated report
content + ledger + analyses and returns the artifact string(s). The model
supplies titles and narrative framing, but **numbers and citations are injected
from the ledger**, so the artifact cannot invent a figure.

Decision to confirm: whether slide output should be HTML-only in v1 (renderable
and reviewable in-app) or also PDF/PPTX. PDF/PPTX require new dependencies
(`pdfkit`, `pptxgenjs`) that are not currently present and would need catalog
entries; HTML keeps the air-gap story simple. This spec recommends **HTML-only
in v1**, with PDF/PPTX as a follow-up.

### 5.2 Validation and boundary

- Reuse `ReportWrite`-style `uniqueTopicDir` no-overwrite behavior for
  `deliverable/` subpaths.
- Extend `ResearchReport.validate` (or a sibling validator) so generated
  deliverables must resolve all `[S#]`/`[A#]` citations and may not cite
  anything the underlying report/ledger does not.
- Permission: `edit reports/**` only, same `ResearchArtifact.allowed` check.

### 5.3 Tests

- `packages/core/test/research-deliverable.test.ts`: deterministic generation
  from fixtures; every number in output traces to an analysis record; citation
  parity; no-overwrite.
- `packages/openresearch/test/tool/deliverable.test.ts`: boundary, permission,
  read-only worker denial.
- Eval: extend the harness with a `deliverableCitationParity` metric.

## 6. Explicit non-goals

- No shell/Python execution, no arbitrary code, no network during analysis.
- No causal inference claims, no automatic "statistically significant => true".
- No embeddings/vector search (still a future layer, per roadmap).
- No first-party data connectors; datasets are user-supplied local files.
- No overwrite of existing artifacts.

## 7. Dependencies to add

Ideally **none** in v1: CSV parsing and statistics are small enough to implement
in core. If a dependency is chosen instead, it must be added to the root
`workspaces.catalog` (`package.json:34-97`) with a `catalog:` ref and must
satisfy `bunfig.toml` (`exact = true`, 3-day release age). Charting (Part B
dashboards) would be the first likely addition; `chart.js` already exists but
only in `packages/console/app`, so it would be promoted to the catalog then.

## 8. Sequencing and slices

1. **Slice 1 — data foundation.** `research-data.ts` + CSV parser + tests.
   No tools, no UI.
2. **Slice 2 — statistics.** `research-stats.ts` + known-answer tests.
3. **Slice 3 — tools.** `dataset` + `analyze` tools, registry + policy
   (`retrievalTools`) wiring, permission tests.
4. **Slice 4 — report integration.** `[A#]` citations in `ResearchReport`,
   `report_write` input, prompt updates, eval metric.
5. **Slice 5 — briefs.** `research-deliverable.ts` brief generator + tool.
6. **Slice 6 — slides (HTML).** Deck generator + tests.
7. **Slice 7 (later) — dashboards / PDF / PPTX.** Separate spec.

Each slice is independently shippable and must keep the full suite green
(`packages/core`, `packages/openresearch`) and follow the desktop release
workflow when user-visible.

## 9. Open questions

1. Should `analyze` results be citable in the **knowledge graph** as claims
   (proposed), or stay in a separate analysis store only?
2. Slide deliverable output in v1: HTML-only (recommended) vs. also PDF/PPTX?
3. Dataset storage: copy the file into `reports/<topic>/data/` (proposed, makes
   the bundle self-contained and hash-stable) vs. reference an external path?
4. Should `report_write` hard-fail on numeric claims lacking units, or keep it a
   warning in v1 (recommended: warning first, tighten later once false-positive
   rates are understood)?
5. Row/column caps and whether `analyze` needs a confirm gate above a threshold
   (mirroring `research_plan`), or a simple cap is enough.

## 10. Definition of done (Part A)

- A user can point OpenResearch at a local CSV, get a typed column profile,
  run describe/correlation/group-summary/OLS/t-test/trend, and have the report
  cite the results as `[A#]` alongside `[S#]`.
- Every reported number traces to a reproducible analysis record with a dataset
  hash and recorded parameters.
- All new tools enforce the `reports/` boundary and deny writes to read-only
  workers.
- Core and openresearch suites are green; eval harness reports analysis
  coverage.
