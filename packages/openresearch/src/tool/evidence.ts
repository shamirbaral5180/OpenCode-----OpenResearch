import { Effect, Schema } from "effect"
import * as path from "path"
import * as Tool from "./tool"
import { InstanceState } from "@/effect/instance-state"
import { FSUtil } from "@openresearch-ai/core/fs-util"
import { ResearchEvidence, AccessLevel, Verdict } from "@openresearch-ai/core/research-evidence"

export const Parameters = Schema.Struct({
  action: Schema.Literals(["add", "update", "list"]).annotate({
    description: "add a new source record, update an existing source_id (append-only), or list current records",
  }),
  topic: Schema.String.annotate({ description: "Report topic directory under reports/ that owns this ledger" }),
  source_id: Schema.optional(Schema.String).annotate({
    description: "Stable source ID such as S1 (required for add/update)",
  }),
  claim_id: Schema.optional(Schema.String).annotate({ description: "Claim ID such as C1 (required for add/update)" }),
  claim: Schema.optional(Schema.String).annotate({
    description: "The claim this source supports (required for add/update)",
  }),
  url: Schema.optional(Schema.String),
  doi: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  authors: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  year: Schema.optional(Schema.Number),
  container: Schema.optional(Schema.String),
  access_level: Schema.optional(Schema.Literals(AccessLevel)).annotate({
    description: "How much of the source was inspected",
  }),
  locator: Schema.optional(Schema.String).annotate({ description: "Page, section, or line locator for the evidence" }),
  quote: Schema.optional(Schema.String),
  verdict: Schema.optional(Schema.Literals(Verdict)).annotate({ description: "Verification status of the claim" }),
  confidence: Schema.optional(Schema.Literals(["low", "medium", "high"])),
  notes: Schema.optional(Schema.String),
})

type Metadata = {
  topic: string
  action: string
  count: number
  source_id?: string
  error?: string
}

const now = () => new Date().toISOString()

export const EvidenceTool = Tool.define<typeof Parameters, Metadata, FSUtil.Service>(
  "evidence",
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service

    return {
      description:
        "Maintain the append-only evidence ledger at reports/<topic>/evidence.jsonl. Record each source and the claim it supports with a stable source_id (S1, S2, ...) before relying on it. Adding a duplicate source_id is rejected; use update to supersede a record. This ledger is the source of truth for the final report's citations.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          // Permission rules are worktree-relative (see write/edit tools).
          const relative = path.relative(
            instance.worktree,
            path.join(instance.directory, "reports", params.topic, ResearchEvidence.ledgerFileName),
          )
          yield* ctx.ask({
            permission: "edit",
            patterns: [relative],
            always: [relative],
            metadata: { topic: params.topic },
          })

          const record = {
            source_id: params.source_id ?? "",
            claim_id: params.claim_id ?? "",
            claim: params.claim ?? "",
            source: {
              url: params.url,
              doi: params.doi,
              title: params.title,
              authors: params.authors,
              year: params.year,
              container: params.container,
              accessLevel: params.access_level ?? "full-text",
              retrievedAt: now(),
            },
            locator: params.locator,
            quote: params.quote,
            verdict: params.verdict ?? "unverified",
            confidence: params.confidence,
            notes: params.notes,
          }

          if (params.action === "list") {
            const current = yield* ResearchEvidence.read(fs, instance.directory, params.topic)
            const metadata: Metadata = { topic: params.topic, action: params.action, count: current.records.length }
            yield* ctx.metadata({ title: `ledger: ${current.records.length} records`, metadata })
            return {
              title: `${current.records.length} evidence records`,
              output: JSON.stringify({ records: current.records, errors: current.errors }, null, 2),
              metadata,
            }
          }

          if (!params.source_id || !params.claim_id || !params.claim) {
            const metadata: Metadata = {
              topic: params.topic,
              action: params.action,
              count: 0,
              error: "source_id, claim_id, and claim are required",
            }
            yield* ctx.metadata({ title: "evidence error", metadata })
            return { title: "evidence error", output: metadata.error ?? "", metadata }
          }

          const permitted = yield* ResearchEvidence.allowed(fs, instance.directory, params.topic)
          if (!permitted) {
            const metadata: Metadata = {
              topic: params.topic,
              action: params.action,
              count: 0,
              error: "topic resolves outside the active reports/ directory",
            }
            yield* ctx.metadata({ title: "evidence rejected", metadata })
            return { title: "evidence rejected", output: metadata.error ?? "", metadata }
          }

          const existing = yield* ResearchEvidence.read(fs, instance.directory, params.topic)
          if (params.action === "update" && !existing.records.some((item) => item.source_id === params.source_id)) {
            const metadata: Metadata = {
              topic: params.topic,
              action: params.action,
              count: existing.records.length,
              source_id: params.source_id,
              error: `source_id ${params.source_id} not found; use add`,
            }
            yield* ctx.metadata({ title: "evidence error", metadata })
            return { title: "evidence error", output: metadata.error ?? "", metadata }
          }

          const written = yield* ResearchEvidence.appendLine(fs, instance.directory, params.topic, record)
          if (!written.ok) {
            const metadata: Metadata = {
              topic: params.topic,
              action: params.action,
              count: existing.records.length,
              source_id: params.source_id,
              error: written.reason,
            }
            yield* ctx.metadata({ title: "evidence rejected", metadata })
            return { title: "evidence rejected", output: written.reason, metadata }
          }

          const metadata: Metadata = {
            topic: params.topic,
            action: params.action,
            count: existing.records.length + 1,
            source_id: params.source_id,
          }
          yield* ctx.metadata({ title: `ledger ${params.action} ${params.source_id}`, metadata })
          return {
            title: `ledger ${params.action}: ${params.source_id}`,
            output: JSON.stringify(
              {
                ok: true,
                source_id: params.source_id,
                path: ResearchEvidence.ledgerPath(instance.directory, params.topic),
              },
              null,
              2,
            ),
            metadata,
          }
        }).pipe(Effect.orDie),
    }
  }),
)
