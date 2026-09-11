import { run as runTui, type TuiInput } from "@openresearch-ai/tui"
import { Global } from "@openresearch-ai/core/global"
import { AppNodeBuilder } from "@openresearch-ai/core/effect/app-node-builder"
import { Effect } from "effect"

export function run(input: TuiInput) {
  return runTui(input).pipe(Effect.provide(AppNodeBuilder.build(Global.node)))
}
