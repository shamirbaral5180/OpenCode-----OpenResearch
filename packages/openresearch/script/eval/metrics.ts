export * as EvalMetrics from "./metrics"

import { ResearchReport } from "@openresearch-ai/core/research-report"
import { ResearchEvidence } from "@openresearch-ai/core/research-evidence"

export type Bundle = {
  report: string
  evidence: ResearchEvidence.Record[]
  expectedSubquestions?: string[]
}

export type Metrics = {
  citationCoverage: number
  verifiedShare: number
  reportValid: boolean
  errors: string[]
  warnings: string[]
  uncitedConsequential: number
  subquestionCoverage: number
}

// Deterministic metrics only. No model judgment, so runs are comparable across versions.
export function compute(bundle: Bundle): Metrics {
  const validation = ResearchReport.validate({ report: bundle.report, evidence: bundle.evidence })
  return {
    citationCoverage: round(validation.citationCoverage),
    verifiedShare: round(validation.verifiedShare),
    reportValid: validation.valid,
    errors: validation.errors,
    warnings: validation.warnings,
    uncitedConsequential: validation.uncitedConsequential,
    subquestionCoverage: subquestionCoverage(bundle.report, bundle.expectedSubquestions ?? []),
  }
}

const STOPWORDS = new Set([
  "what",
  "when",
  "where",
  "which",
  "does",
  "with",
  "that",
  "this",
  "these",
  "those",
  "from",
  "into",
  "over",
  "under",
  "between",
  "there",
  "their",
  "have",
  "been",
  "were",
  "will",
  "would",
  "could",
  "should",
  "about",
  "than",
  "then",
  "them",
  "they",
  "are",
  "the",
  "and",
  "for",
  "why",
  "how",
])

function subquestionCoverage(report: string, subquestions: string[]) {
  if (subquestions.length === 0) return 1
  const haystack = report.toLowerCase()
  const covered = subquestions.filter((question) => {
    const tokens = question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2 && !STOPWORDS.has(token))
    if (tokens.length === 0) return false
    const hits = tokens.filter((token) => haystack.includes(token)).length
    return hits / tokens.length >= 0.6
  }).length
  return round(covered / subquestions.length)
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
}

export function aggregate(metrics: Metrics[]) {
  if (metrics.length === 0) {
    return { count: 0, citationCoverage: 0, verifiedShare: 0, subquestionCoverage: 0, validRate: 0 }
  }
  const mean = (pick: (metric: Metrics) => number) =>
    round(metrics.reduce((sum, metric) => sum + pick(metric), 0) / metrics.length)
  return {
    count: metrics.length,
    citationCoverage: mean((metric) => metric.citationCoverage),
    verifiedShare: mean((metric) => metric.verifiedShare),
    subquestionCoverage: mean((metric) => metric.subquestionCoverage),
    validRate: mean((metric) => (metric.reportValid ? 1 : 0)),
  }
}
