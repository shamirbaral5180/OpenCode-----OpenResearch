export * as ResearchReport from "./research-report"

import { marked } from "marked"
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

// The single deliverable is one self-contained HTML page rendered from the report
// markdown. Rendering here means the citation set and required headings can be
// checked on the exact bytes that get written.
export function renderReportHtml(input: {
  report: string
  evidence: EvidenceRecord[]
  title?: string
  searchLog?: string
}) {
  const markdown = injectSourceRegister(input.report, input.evidence)
  const body = marked.parse(markdown, { async: false, gfm: true })
  const search = input.searchLog
    ? `<section data-appendix="search-log"><h2>Search Log</h2>${marked.parse(input.searchLog, { async: false, gfm: true })}</section>\n`
    : ""
  const title = escapeHtml(input.title ?? "Research report")
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
:root { color-scheme: light dark; }
body { margin: 0 auto; max-width: 52rem; padding: 2.5rem 1.25rem 4rem; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #1f2328; background: #ffffff; }
h1, h2, h3, h4 { line-height: 1.25; margin: 2rem 0 0.75rem; }
h1 { font-size: 1.85rem; }
h2 { font-size: 1.35rem; padding-bottom: 0.3rem; border-bottom: 1px solid #d8dee4; }
h3 { font-size: 1.1rem; }
p, ul, ol, blockquote, table, pre { margin: 0 0 1rem; }
a { color: #0969da; }
code { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace; font-size: 0.9em; background: #f6f8fa; padding: 0.15em 0.35em; border-radius: 4px; }
pre { background: #f6f8fa; padding: 1rem; overflow: auto; border-radius: 6px; }
pre code { background: none; padding: 0; }
blockquote { border-left: 4px solid #d0d7de; margin-left: 0; padding-left: 1rem; color: #57606a; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #d0d7de; padding: 0.4rem 0.6rem; text-align: left; }
th { background: #f6f8fa; }
hr { border: none; border-top: 1px solid #d8dee4; margin: 2rem 0; }
@media (prefers-color-scheme: dark) {
  body { color: #e6edf3; background: #0d1117; }
  h2 { border-bottom-color: #30363d; }
  a { color: #4493f8; }
  code, pre, th { background: #161b22; }
  blockquote { border-left-color: #30363d; color: #8b949e; }
  th, td { border-color: #30363d; }
  hr { border-top-color: #30363d; }
}
</style>
</head>
<body>
${body}${search}</body>
</html>
`
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

// The source register is generated from the ledger, never from the model, so the
// report cannot invent, omit, or misattribute a source. Its body is injected under
// the report's existing "Source Register" heading before rendering.
export function sourceRegisterBody(records: EvidenceRecord[]) {
  if (records.length === 0) return "_No evidence records._"
  return records
    .map((record) => {
      const parts = [`### ${record.source_id}`, ""]
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
      return parts.join("\n")
    })
    .join("\n\n")
}

export function injectSourceRegister(report: string, records: EvidenceRecord[]) {
  const body = sourceRegisterBody(records)
  // Match the "Source Register" heading and everything up to the next heading or end of
  // input. `(?![\s\S])` anchors end-of-input; a bare `$` under the `m` flag would stop at
  // the end of the heading's own line.
  const pattern = new RegExp(`^(#{1,6}\\s+Source Register\\s*)\\n([\\s\\S]*?)(?=^#{1,6}\\s|(?![\\s\\S]))`, "m")
  if (pattern.test(report)) return report.replace(pattern, (_match, heading: string) => `${heading}\n\n${body}\n`)
  return `${report.trimEnd()}\n\n## Source Register\n\n${body}\n`
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

  // An HTML rendition must cite exactly the same sources as the markdown report:
  // no unknown IDs, no IDs the report does not cite, and no report citations missing from the HTML.
  if (input.html !== undefined) {
    const htmlIds = citedSourceIds(input.html)
    const stray = htmlIds.filter((id) => !known.has(id))
    for (const id of stray) errors.push(`html citation [${id}] has no matching evidence ledger record`)
    const extra = htmlIds.filter((id) => !citedIds.includes(id))
    if (extra.length > 0) errors.push(`html cites source(s) absent from the report: ${extra.join(", ")}`)
    const missing = citedIds.filter((id) => !htmlIds.includes(id))
    if (missing.length > 0) errors.push(`html is missing citation(s) present in the report: ${missing.join(", ")}`)
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
