# Locked research policy

OpenResearch owns research behavior in source code. Settings displays effective backend values as selectable, read-only text, including the full prompt, role prompts, tool rules, generation parameters and compaction settings. There are no save/reset controls for these values.

## Enforcement

- `core/src/plugin/research.ts` defines the research workflow, evidence and citation requirements, internal roles and reviewed external retrieval operations.
- `core/src/v1/research-policy.ts` normalizes legacy configuration after merging and rejects writes to agent, instruction, permission, tool, memory and skill fields. Existing saved overrides are ignored without deleting the user's configuration. Provider connections and the session's model remain independently selectable.
- Legacy agent lookup exposes only research, research-scout, research-reviewer, title, summary and compaction. Core agent lookup materializes those same application-owned roles independently of plugin/config agent transformations. Unknown and coding agents cannot resolve; the V2 runner rejects missing agents before tool materialization.
- Tool permissions default to deny. Built-in retrieval is allowed; the explicit external retrieval list requires permission. Shells, generic execution wrappers, unreviewed MCP actions and remote mutation actions are denied. Review roles cannot write or delegate. Session permission overrides cannot widen legacy tool execution permissions. Existing approvals cannot override a deny.
- Report writes must remain inside the active directory's `reports/`, checked against both lexical paths and canonical existing ancestors. Traversal and symlink/junction escapes are rejected. These checks do not provide an OS sandbox against another process changing filesystem links concurrently.
- Legacy model requests reassert the research policy after system hooks and exclude the per-request system override. Automatic workspace instructions and skill guidance are excluded from the legacy research turn. Core places the internal policy after contextual baseline text. Native and AI SDK paths share legacy request preparation.
- Both compaction paths preserve evidence metadata, claim/source links, contradictions, access limits and continuation gaps. Legacy memory settings retain eight recent turns and 16,000 recent tokens; Core uses its native token-based compaction with 16,000 retained tokens and its existing buffer. Sampling support remains provider/runtime-dependent.

## Research quality procedure

The model is instructed to scope the question, plan subquestions, route to appropriate source tools, inspect primary content, record stable source IDs and claim mappings, investigate counterevidence, and audit citations before synthesis. It must label inaccessible sources, single-source claims, calculations, inferences, uncertainty, and incomplete coverage. A search hit or subagent assertion is not verified evidence.

## Verifiable research mode (v2)

Enforcement is no longer prompt-only. The system provides deterministic checks and keeps a machine-checkable evidence trail.

- Verification tools: `resolve_doi` (Crossref/OpenAlex metadata and retraction flags), `check_url` (reachability and status), `verify_quote` (exact then conservative fuzzy quotation match, `unavailable` on unreadable pages), and `verify_citation` (composite verdict: verified, partial, unverified). See `packages/openresearch/src/tool/verification.ts` for the shared normalization and matching helpers.
- Evidence ledger: `core/src/research-evidence.ts` defines an append-only `reports/<topic>/evidence.jsonl`. Records carry a stable `source_id`, claim mapping, access level, locator, quote, verdict, and confidence. Duplicate `source_id` adds are rejected; `update` supersedes instead of rewriting. The `evidence` tool is the only writer and is confined to `reports/`.
- Report enforcement: `core/src/research-report.ts` hard-fails a report when a required section is missing, a `[S#]` citation has no ledger record, or verified evidence is uncited. The `report_write` tool is the enforcement chokepoint: it validates before writing, generates `sources.md` from the ledger (never from the model), and refuses invalid writes so the model must fix them. Required sections: Question, Scope and As-of Date, Method, Findings, Counterevidence, Limitations, Source Register.
- Enforced audit pass: with `OPENRESEARCH_RESEARCH_AUDIT=enforced`, the primary research agent receives one bounded verification turn before finalizing that must resolve DOIs, check URLs, verify quotes, update the ledger, and finalize only through `report_write`. Default is `assisted` (no forced turn); `off` disables it.
- Config read projection: `ResearchPolicy.effective()` is applied only at the HTTP read boundary (instance and global config GET) so Settings shows the locked policy. Internal `Config.Service` reads stay raw, and `assertWritable` still rejects writes to research-owned fields.

These are deterministic checks plus recorded evidence, not a truth validator. They catch fabricated DOIs, dead links, quote mismatches, and missing or uncited evidence. They do not make the model smarter and do not guarantee factual truth.

## Evaluation harness

`packages/openresearch/script/eval/run.ts` computes deterministic metrics over fixture report bundles (`script/eval/cases/*/bundle.json`): citation coverage, verified share, report validity, uncited-consequential count, and subquestion coverage. `script/eval/metrics.json` records the latest run so versions are comparable. The harness is network-free; richer live-network or human-rated suites are out of scope.

## Design reference

Reviewed the public Codex prompt at https://github.com/openai/codex/blob/main/codex-rs/core/gpt_5_codex_prompt.md for explicit tool-selection, planning and completion rules. Research-specific behavior is implemented locally; no upstream code or installer is fetched into the application.

## Focused checks

- From `packages/core`: `bun test test/agent.test.ts test/research-policy.test.ts test/research-artifact.test.ts test/research-evidence.test.ts test/research-report.test.ts`
- From `packages/openresearch`: `bun test --timeout 30000 test/agent/agent.test.ts test/agent/research-locked.test.ts test/tool/verification.test.ts test/eval/metrics.test.ts test/config/config.test.ts test/config/v2-compat.test.ts`
- From `packages/openresearch`: `bun run script/eval/run.ts`
- Run `bun typecheck` from `packages/core`, `packages/openresearch`, `packages/app` and `packages/desktop`.
