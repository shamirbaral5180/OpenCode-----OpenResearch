export * as ResearchArtifact from "./research-artifact"

import path from "path"
import { Effect } from "effect"
import { FSUtil } from "./fs-util"

// Check existing ancestors as well as the lexical path: reports/ may itself be a symlink.
export const allowed = Effect.fn("ResearchArtifact.allowed")(function* (
  fs: FSUtil.Interface,
  directory: string,
  target: string,
) {
  const absolute = path.resolve(target)
  const reports = path.resolve(directory, "reports")
  if (absolute === reports || !FSUtil.contains(reports, absolute)) return false
  const root = yield* fs.realPath(directory)
  const expected = path.resolve(root, "reports")
  let ancestor = absolute
  while (true) {
    const canonical = yield* fs
      .realPath(ancestor)
      .pipe(Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(undefined)))
    if (canonical !== undefined) {
      const resolved = path.resolve(canonical, path.relative(ancestor, absolute))
      return resolved !== expected && FSUtil.contains(expected, resolved)
    }
    const parent = path.dirname(ancestor)
    if (parent === ancestor) return false
    ancestor = parent
  }
})
