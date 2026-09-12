import { describe, expect, test } from "bun:test"
import { ResearchReport } from "@openresearch-ai/core/research-report"
import type { Record as EvidenceRecord } from "@openresearch-ai/core/research-evidence"

const record = (id: string, verdict: EvidenceRecord["verdict"] = "verified"): EvidenceRecord => ({
  source_id: id,
  claim_id: "C1",
  claim: "a claim",
  source: { url: "https://example.org", accessLevel: "full-text", retrievedAt: "2026-01-01T00:00:00.000Z" },
  verdict,
})

const report = (overrides: { findings?: string; omit?: string } = {}) => {
  const sections: Array<[string, string]> = [
    ["Question", "What is X?"],
    ["Scope and As-of Date", "As of 2026."],
    ["Method", "Searched indexes."],
    ["Findings", overrides.findings ?? "X is true [S1]."],
    ["Counterevidence", "No strong counterevidence [S2]."],
    ["Limitations", "Limited coverage."],
    ["Source Register", "See sources.md."],
  ]
  return sections
    .filter(([name]) => name !== overrides.omit)
    .map(([name, body]) => `## ${name}\n${body}`)
    .join("\n\n")
}

describe("research report validation", () => {
  test("accepts a report whose citations resolve to the ledger", () => {
    const result = ResearchReport.validate({
      report: report(),
      evidence: [record("S1"), record("S2", "contradicted")],
    })
    expect(result.valid).toBe(true)
    expect(result.unresolvableIds).toEqual([])
    expect(result.citationCoverage).toBe(1)
  })

  test("hard-fails on a missing required section", () => {
    const result = ResearchReport.validate({
      report: report({ omit: "Counterevidence" }),
      evidence: [record("S1")],
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.includes("Counterevidence"))).toBe(true)
  })

  test("hard-fails on an unresolvable citation", () => {
    const result = ResearchReport.validate({
      report: report({ findings: "X is true [S9]." }),
      evidence: [record("S1"), record("S2", "contradicted")],
    })
    expect(result.valid).toBe(false)
    expect(result.unresolvableIds).toContain("S9")
  })

  test("hard-fails when verified evidence is not cited", () => {
    const result = ResearchReport.validate({
      report: report(),
      evidence: [record("S1"), record("S2", "contradicted"), record("S3")],
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.includes("not cited"))).toBe(true)
  })

  test("hard-fails on an empty ledger", () => {
    const result = ResearchReport.validate({ report: report({ findings: "X." }), evidence: [] })
    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.includes("ledger is empty"))).toBe(true)
  })

  test("warns, but does not fail, when no counterevidence exists", () => {
    const result = ResearchReport.validate({
      report: report(),
      evidence: [record("S1"), record("S2")],
    })
    expect(result.valid).toBe(true)
    expect(result.warnings.some((warning) => warning.includes("counterevidence"))).toBe(true)
  })

  test("accepts an html companion that cites the same sources as the report", () => {
    const result = ResearchReport.validate({
      report: report(),
      html: "<p>X is true [S1].</p><p>Counter [S2].</p>",
      evidence: [record("S1"), record("S2", "contradicted")],
    })
    expect(result.valid).toBe(true)
  })

  test("hard-fails when html cites a source absent from the report", () => {
    const result = ResearchReport.validate({
      report: report(),
      html: "<p>X [S1] plus [S3].</p>",
      evidence: [record("S1"), record("S2", "contradicted")],
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.includes("html cites source"))).toBe(true)
  })

  test("hard-fails when html cites an unknown ledger source", () => {
    const result = ResearchReport.validate({
      report: report(),
      html: "<p>X [S1] and [S9].</p>",
      evidence: [record("S1"), record("S2", "contradicted")],
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.includes("html citation [S9]"))).toBe(true)
  })
})
