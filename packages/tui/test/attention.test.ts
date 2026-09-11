import { expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import { createTuiAttention } from "../src/attention"
import { resolve } from "../src/config"

test("brands attention defaults without renaming the persisted sound pack", async () => {
  const notifications: { message: string; title?: string }[] = []
  const renderer = Object.assign(new EventEmitter(), {
    isDestroyed: false,
    triggerNotification(message: string, title?: string) {
      notifications.push({ message, title })
      return true
    },
  })
  const attention = createTuiAttention({
    renderer,
    config: resolve({ attention: { enabled: true, sound: false } }, { terminalSuspend: false }),
  })
  try {
    renderer.emit("blur")
    await attention.notify({ message: "Research complete" })
    await attention.notify({ message: "Needs input", title: "Literature review" })
    expect(notifications).toEqual([
      { message: "Research complete", title: "OpenResearch" },
      { message: "Needs input", title: "Literature review" },
    ])
    expect(attention.soundboard.current()).toBe("openresearch.default")
    expect(attention.soundboard.list()).toEqual([
      { id: "openresearch.default", name: "OpenResearch Default", active: true, builtin: true },
    ])
  } finally {
    attention.dispose()
  }
  expect(renderer.listenerCount("blur")).toBe(0)
  expect(renderer.listenerCount("focus")).toBe(0)
})
