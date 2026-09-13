import { describe, expect, test } from "bun:test"
import { ResearchPlan } from "@openresearch-ai/core/research-plan"

const approval = {
  approved: true as const,
  question: "Q",
  subquestions: [{ question: "sub" }],
  estimatedCostUsd: 1.5,
  approvedAt: 1,
}

describe("ResearchPlan", () => {
  test("reading returns undefined when absent or malformed", () => {
    expect(ResearchPlan.reading(undefined)).toBeUndefined()
    expect(ResearchPlan.reading({})).toBeUndefined()
    expect(ResearchPlan.reading({ [ResearchPlan.metadataKey]: { approved: false } })).toBeUndefined()
    expect(ResearchPlan.reading({ [ResearchPlan.metadataKey]: "nope" })).toBeUndefined()
  })

  test("reading decodes a stored approval and isApproved agrees", () => {
    const metadata = { [ResearchPlan.metadataKey]: approval }
    expect(ResearchPlan.reading(metadata)).toEqual(approval)
    expect(ResearchPlan.isApproved(metadata)).toBe(true)
    expect(ResearchPlan.isApproved({})).toBe(false)
  })

  test("requiresApproval uses the threshold and always requires a plan at zero", () => {
    expect(ResearchPlan.requiresApproval({ workerCount: 1, threshold: 3 })).toBe(false)
    expect(ResearchPlan.requiresApproval({ workerCount: 2, threshold: 3 })).toBe(false)
    expect(ResearchPlan.requiresApproval({ workerCount: 3, threshold: 3 })).toBe(true)
    expect(ResearchPlan.requiresApproval({ workerCount: 1, threshold: 0 })).toBe(true)
  })
})
