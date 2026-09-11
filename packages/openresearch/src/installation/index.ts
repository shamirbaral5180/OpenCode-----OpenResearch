import { LayerNode } from "@openresearch-ai/core/effect/layer-node"
import { AppNodeBuilder } from "@openresearch-ai/core/effect/app-node-builder"
import { Effect, Layer, Schema, Context } from "effect"
import { serviceUse } from "@openresearch-ai/core/effect/service-use"
import { makeRuntime } from "@openresearch-ai/core/effect/runtime"
import semver from "semver"
import { InstallationChannel, InstallationVersion } from "@openresearch-ai/core/installation/version"
import { InstallationEvent } from "@openresearch-ai/schema/installation-event"

export type Method = "curl" | "npm" | "yarn" | "pnpm" | "bun" | "brew" | "scoop" | "choco" | "unknown"
export type ReleaseType = "patch" | "minor" | "major"
export const Event = InstallationEvent
export const LOCAL_FORK_MESSAGE =
  "OpenResearch is a local fork. Upstream upgrades and latest-version queries are disabled. Rebuild and install this fork from local source."

export function getReleaseType(current: string, latest: string): ReleaseType {
  if (semver.major(latest) > semver.major(current)) return "major"
  if (semver.minor(latest) > semver.minor(current)) return "minor"
  return "patch"
}

export const Info = Schema.Struct({
  version: Schema.String,
  latest: Schema.String,
}).annotate({ identifier: "InstallationInfo" })
export type Info = Schema.Schema.Type<typeof Info>

export function userAgent(client = "cli") {
  return `openresearch/${InstallationChannel}/${InstallationVersion}/${client}`
}

export const USER_AGENT = userAgent()

export function isPreview() {
  return InstallationChannel !== "latest"
}

export function isLocal() {
  return InstallationChannel === "local"
}

export class UpgradeFailedError extends Schema.TaggedErrorClass<UpgradeFailedError>()("UpgradeFailedError", {
  stderr: Schema.String,
}) {
  override get message() {
    return this.stderr
  }
}

export interface Interface {
  readonly info: () => Effect.Effect<Info>
  readonly method: () => Effect.Effect<Method>
  readonly latest: (method?: Method) => Effect.Effect<string>
  readonly upgrade: (method: Method, target: string) => Effect.Effect<void, UpgradeFailedError>
}

export class Service extends Context.Service<Service, Interface>()("@openresearch/Installation") {}
export const use = serviceUse(Service)

const layer = Layer.succeed(Service, {
  info: () => Effect.succeed({ version: InstallationVersion, latest: InstallationVersion }),
  method: () => Effect.succeed("unknown" as Method),
  // Keep the existing infallible Effect signature; querying latest already used defects on failure.
  latest: (_method?: Method) => Effect.die(new UpgradeFailedError({ stderr: LOCAL_FORK_MESSAGE })),
  upgrade: (_method: Method, _target: string) => Effect.fail(new UpgradeFailedError({ stderr: LOCAL_FORK_MESSAGE })),
})

export const node = LayerNode.make({ service: Service, layer, deps: [] })
const { runPromise } = makeRuntime(Service, AppNodeBuilder.build(node))

export const latest = (...args: Parameters<Interface["latest"]>) => runPromise((s) => s.latest(...args))
export const method = () => runPromise((s) => s.method())
export const upgrade = (...args: Parameters<Interface["upgrade"]>) => runPromise((s) => s.upgrade(...args))

export * as Installation from "."
