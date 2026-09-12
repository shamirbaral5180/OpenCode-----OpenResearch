#!/usr/bin/env bun
// Minimal research-quality eval harness. Computes deterministic metrics over fixture
// report bundles so citation resolution, coverage, and validation are comparable
// across versions. Run: bun run script/eval/run.ts
import { Glob } from "bun"
import path from "path"
import { EvalMetrics } from "./metrics"
import { ResearchEvidence } from "@openresearch-ai/core/research-evidence"

const directory = path.join(import.meta.dir, "cases")

async function loadCases() {
  const bundles: EvalMetrics.Bundle[] = []
  for (const input of new Glob("*/bundle.json").scanSync({ cwd: directory })) {
    const file = path.join(directory, input)
    const raw = (await Bun.file(file).json()) as {
      report: string
      evidence: unknown[]
      expectedSubquestions?: string[]
    }
    bundles.push({
      report: raw.report,
      evidence: raw.evidence as ResearchEvidence.Record[],
      expectedSubquestions: raw.expectedSubquestions,
    })
  }
  return bundles
}

const bundles = await loadCases()
const metrics = bundles.map((bundle) => EvalMetrics.compute(bundle))
const summary = EvalMetrics.aggregate(metrics)

console.log(JSON.stringify({ summary, perCase: metrics }, null, 2))

const output = path.join(import.meta.dir, "metrics.json")
await Bun.write(output, JSON.stringify({ summary, perCase: metrics }, null, 2) + "\n")
console.log(`\nwrote ${output}`)
