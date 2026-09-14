import { describe, expect } from "bun:test"
import path from "path"
import { Effect } from "effect"
import { LayerNode } from "@openresearch-ai/core/effect/layer-node"
import { FSUtil } from "@openresearch-ai/core/fs-util"
import { Knowledge } from "@openresearch-ai/core/knowledge/knowledge"
import { Database } from "@openresearch-ai/core/database/database"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Truncate } from "@/tool/truncate"
import { Agent } from "../../src/agent/agent"
import { Permission } from "@/permission"
import { ReportWriteTool } from "../../src/tool/report-write"
import { EvidenceTool } from "../../src/tool/evidence"
import { SessionID, MessageID } from "../../src/session/schema"
import { InstanceState } from "../../src/effect/instance-state"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([
      FSUtil.node,
      EventV2Bridge.node,
      Truncate.node,
      Agent.node,
      Permission.node,
      Database.node,
      Knowledge.node,
    ]),
  ),
)

type AskInput = { permission: string; patterns: readonly string[]; always: readonly string[] }

const baseCtx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make("msg_test"),
  callID: "",
  agent: "research",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
}

type ToolCtx = typeof baseCtx & { ask: (input: AskInput) => Effect.Effect<void> }

const makeCtx = () => {
  const calls: AskInput[] = []
  const ctx: ToolCtx = {
    ...baseCtx,
    ask: (input) =>
      Effect.sync(() => {
        calls.push(input)
      }),
  }
  return { ctx, calls }
}

const report = [
  "## Question\nQ?",
  "## Scope and As-of Date\n2026.",
  "## Method\nSearched.",
  "## Findings\nClaim [S1].",
  "## Counterevidence\nCounter [S2].",
  "## Limitations\nNone.",
  "## Source Register\nSee sources.md.",
].join("\n\n")

