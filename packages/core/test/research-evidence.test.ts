import fs from "fs/promises"
import path from "path"
import { expect, test } from "bun:test"
import { Effect } from "effect"
import { FSUtil } from "@openresearch-ai/core/fs-util"
import { LayerNode } from "@openresearch-ai/core/effect/layer-node"
import { ResearchEvidence } from "@openresearch-ai/core/research-evidence"
import { tmpdir } from "./fixture/tmpdir"

function withFs<A, E>(fn: (f: FSUtil.Interface) => Effect.Effect<A, E>) {
  return Effect.runPromise(
    Effect.gen(function* () {
      const filesystem = yield* FSUtil.Service
      return yield* fn(filesystem)
    }).pipe(Effect.provide(LayerNode.compile(FSUtil.node))),
  )
}

const record = (id: string): ResearchEvidence.Record => ({
  source_id: id,
  claim_id: "C1",
  claim: "a claim",
  source: { url: "https://example.org", accessLevel: "full-text", retrievedAt: "2026-01-01T00:00:00.000Z" },
  verdict: "verified",
})

test("parse ignores blank lines and reports invalid JSON without throwing", () => {
  const good = JSON.stringify(record("S1"))
  const result = ResearchEvidence.parse(`\n${good}\nnot json\n`)
  expect(result.records).toHaveLength(1)
  expect(result.errors).toHaveLength(1)
})

test("parse rejects records missing required fields and invalid values", () => {
  const good = JSON.stringify(record("S1"))
  const missing = JSON.stringify({ source_id: "S2" })
  const badVerdict = JSON.stringify({ ...record("S3"), verdict: "maybe" })
  const result = ResearchEvidence.parse(`\n${good}\n${missing}\n${badVerdict}\nnot json\n`)
  expect(result.records.map((item) => item.source_id)).toEqual(["S1"])
  expect(result.errors).toHaveLength(3)
})

test("collapse keeps the latest record for each source id", () => {
  const superseded: ResearchEvidence.Record = { ...record("S1"), verdict: "unverified" }
  const latest: ResearchEvidence.Record = { ...record("S1"), verdict: "verified" }
  const other = record("S2")
  expect(ResearchEvidence.collapse([superseded, latest, other])).toEqual([latest, other])
})

test("append rejects duplicate source ids and accepts new ones", () => {
  const existing = [record("S1")]
  expect(ResearchEvidence.append(existing, record("S1")).ok).toBe(false)
  expect(ResearchEvidence.append(existing, record("S2")).ok).toBe(true)
})

test("update requires an existing source id", () => {
  const existing = [record("S1")]
  expect(ResearchEvidence.update(existing, record("S2")).ok).toBe(false)
  expect(ResearchEvidence.update(existing, record("S1")).ok).toBe(true)
})

test("ledger path is confined to the active reports directory", async () => {
  await using dir = await tmpdir()
  const allowed = await withFs((f) => ResearchEvidence.allowed(f, dir.path, "topic"))
  expect(allowed).toBe(true)
  const escaped = await withFs((f) => ResearchEvidence.allowed(f, dir.path, "../outside"))
  expect(escaped).toBe(false)
})

test("appendLine writes newline-delimited JSON and rejects duplicates", async () => {
  await using dir = await tmpdir()
  await withFs((f) => ResearchEvidence.appendLine(f, dir.path, "topic", record("S1")))
  await withFs((f) => ResearchEvidence.appendLine(f, dir.path, "topic", record("S2")))
  const duplicate = await withFs((f) => ResearchEvidence.appendLine(f, dir.path, "topic", record("S1")))
  expect(duplicate.ok).toBe(false)

  const text = await fs.readFile(path.join(dir.path, "reports", "topic", "evidence.jsonl"), "utf8")
  const parsed = ResearchEvidence.parse(text)
  expect(parsed.records.map((item) => item.source_id)).toEqual(["S1", "S2"])
})

test("appendLine with update supersedes without a duplicate-add error", async () => {
  await using dir = await tmpdir()
  await withFs((f) => ResearchEvidence.appendLine(f, dir.path, "topic", record("S1")))
  const updated = await withFs((f) =>
    ResearchEvidence.appendLine(f, dir.path, "topic", { ...record("S1"), verdict: "contradicted" }, "update"),
  )
  expect(updated.ok).toBe(true)

  const text = await fs.readFile(path.join(dir.path, "reports", "topic", "evidence.jsonl"), "utf8")
  // The on-disk ledger stays append-only; the read projection collapses to the latest record.
  expect(ResearchEvidence.parse(text).records).toHaveLength(2)
  const read = await withFs((f) => ResearchEvidence.read(f, dir.path, "topic"))
  expect(read.records).toHaveLength(1)
  expect(read.records[0]?.verdict).toBe("contradicted")
})

test("appendLine with update rejects an unknown source id", async () => {
  await using dir = await tmpdir()
  const result = await withFs((f) =>
    ResearchEvidence.appendLine(f, dir.path, "topic", record("S9"), "update"),
  )
  expect(result.ok).toBe(false)
})
