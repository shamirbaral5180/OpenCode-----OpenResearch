import { describe, expect, test } from "bun:test"
import { AppNodeBuilder } from "@openresearch-ai/core/effect/app-node-builder"
import { Effect } from "effect"
import { Installation } from "../../src/installation"
import { InstallationVersion } from "@openresearch-ai/core/installation/version"
import { testEffect } from "../lib/effect"

const it = testEffect(AppNodeBuilder.build(Installation.node))
const methods: Installation.Method[] = ["curl", "npm", "yarn", "pnpm", "bun", "brew", "scoop", "choco", "unknown"]

describe("local fork installation", () => {
  for (const method of methods) {
    it.effect(`blocks ${method} upgrades before any external operation`, () =>
      Effect.gen(function* () {
        const error = yield* Installation.use.upgrade(method, "999.0.0").pipe(Effect.flip)
        expect(error).toBeInstanceOf(Installation.UpgradeFailedError)
        expect(error.message).toBe(Installation.LOCAL_FORK_MESSAGE)
      }),
    )
    it.effect(`blocks ${method} latest queries`, () =>
      Effect.gen(function* () {
        const message = yield* Installation.use.latest(method).pipe(
          Effect.catchDefect((error) => Effect.succeed(error instanceof Error ? error.message : String(error))),
        )
        expect(message).toBe(Installation.LOCAL_FORK_MESSAGE)
      }),
    )
  }

  it.effect("returns local information without probing package managers or registries", () =>
    Effect.gen(function* () {
      expect(yield* Installation.use.method()).toBe("unknown")
      expect(yield* Installation.use.info()).toEqual({ version: InstallationVersion, latest: InstallationVersion })
    }),
  )

  test("promise APIs also reject explicit targets and default latest queries", async () => {
    await expect(Installation.upgrade("npm", InstallationVersion)).rejects.toThrow(Installation.LOCAL_FORK_MESSAGE)
    await expect(Installation.latest()).rejects.toThrow(Installation.LOCAL_FORK_MESSAGE)
  })

  test("preserves release classification", () => {
    expect(Installation.getReleaseType("1.2.3", "2.0.0")).toBe("major")
    expect(Installation.getReleaseType("1.2.3", "1.3.0")).toBe("minor")
    expect(Installation.getReleaseType("1.2.3", "1.2.4")).toBe("patch")
  })
})
