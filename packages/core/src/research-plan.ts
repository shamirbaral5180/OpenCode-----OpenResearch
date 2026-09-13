export * as ResearchPlan from "./research-plan"

import { Schema } from "effect"

// Durable marker for an approved multi-agent research plan. Stored in the root
// research session's metadata so the task chokepoint can enforce the gate.
export const metadataKey = "research_plan"

export const Subquestion = Schema.Struct({
  question: Schema.String,
  agents: Schema.optional(Schema.Array(Schema.String)),
})
export type Subquestion = Schema.Schema.Type<typeof Subquestion>

export const Proposal = Schema.Struct({
  question: Schema.String,
  subquestions: Schema.Array(Subquestion),
  estimatedCostUsd: Schema.Number,
  notes: Schema.optional(Schema.String),
})
export type Proposal = Schema.Schema.Type<typeof Proposal>

export const Approval = Schema.Struct({
  approved: Schema.Literal(true),
  question: Schema.String,
  subquestions: Schema.Array(Subquestion),
  estimatedCostUsd: Schema.Number,
  approvedAt: Schema.Number,
})
export type Approval = Schema.Schema.Type<typeof Approval>

export function reading(metadata: Record<string, unknown> | undefined): Approval | undefined {
  const value = metadata?.[metadataKey]
  if (value === undefined || value === null || typeof value !== "object") return undefined
  const decoded = Schema.decodeUnknownOption(Approval)(value)
  return decoded._tag === "Some" ? decoded.value : undefined
}

export function isApproved(metadata: Record<string, unknown> | undefined): boolean {
  return reading(metadata) !== undefined
}

// A run is "heavy" once it will have more than `threshold` workers. Small
// delegations (one or two workers) stay frictionless; broader fan-out requires a
// confirmed plan.
export function requiresApproval(input: {
  workerCount: number
  threshold: number
}): boolean {
  if (input.threshold <= 0) return true
  return input.workerCount >= input.threshold
}
