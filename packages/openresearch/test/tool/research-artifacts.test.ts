import { describe, expect } from "bun:test"
import path from "path"
import { Effect } from "effect"
import { LayerNode } from "@openresearch-ai/core/effect/layer-node"
import { FSUtil } from "@openresearch-ai/core/fs-util"
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
  LayerNode.compile(LayerNode.group([FSUtil.node, EventV2Bridge.node, Truncate.node, Agent.node, Permission.node])),
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

  it.instance("report_write writes report, sources, and html after validation", () =>
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
      const result = yield* tool.execute({ topic: "topic", report, html: "<p>Claim [S1]. Counter [S2].</p>" }, ctx)
      const metadata = result.metadata as { written: boolean; errors: string[] }
      expect(metadata.errors).toEqual([])
      expect(metadata.written).toBe(true)
      const dir = path.join(test.directory, "reports", "topic")
      const files = yield* Effect.promise(async () => ({
        report: await Bun.file(path.join(dir, "report.md")).exists(),
        sources: await Bun.file(path.join(dir, "sources.md")).exists(),
        html: await Bun.file(path.join(dir, "report.html")).exists(),
        sourcesText: await Bun.file(path.join(dir, "sources.md")).text(),
      }))
      expect(files.report).toBe(true)
      expect(files.sources).toBe(true)
      expect(files.html).toBe(true)
      expect(files.sourcesText).toContain("S1")
    }),
  )
})
