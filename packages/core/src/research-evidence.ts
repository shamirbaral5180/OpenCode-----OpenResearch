export * as ResearchEvidence from "./research-evidence"

import path from "path"
import { Effect, Option, Schema } from "effect"
import { FSUtil } from "./fs-util"
import { ResearchArtifact } from "./research-artifact"

export const AccessLevel = ["full-text", "abstract", "snippet", "inaccessible"] as const
export type AccessLevel = (typeof AccessLevel)[number]

export const Verdict = ["verified", "partial", "unverified", "contradicted"] as const
export type Verdict = (typeof Verdict)[number]

export const SourceSchema = Schema.Struct({
  url: Schema.optional(Schema.String),
  doi: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  authors: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  year: Schema.optional(Schema.Number),
  container: Schema.optional(Schema.String),
  accessLevel: Schema.Literals(AccessLevel),
  retrievedAt: Schema.String,
})

export const RecordSchema = Schema.Struct({
  source_id: Schema.String,
  claim_id: Schema.String,
  claim: Schema.String,
  source: SourceSchema,
  locator: Schema.optional(Schema.String),
  quote: Schema.optional(Schema.String),
  verdict: Schema.Literals(Verdict),
  confidence: Schema.optional(Schema.Literals(["low", "medium", "high"] as const)),
  notes: Schema.optional(Schema.String),
})

export type Source = Schema.Schema.Type<typeof SourceSchema>
export type Record = Schema.Schema.Type<typeof RecordSchema>

const decodeRecord = Schema.decodeUnknownOption(RecordSchema)

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
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      errors.push(`line ${index + 1}: invalid JSON`)
      continue
    }
    const decoded = decodeRecord(value)
    if (Option.isNone(decoded)) {
      errors.push(`line ${index + 1}: record is missing required fields or has invalid values`)
      continue
    }
    records.push(decoded.value)
  }
  return { records, errors }
}

// The ledger is append-only on disk: updates are appended as new lines. Readers see the latest
// record for each source_id so a superseded verdict cannot keep counting in the report.
export function collapse(records: Record[]) {
  const latest = new Map<string, Record>()
  for (const record of records) latest.set(record.source_id, record)
  return Array.from(latest.values())
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
    const parsed = parse(text)
    return { records: collapse(parsed.records), errors: parsed.errors }
  })

export const appendLine = (
  fs: FSUtil.Interface,
  directory: string,
  topic: string,
  record: Record,
  action: "add" | "update" = "add",
) =>
  Effect.gen(function* () {
    const file = ledgerPath(directory, topic)
    const text = yield* fs.readFileStringSafe(file)
    const existing = text === undefined ? [] : parse(text).records
    const result = action === "update" ? update(existing, record) : append(existing, record)
    if (!result.ok) return result
    const prefix = text === undefined || text.length === 0 || text.endsWith("\n") ? "" : "\n"
    yield* fs.writeWithDirs(file, `${text ?? ""}${prefix}${serialize(record)}\n`)
    return result
  })
