export * as ResearchReport from "./research-report"

import type { Record as EvidenceRecord } from "./research-evidence"

export const requiredSections = [
  "Question",
  "Scope and As-of Date",
  "Method",
  "Findings",
  "Counterevidence",
  "Limitations",
  "Source Register",
] as const

export type Validation = {
  valid: boolean
  errors: string[]
  warnings: string[]
  citationCoverage: number
  verifiedShare: number
  citedIds: string[]
  unresolvableIds: string[]
  uncitedConsequential: number
}

const heading = (text: string, name: string) =>
  new RegExp(`^#{1,6}\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im").test(text)

export function citedSourceIds(report: string) {
  const ids = new Set<string>()
  for (const match of report.matchAll(/\[(S\d+)\]/g)) {
    if (match[1]) ids.add(match[1])
  }
  return Array.from(ids)
}

// Hard-fail on missing required sections or citations that do not resolve to a ledger record.
export function validate(input: {
  report: string
  sources?: string
  html?: string
  evidence: EvidenceRecord[]
}): Validation {
  const errors: string[] = []
  const warnings: string[] = []

  for (const section of requiredSections) {
    if (!heading(input.report, section)) errors.push(`missing required section: ${section}`)
  }

  const known = new Set(input.evidence.map((record) => record.source_id))
  const citedIds = citedSourceIds(input.report)
  const unresolvableIds = citedIds.filter((id) => !known.has(id))
  for (const id of unresolvableIds) errors.push(`citation [${id}] has no matching evidence ledger record`)

  // An HTML rendition must not introduce citations absent from the markdown report.
  if (input.html !== undefined) {
    const htmlIds = citedSourceIds(input.html)
    const stray = htmlIds.filter((id) => !known.has(id))
    for (const id of stray) errors.push(`html citation [${id}] has no matching evidence ledger record`)
    const extra = htmlIds.filter((id) => !citedIds.includes(id))
    if (extra.length > 0) errors.push(`html cites source(s) absent from the report: ${extra.join(", ")}`)
  }

  const verified = input.evidence.filter((record) => record.verdict === "verified").length
  const verifiedShare = input.evidence.length === 0 ? 0 : verified / input.evidence.length

  const citedKnown = citedIds.filter((id) => known.has(id)).length
  const citationCoverage = citedIds.length === 0 ? 0 : citedKnown / citedIds.length

  const uncitedConsequential = input.evidence.filter(
    (record) => record.verdict === "verified" && !citedIds.includes(record.source_id),
  ).length
  if (uncitedConsequential > 0)
    errors.push(`${uncitedConsequential} verified evidence record(s) are not cited in the report`)

  const counterevidence = input.evidence.filter((record) => record.verdict === "contradicted").length
  if (counterevidence === 0) warnings.push("no contradicted records; confirm counterevidence was actually sought")

  if (input.evidence.length === 0) errors.push("evidence ledger is empty; no claim can be verified")
  if (verifiedShare < 0.5 && input.evidence.length > 0)
    warnings.push(`only ${Math.round(verifiedShare * 100)}% of evidence records are verified`)

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    citationCoverage,
    verifiedShare,
    citedIds,
    unresolvableIds,
    uncitedConsequential,
  }
}
