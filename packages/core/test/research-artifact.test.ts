import fs from "fs/promises"
import path from "path"
import { expect, test } from "bun:test"
import { Effect } from "effect"
import { FSUtil } from "@openresearch-ai/core/fs-util"
import { ResearchArtifact } from "@openresearch-ai/core/research-artifact"
import { LayerNode } from "@openresearch-ai/core/effect/layer-node"
import { tmpdir } from "./fixture/tmpdir"

function allowed(directory: string, target: string) {
  return Effect.runPromise(
    Effect.gen(function* () {
      const filesystem = yield* FSUtil.Service
      return yield* ResearchArtifact.allowed(filesystem, directory, target)
    }).pipe(Effect.provide(LayerNode.compile(FSUtil.node))),
  )
}

test("report policy confines both existing and prospective files to active reports directory", async () => {
  await using dir = await tmpdir()
  expect(await allowed(dir.path, path.join(dir.path, "reports", "topic", "evidence.md"))).toBe(true)
  expect(await allowed(dir.path, path.join(dir.path, "reports", "..", "source.ts"))).toBe(false)
  expect(await allowed(dir.path, path.join(dir.path, "reports-other", "evidence.md"))).toBe(false)
  expect(await allowed(dir.path, path.join(dir.path, "reports"))).toBe(false)
  await fs.mkdir(path.join(dir.path, "child"))
  expect(await allowed(path.join(dir.path, "child"), path.join(dir.path, "reports", "evidence.md"))).toBe(false)
})

test("report policy rejects symlink and junction escape, including missing child files", async () => {
  await using dir = await tmpdir()
  await fs.mkdir(path.join(dir.path, "outside"))
  await fs.symlink(path.join(dir.path, "outside"), path.join(dir.path, "reports"), "junction")
  expect(await allowed(dir.path, path.join(dir.path, "reports", "new.md"))).toBe(false)
  await fs.writeFile(path.join(dir.path, "outside", "existing.md"), "user work")
  expect(await allowed(dir.path, path.join(dir.path, "reports", "existing.md"))).toBe(false)
})
