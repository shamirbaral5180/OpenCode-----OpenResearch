import { expect, test } from "bun:test"
import { upgrade } from "../../src/cli/upgrade"
import { UpgradeCommand } from "../../src/cli/cmd/upgrade"

test("automatic upgrading is a no-op even when update notification is forced", async () => {
  const previous = process.env.OPENRESEARCH_ALWAYS_NOTIFY_UPDATE
  process.env.OPENRESEARCH_ALWAYS_NOTIFY_UPDATE = "true"
  try {
    expect(await upgrade()).toBeUndefined()
  } finally {
    if (previous === undefined) delete process.env.OPENRESEARCH_ALWAYS_NOTIFY_UPDATE
    else process.env.OPENRESEARCH_ALWAYS_NOTIFY_UPDATE = previous
  }
})

test("manual upgrading rejects implicit and explicit targets without prompting", async () => {
  const previous = process.exitCode
  try {
    for (const args of [{}, { target: "999.0.0", method: "curl" }, { target: "local", method: "npm" }]) {
      await UpgradeCommand.handler(args)
      expect(process.exitCode).toBe(1)
    }
  } finally {
    process.exitCode = previous
  }
})