describe("research artifact tool permissions", () => {
  it.instance("evidence asks with a worktree-relative edit pattern", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const instance = yield* InstanceState.context
      const { ctx, calls } = makeCtx()
      const info = yield* EvidenceTool
      const tool = yield* info.init()
      yield* tool.execute(
        { action: "add", topic: "topic", source_id: "S1", claim_id: "C1", claim: "c", access_level: "full-text" },
        ctx,
      )
      expect(calls).toHaveLength(1)
      expect(calls[0]!.permission).toBe("edit")
      const expected = path.relative(instance.worktree, path.join(test.directory, "reports", "topic", "evidence.jsonl"))
      expect(calls[0]!.patterns).toEqual([expected])
      // The pattern must be worktree-relative, never a bare reports/ prefix.
      expect(calls[0]!.patterns[0]!.replaceAll("\\", "/")).not.toBe("reports/topic/evidence.jsonl")
    }),
  )

  it.instance("report_write asks with a worktree-relative edit pattern", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const instance = yield* InstanceState.context
      const { ctx, calls } = makeCtx()
      const info = yield* ReportWriteTool
      const tool = yield* info.init()
      yield* tool.execute({ topic: "topic", report }, ctx).pipe(Effect.catchCause(() => Effect.void))
      expect(calls).toHaveLength(1)
      expect(calls[0]!.permission).toBe("edit")
      const expected = path.relative(instance.worktree, path.join(test.directory, "reports", "topic"))
      expect(calls[0]!.patterns).toEqual([expected])
      expect(calls[0]!.patterns[0]!.replaceAll("\\", "/")).not.toBe("reports/topic")
    }),
  )

  it.instance("evidence update supersedes an existing source without a duplicate-add error", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const info = yield* EvidenceTool
      const tool = yield* info.init()
      const input = { topic: "topic", source_id: "S1", claim_id: "C1", claim: "c", access_level: "full-text" } as const

      yield* tool.execute({ action: "add", ...input, verdict: "unverified" }, ctx)
      const updated = yield* tool.execute({ action: "update", ...input, verdict: "verified" }, ctx)
      const metadata = updated.metadata as { source_id?: string; error?: string }
      expect(metadata.error).toBeUndefined()
      expect(metadata.source_id).toBe("S1")

      const listed = yield* tool.execute({ action: "list", topic: "topic" }, ctx)
      const records = (JSON.parse(listed.output) as { records: readonly { source_id: string; verdict: string }[] })
        .records
      expect(records).toHaveLength(1)
      expect(records[0]?.verdict).toBe("verified")

      const ledger = yield* Effect.promise(() =>
        Bun.file(path.join(test.directory, "reports", "topic", "evidence.jsonl")).text(),
      )
      // On disk both records remain; the list projection collapses to the latest.
      expect(ledger.trim().split("\n")).toHaveLength(2)
    }),
  )

  it.instance("evidence populates the project knowledge graph idempotently", () =>
    Effect.gen(function* () {
      const { ctx } = makeCtx()
      const instance = yield* InstanceState.context
      const info = yield* EvidenceTool
      const tool = yield* info.init()
      const knowledge = yield* Knowledge.Service
      const input = {
        topic: "topic",
        source_id: "S1",
        claim_id: "C1",
        claim: "Troy waives tuition for some graduate scholarships",
        access_level: "full-text",
        title: "Scholarships",
        doi: "10.1/troy",
      } as const

      yield* tool.execute({ action: "add", ...input, verdict: "unverified" }, ctx)
      yield* tool.execute({ action: "update", ...input, verdict: "verified", confidence: "high" }, ctx)

      const claims = yield* knowledge.listClaims({ projectID: instance.project.id })
      expect(claims).toHaveLength(1)
      expect(claims[0]!.status).toBe("verified")
      expect(claims[0]!.origin_key).toBe("topic:S1:C1")

      const publications = (yield* knowledge.listEntities(instance.project.id)).filter(
        (entity) => entity.kind === "publication",
      )
      expect(publications).toHaveLength(1)
      const neighbors = yield* knowledge.neighbors({ projectID: instance.project.id, nodeId: claims[0]!.id })
      expect(neighbors).toHaveLength(1)
    }),
  )

  it.instance("report_write writes a single self-contained html page after validation", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const evidenceInfo = yield* EvidenceTool
      const evidence = yield* evidenceInfo.init()
      for (const id of ["S1", "S2"]) {
        yield* evidence.execute(
          { action: "add", topic: "topic", source_id: id, claim_id: "C1", claim: "c", access_level: "full-text" },
          ctx,
        )
      }
      const info = yield* ReportWriteTool
      const tool = yield* info.init()
      const result = yield* tool.execute({ topic: "topic", report }, ctx)
      const metadata = result.metadata as { written: boolean; errors: string[] }
      expect(metadata.errors).toEqual([])
      expect(metadata.written).toBe(true)
      const dir = path.join(test.directory, "reports", "topic")
      const files = yield* Effect.promise(async () => ({
        md: await Bun.file(path.join(dir, "report.md")).exists(),
        sources: await Bun.file(path.join(dir, "sources.md")).exists(),
        html: await Bun.file(path.join(dir, "report.html")).exists(),
        htmlText: await Bun.file(path.join(dir, "report.html")).text(),
      }))
      expect(files.md).toBe(false)
      expect(files.sources).toBe(false)
      expect(files.html).toBe(true)
      expect(files.htmlText.startsWith("<!DOCTYPE html>")).toBe(true)
      expect(files.htmlText).toContain("S1")
    }),
  )

  it.instance("report_write rejects a corrupt evidence ledger line", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const evidenceInfo = yield* EvidenceTool
      const evidence = yield* evidenceInfo.init()
      for (const id of ["S1", "S2"]) {
        yield* evidence.execute(
          { action: "add", topic: "topic", source_id: id, claim_id: "C1", claim: "c", access_level: "full-text" },
          ctx,
        )
      }
      const ledger = path.join(test.directory, "reports", "topic", "evidence.jsonl")
      const content = yield* Effect.promise(() => Bun.file(ledger).text())
      yield* Effect.promise(() => Bun.write(ledger, `${content}{"source_id":"broken"}\n`))

      const info = yield* ReportWriteTool
      const tool = yield* info.init()
      const result = yield* tool.execute({ topic: "topic", report }, ctx)
      const metadata = result.metadata as { written: boolean; errors: string[] }
      expect(metadata.written).toBe(false)
      expect(metadata.errors.some((error) => error.includes("evidence ledger"))).toBe(true)
      expect(
        yield* Effect.promise(() => Bun.file(path.join(test.directory, "reports", "topic", "report.html")).exists()),
      ).toBe(false)
    }),
  )
})
