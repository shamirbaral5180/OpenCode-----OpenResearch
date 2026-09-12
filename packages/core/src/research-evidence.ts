export * as ResearchEvidence from "./research-evidence"

import path from "path"
import { Effect } from "effect"
import { FSUtil } from "./fs-util"
import { ResearchArtifact } from "./research-artifact"

export const AccessLevel = ["full-text", "abstract", "snippet", "inaccessible"] as const
export type AccessLevel = (typeof AccessLevel)[number]

export const Verdict = ["verified", "partial", "unverified", "contradicted"] as const
export type Verdict = (typeof Verdict)[number]

export type Source = {
  url?: string
  doi?: string
  title?: string
  authors?: string[]
  year?: number
  container?: string
  accessLevel: AccessLevel
  retrievedAt: string
}

export type Record = {
  source_id: string
  claim_id: string
  claim: string
  source: Source
  locator?: string
  quote?: string
  verdict: Verdict
  confidence?: "low" | "medium" | "high"
  notes?: string
}

export const ledgerFileName = "evidence.jsonl"

export function ledgerPath(directory: string, topic: string) {
  return path.join(directory, "reports", topic, ledgerFileName)
}

// Confine ledger writes to reports/. Never trust a caller-supplied topic to escape the directory.
export const allowed = (fs: FSUtil.Interface, directory: string, topic: string) =>
  ResearchArtifact.allowed(fs, directory, ledgerPath(directory, topic))

export function parse(text: string): { records: Record[]; errors: string[] } {
  const records: Record[] = []
  const errors: string[] = []
  const lines = text.split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]?.trim()
    if (!line) continue
    try {
      const value = JSON.parse(line)
      if (value && typeof value === "object" && !Array.isArray(value)) records.push(value as Record)
      else errors.push(`line ${index + 1}: not an object`)
    } catch {
      errors.push(`line ${index + 1}: invalid JSON`)
    }
  }
  return { records, errors }
}

export function serialize(record: Record) {
  return JSON.stringify(record)
}

// Append-only: re-adding an existing source_id is rejected so a model cannot silently rewrite evidence.
export function append(existing: Record[], record: Record) {
  const duplicate = existing.find((item) => item.source_id === record.source_id)
  if (duplicate) {
    return { ok: false as const, reason: `source_id ${record.source_id} already exists; use update instead` }
  }
  return { ok: true as const, record }
}

export function update(existing: Record[], record: Record) {
  const found = existing.some((item) => item.source_id === record.source_id)
  if (!found) {
    return { ok: false as const, reason: `source_id ${record.source_id} does not exist; use add first` }
  }
  return { ok: true as const, record }
}

export const read = (fs: FSUtil.Interface, directory: string, topic: string) =>
  Effect.gen(function* () {
    const file = ledgerPath(directory, topic)
    const text = yield* fs.readFileStringSafe(file)
    if (text === undefined) return { records: [] as Record[], errors: [] as string[] }
    return parse(text)
  })

export const appendLine = (fs: FSUtil.Interface, directory: string, topic: string, record: Record) =>
  Effect.gen(function* () {
    const file = ledgerPath(directory, topic)
    const text = yield* fs.readFileStringSafe(file)
    const existing = text === undefined ? [] : parse(text).records
    const result = append(existing, record)
    if (!result.ok) return result
    const prefix = text === undefined || text.length === 0 || text.endsWith("\n") ? "" : "\n"
    yield* fs.writeWithDirs(file, `${text ?? ""}${prefix}${serialize(record)}\n`)
    return result
  })
