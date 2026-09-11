import { $ } from "bun"
import { chmod, copyFile, mkdir } from "node:fs/promises"
import { join } from "node:path"

export type Channel = "dev" | "beta" | "prod"

export function resolveChannel(): Channel {
  const raw = Bun.env.OPENRESEARCH_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  return "dev"
}

export const CLI_BINARIES: Array<{ rustTarget: string; package: string; os: string; cpu: string }> = [
  {
    rustTarget: "aarch64-apple-darwin",
    package: "@openresearch-ai/cli-darwin-arm64",
    os: "darwin",
    cpu: "arm64",
  },
  {
    rustTarget: "x86_64-apple-darwin",
    package: "@openresearch-ai/cli-darwin-x64-baseline",
    os: "darwin",
    cpu: "x64",
  },
  {
    rustTarget: "aarch64-pc-windows-msvc",
    package: "@openresearch-ai/cli-windows-arm64",
    os: "win32",
    cpu: "arm64",
  },
  {
    rustTarget: "x86_64-pc-windows-msvc",
    package: "@openresearch-ai/cli-windows-x64-baseline",
    os: "win32",
    cpu: "x64",
  },
  {
    rustTarget: "x86_64-unknown-linux-gnu",
    package: "@openresearch-ai/cli-linux-x64-baseline",
    os: "linux",
    cpu: "x64",
  },
  {
    rustTarget: "aarch64-unknown-linux-gnu",
    package: "@openresearch-ai/cli-linux-arm64",
    os: "linux",
    cpu: "arm64",
  },
]

export const RUST_TARGET = Bun.env.RUST_TARGET

function nativeTarget() {
  const { platform, arch } = process
  if (arch !== "arm64" && arch !== "x64") throw new Error(`Unsupported architecture: ${arch}`)
  if (platform === "darwin") return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin"
  if (platform === "win32") return arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc"
  if (platform === "linux") return arch === "arm64" ? "aarch64-unknown-linux-gnu" : "x86_64-unknown-linux-gnu"
  throw new Error(`Unsupported platform: ${platform}/${arch}`)
}

export function getCurrentCli(target = RUST_TARGET ?? nativeTarget()) {
  const binaryConfig = CLI_BINARIES.find((item) => item.rustTarget === target)
  if (!binaryConfig) throw new Error(`CLI configuration not available for target '${target}'`)

  return binaryConfig
}

export async function downloadCliToResources() {
  // Retain the existing helper API, but never fetch an upstream executable.
  const cli = getCurrentCli()
  const source = localCliPath(cli)
  const dest = join(import.meta.dir, "../resources", cli.os === "win32" ? "openresearch-cli.exe" : "openresearch-cli")
  if (!(await Bun.file(source).exists())) {
    throw new Error(
      `OpenResearch requires a locally built fork CLI at ${source}. Build packages/openresearch with bun script/build.ts --single --skip-install before desktop predev/prebuild. Upstream downloads are disabled.`,
    )
  }
  await mkdir(join(import.meta.dir, "../resources"), { recursive: true })
  await copyFile(source, dest)
  if (process.platform !== "win32") await chmod(dest, 0o755)
  if (process.platform === "win32" && process.env.GITHUB_ACTIONS === "true") {
    await $`pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File ../../script/sign-windows.ps1 ${dest}`
  }
  if (process.platform === "darwin") await $`codesign --force --sign - ${dest}`

  console.log(`Copied local OpenResearch CLI from ${source} to ${dest}`)
}

export function localCliPath(cli = getCurrentCli()) {
  const os = cli.os === "win32" ? "windows" : cli.os
  return join(
    import.meta.dir,
    "../../openresearch/dist",
    `openresearch-${os}-${cli.cpu}`,
    "bin",
    cli.os === "win32" ? "openresearch.exe" : "openresearch",
  )
}

export function windowsify(path: string) {
  if (path.endsWith(".exe")) return path
  return `${path}${process.platform === "win32" ? ".exe" : ""}`
}
