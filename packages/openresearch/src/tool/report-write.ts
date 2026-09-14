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
    description:
      "Full report markdown. Must include required sections and cite ledger source IDs like [S1]. This is rendered into the final HTML page.",
  }),
  search_log: Schema.optional(Schema.String).annotate({
    description: "Optional search-log markdown: queries tried, tools used, failures. Rendered into the HTML page as an appendix.",
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
        "Validate and write the research report as a single self-contained HTML page under reports/<topic>/. The tool reads the evidence ledger, rejects the write when required sections are missing or any [S#] citation has no ledger record, and generates the Source Register from the ledger (not from the model). The report is rendered to report.html; no markdown or text file is written. Retry after fixing the reported errors. Never bypass it with a raw file write for the final report.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          // Permission rules are worktree-relative (see write/edit tools).
          const relative = path.relative(instance.worktree, path.join(instance.directory, "reports", params.topic))
          yield* ctx.ask({
            permission: "edit",
            patterns: [relative],
            always: [relative],
            metadata: { topic: params.topic },
          })

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
          const validation = ResearchReport.validate({
            report: params.report,
            evidence: evidence.records,
          })

          // A corrupt ledger line must block the write: report validation only sees successfully
          // parsed records, so unparsed lines would otherwise be silently dropped.
          for (const error of evidence.errors) validation.errors.push(`evidence ledger: ${error}`)
          if (evidence.errors.length > 0) validation.valid = false

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
          const reportPath = path.join(target, "report.html")
          const html = ResearchReport.renderReportHtml({
            report: params.report,
            evidence: evidence.records,
            title: `Research report: ${base}`,
            searchLog: params.search_log,
          })

          yield* fs.writeWithDirs(reportPath, html)

          yield* events.publish(FileSystem.Event.Edited, { file: reportPath })
          yield* events.publish(Watcher.Event.Updated, { file: reportPath, event: "add" })

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
      const hasReport = yield* fs.existsSafe(path.join(candidate, "report.html"))
      // A directory that exists without a report.html holds the working evidence ledger;
      // write the report alongside it. Only bump the number when a report already exists,
      // so existing reports are never overwritten and the ledger stays in the same folder.
      if (!hasReport) return candidate
    }
    return yield* Effect.die(new Error(`no free report directory for topic: ${topic}`))
  })
