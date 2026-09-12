import { Effect, Schema } from "effect"
import * as path from "path"
import * as Tool from "./tool"
import { InstanceState } from "@/effect/instance-state"
import { FSUtil } from "@openresearch-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { FileSystem } from "@openresearch-ai/core/filesystem"
import { Watcher } from "@openresearch-ai/core/filesystem/watcher"
import { ResearchEvidence } from "@openresearch-ai/core/research-evidence"
import { ResearchReport } from "@openresearch-ai/core/research-report"

export const Parameters = Schema.Struct({
  topic: Schema.String.annotate({ description: "Topic directory under reports/ to write into" }),
  report: Schema.String.annotate({
    description: "Full report markdown. Must include required sections and cite ledger source IDs like [S1].",
  }),
  search_log: Schema.optional(Schema.String).annotate({
    description: "Optional search-log markdown: queries tried, tools used, failures.",
  }),
})

type Metadata = {
  topic: string
  directory?: string
  written: boolean
  valid: boolean
  errors: string[]
  warnings: string[]
  citationCoverage: number
  verifiedShare: number
}

export const ReportWriteTool = Tool.define<typeof Parameters, Metadata, FSUtil.Service | EventV2Bridge.Service>(
  "report_write",
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service

    return {
      description:
        "Validate and write a research report bundle under reports/<topic>/. The tool reads the evidence ledger, rejects the write when required sections are missing or any [S#] citation has no ledger record, and generates sources.md from the ledger (not from the model). Retry after fixing the reported errors. Never bypass it with a raw file write for the final report.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "edit",
            patterns: [path.join("reports", params.topic)],
            always: ["*"],
            metadata: { topic: params.topic },
          })

          const instance = yield* InstanceState.context
          const permitted = yield* ResearchEvidence.allowed(fs, instance.directory, params.topic)
          if (!permitted) {
            const metadata: Metadata = {
              topic: params.topic,
              written: false,
              valid: false,
              errors: ["topic resolves outside the active reports/ directory"],
              warnings: [],
              citationCoverage: 0,
              verifiedShare: 0,
            }
            yield* ctx.metadata({ title: "report_write rejected", metadata })
            return { title: "report_write rejected", output: JSON.stringify(metadata, null, 2), metadata }
          }

          const evidence = yield* ResearchEvidence.read(fs, instance.directory, params.topic)
          const validation = ResearchReport.validate({ report: params.report, evidence: evidence.records })

          if (!validation.valid) {
            const metadata: Metadata = {
              topic: params.topic,
              written: false,
              valid: false,
              errors: validation.errors,
              warnings: validation.warnings,
              citationCoverage: validation.citationCoverage,
              verifiedShare: validation.verifiedShare,
            }
            yield* ctx.metadata({ title: `report invalid: ${validation.errors.length} error(s)`, metadata })
            return { title: "report validation failed", output: JSON.stringify(metadata, null, 2), metadata }
          }

          const target = yield* uniqueTopicDir(fs, instance.directory, params.topic)
          const base = path.basename(target)
          const reportPath = path.join(target, "report.md")
          const sourcesPath = path.join(target, "sources.md")

          yield* fs.writeWithDirs(reportPath, params.report.endsWith("\n") ? params.report : `${params.report}\n`)
          yield* fs.writeWithDirs(sourcesPath, renderSources(evidence.records))
          if (params.search_log !== undefined) {
            const logPath = path.join(target, "search-log.md")
            yield* fs.writeWithDirs(
              logPath,
              params.search_log.endsWith("\n") ? params.search_log : `${params.search_log}\n`,
            )
          }

          for (const file of [reportPath, sourcesPath]) {
            yield* events.publish(FileSystem.Event.Edited, { file })
            yield* events.publish(Watcher.Event.Updated, { file, event: "add" })
          }

          const metadata: Metadata = {
            topic: base,
            directory: target,
            written: true,
            valid: true,
            errors: [],
            warnings: validation.warnings,
            citationCoverage: validation.citationCoverage,
            verifiedShare: validation.verifiedShare,
          }
          yield* ctx.metadata({ title: `report written: ${base}`, metadata })
          return {
            title: `report written: ${base}`,
            output: JSON.stringify(
              {
                ok: true,
                report: reportPath,
                sources: sourcesPath,
                warnings: validation.warnings,
                citationCoverage: validation.citationCoverage,
                verifiedShare: validation.verifiedShare,
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

const uniqueTopicDir = (fs: FSUtil.Interface, directory: string, topic: string) =>
  Effect.gen(function* () {
    const root = path.join(directory, "reports")
    for (let index = 1; index < 1000; index++) {
      const candidate = index === 1 ? path.join(root, topic) : path.join(root, `${topic}-${index}`)
      const exists = yield* fs.existsSafe(candidate)
      if (!exists) return candidate
    }
    return yield* Effect.die(new Error(`no free report directory for topic: ${topic}`))
  })

function renderSources(records: ResearchEvidence.Record[]) {
  const lines = ["# Source Register", ""]
  lines.push("Generated from the evidence ledger. Do not edit by hand.", "")
  if (records.length === 0) lines.push("_No evidence records._")
  for (const record of records) {
    const parts = [`## ${record.source_id}`, ""]
    if (record.source.title) parts.push(`- Title: ${record.source.title}`)
    if (record.source.authors?.length) parts.push(`- Authors: ${record.source.authors.join(", ")}`)
    if (record.source.year !== undefined) parts.push(`- Year: ${record.source.year}`)
    if (record.source.container) parts.push(`- Venue: ${record.source.container}`)
    if (record.source.doi) parts.push(`- DOI: ${record.source.doi}`)
    if (record.source.url) parts.push(`- URL: ${record.source.url}`)
    parts.push(`- Access: ${record.source.accessLevel}`)
    parts.push(`- Retrieved: ${record.source.retrievedAt}`)
    parts.push(`- Verdict: ${record.verdict}`)
    if (record.locator) parts.push(`- Locator: ${record.locator}`)
    if (record.quote) parts.push(`- Quote: "${record.quote}"`)
    if (record.claim) parts.push(`- Supports ${record.claim_id}: ${record.claim}`)
    if (record.notes) parts.push(`- Notes: ${record.notes}`)
    lines.push(parts.join("\n"), "")
  }
  return `${lines.join("\n").trimEnd()}\n`
}
