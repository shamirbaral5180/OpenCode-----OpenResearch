import { Effect } from "effect"
import { effectCmd } from "../effect-cmd"
import { MonitorScheduler } from "@/monitor/scheduler"
import { InstanceState } from "@/effect/instance-state"
import { Monitor } from "@openresearch-ai/core/monitor/monitor"

// Runs due research monitors once and exits. This is the app-closed path
// (mode b): an OS-level scheduler (cron, Task Scheduler, launchd) invokes
// `openresearch monitor --once` in the project directory. It is still fully
// local — the run uses the on-device database and models.
export const MonitorCommand = effectCmd({
  command: "monitor",
  describe: "run due research monitors once (for OS-level scheduling)",
  builder: (yargs) =>
    yargs.option("once", {
      type: "boolean",
      default: true,
      describe: "run due watches once and exit (only supported mode)",
    }),
  handler: Effect.fn("Cli.monitor")(function* (args) {
    const scheduler = yield* MonitorScheduler.Service
    const monitor = yield* Monitor.Service
    const instance = yield* InstanceState.context
    const before = yield* monitor.due(Date.now())
    const scoped = before.filter((watch) => watch.project_id === instance.project.id)
    if (scoped.length === 0) {
      console.log("No due monitors.")
      return
    }
    console.log(`Running ${scoped.length} due monitor(s)...`)
    yield* scheduler.tick()
    const after = yield* monitor.list(instance.project.id)
    for (const watch of after) {
      const ran = scoped.some((item) => item.id === watch.id)
      if (!ran) continue
      console.log(`- ${watch.topic}: run #${watch.run_count}${watch.last_summary ? ` — ${watch.last_summary}` : ""}`)
    }
  }),
})
