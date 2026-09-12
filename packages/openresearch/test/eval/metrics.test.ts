import path from "path"
import { describe, expect, test } from "bun:test"
import { EvalMetrics } from "../../script/eval/metrics"
import type { Record as EvidenceRecord } from "@openresearch-ai/core/research-evidence"

const record = (id: string, verdict: EvidenceRecord["verdict"] = "verified"): EvidenceRecord => ({
  source_id: id,
  claim_id: "C1",
  claim: "a claim",
  source: { url: "https://example.org", accessLevel: "full-text", retrievedAt: "2026-01-01T00:00:00.000Z" },
  verdict,
})

const completeReport = [
  "## Question\nQ?",
  "## Scope and As-of Date\n2026.",
  "## Method\nSearched.",
  "## Findings\nClaim [S1].",
  "## Counterevidence\nCounter [S2].",
  "## Limitations\nNone.",
  "## Source Register\nSee sources.md.",
].join("\n\n")

describe("eval metrics", () => {
  test("scores a well-formed bundle as valid with full citation coverage", () => {
    const metrics = EvalMetrics.compute({
      report: completeReport,
      evidence: [record("S1"), record("S2", "contradicted")],
    })
    expect(metrics.reportValid).toBe(true)
    expect(metrics.citationCoverage).toBe(1)
    expect(metrics.uncitedConsequential).toBe(0)
  })

  test("penalizes fabricated citations and missing sections", () => {
    const metrics = EvalMetrics.compute({
      report: "## Question\nQ?\n\n## Findings\nClaim [S9].",
      evidence: [record("S1")],
    })
    expect(metrics.reportValid).toBe(false)
    expect(metrics.citationCoverage).toBe(0)
    expect(metrics.errors.length).toBeGreaterThan(0)
  })

  test("aggregate returns a zero summary for no cases", () => {
    const summary = EvalMetrics.aggregate([])
    expect(summary.count).toBe(0)
    expect(summary.citationCoverage).toBe(0)
  })

  test("fixture cases load and score without throwing", async () => {
    const directory = path.join(import.meta.dir, "../../script/eval/cases")
    const good = (await Bun.file(path.join(directory, "good/bundle.json")).json()) as {
      report: string
      evidence: EvidenceRecord[]
    }
    const fabricated = (await Bun.file(path.join(directory, "fabricated/bundle.json")).json()) as {
      report: string
      evidence: EvidenceRecord[]
    }
    expect(EvalMetrics.compute(good).reportValid).toBe(true)
    expect(EvalMetrics.compute(fabricated).reportValid).toBe(false)
  })
})
