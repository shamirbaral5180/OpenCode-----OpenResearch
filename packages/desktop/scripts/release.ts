#!/usr/bin/env bun

import { $ } from "bun"
import fs from "node:fs/promises"
import path from "node:path"
import { parseArgs } from "node:util"

const rootDir = path.resolve(import.meta.dir, "../../..")
const packageDir = path.join(rootDir, "packages", "desktop")
const manifestPath = path.join(packageDir, "package.json")
const distDir = path.join(packageDir, "dist")
const notesPath = path.join(distDir, "release-body.md")

type Bump = "patch" | "minor" | "major"
type Channel = "dev" | "beta" | "prod"
type Installer = { name: string; path: string; sha256: string }

const RETRYABLE = [
  "ebusy",
  "enotempty",
  "eperm",
  "eacces",
  "7zip",
  "cannot access the file",
  "being used by another process",
  "resource busy",
]

// electron-builder extracts its bundled 7za into this cache. A transient file
// lock there (antivirus, stale handle) is the recurring Windows packaging flake.
function sevenZipCache() {
  const local = process.env.LOCALAPPDATA
  if (process.platform !== "win32" || !local) return undefined
  return path.join(local, "electron-builder", "Cache", "7zip@1.0.0")
}

export function nextVersion(version: string, bump: Bump) {
  const parts = version.split(".").map((part) => Number.parseInt(part, 10) || 0)
  const [major, minor, patch] = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
  if (bump === "major") return `${major + 1}.0.0`
  if (bump === "minor") return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

export function isRetryable(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : ""
  const text = error instanceof Error ? `${error.name} ${error.message} ${code}` : `${String(error)} ${code}`
  const lowered = text.toLowerCase()
  return RETRYABLE.some((needle) => lowered.includes(needle))
}

export function resolveInstaller(names: string[]) {
  const installers = names.filter((name) => name.toLowerCase().endsWith(".exe"))
  return installers.find((name) => name.startsWith("OpenResearch-")) ?? installers[0]
}

export function stripWindowsSection(notes: string) {
  const marker = "\n## Windows"
  const index = notes.indexOf(marker)
  return (index === -1 ? notes : notes.slice(0, index)).trimEnd()
}

export function windowsSection(assetName: string, sha256: string) {
  return `## Windows\n\nDownload \`${assetName}\`.\n\nSHA-256: \`${sha256}\``
}

async function readVersion() {
  return (await Bun.file(manifestPath).json()).version as string
}

async function writeVersion(version: string) {
  const manifest = await Bun.file(manifestPath).json()
  await Bun.write(manifestPath, JSON.stringify({ ...manifest, version }, null, 2) + "\n")
}

async function readNotes(explicit?: string) {
  if (explicit) return await Bun.file(explicit).text()
  const existing = Bun.file(notesPath)
  if (await existing.exists()) return await existing.text()
  return `## Highlights\n`
}

async function removeDir(dir: string, retries = 20): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true })
  } catch (error) {
    if (retries === 0 || !isRetryable(error)) throw error
    Bun.gc(true)
    await Bun.sleep(250)
    return removeDir(dir, retries - 1)
  }
}

async function cleanPackaging() {
  await removeDir(distDir)
  const cache = sevenZipCache()
  if (cache) await removeDir(cache)
}

async function sha256Hex(file: string) {
  const hasher = new Bun.CryptoHasher("sha256")
  for await (const chunk of Bun.file(file).stream()) hasher.update(chunk)
  return hasher.digest("hex").toUpperCase()
}

async function listDistFiles() {
  return Array.fromAsync(new Bun.Glob("*").scan({ cwd: distDir, onlyFiles: true }))
}

function shellEnv(channel: Channel) {
  return { ...process.env, OPENRESEARCH_CHANNEL: channel }
}

function messageOf(error: unknown) {
  if (error instanceof Error) return error.message.split("\n").slice(0, 4).join(" ")
  return String(error)
}

function log(message: string) {
  console.log(`[release] ${message}`)
}

const USAGE = `Usage: bun run packages/desktop/scripts/release.ts [options]

Full desktop release: bump -> clean -> build -> package (with EBUSY/7zip retry)
-> verify + SHA-256 -> commit/push/tag -> GitHub release with installer.

Options:
  --bump=patch|minor|major   Version bump (default: patch)
  --version=<x.y.z>          Explicit version; implies a bump to that version
  --skip-bump                Release the current desktop version unchanged
  --channel=dev|beta|prod    Packaging channel (default: prod)
  --branch=<name>            Branch to push (default: main)
  --repo=<owner/name>        GitHub repo (default: gh repo view)
  --tag=<vX.Y.Z>             Override tag (default: v<version>)
  --notes=<file>             Release notes source (default: dist/release-body.md)
  --attempts=<n>             Packaging attempts before failing (default: 3)
  --skip-clean               Do not pre-clean dist and the 7zip cache
  --skip-build               Package from the existing build output
  --skip-git                 Skip commit, push, and tag
  --skip-release             Skip GitHub release creation and upload
  --package-only             Only clean, build, package, and verify
  --allow-dirty              Allow running with a dirty working tree
  --force-tag                Move and force-push an existing tag
  --dry-run                  Print the plan without changing anything
  --help                     Show this message`

function requireBump(value: string): Bump {
  if (value === "patch" || value === "minor" || value === "major") return value
  throw new Error(`Unknown bump type: ${value}`)
}

function requireChannel(value: string): Channel {
  if (value === "dev" || value === "beta" || value === "prod") return value
  throw new Error(`Unknown channel: ${value}`)
}

function requirePositiveInt(value: string, name: string) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`)
  return parsed
}

async function buildWindows(opts: { attempts: number; channel: Channel }) {
  async function attempt(attemptNumber: number): Promise<void> {
    try {
      await $`bun run --cwd packages/desktop package:win`.cwd(rootDir).env(shellEnv(opts.channel))
    } catch (error) {
      if (attemptNumber >= opts.attempts || !isRetryable(error)) throw error
      log(`Packaging attempt ${attemptNumber}/${opts.attempts} failed: ${messageOf(error)}`)
      log("Clearing dist and the electron-builder 7zip cache before retrying")
      await cleanPackaging()
      return attempt(attemptNumber + 1)
    }
  }
  await attempt(1)
}

async function verifyInstaller(dryRun: boolean): Promise<Installer> {
  if (dryRun) return { name: "OpenResearch-win-x64.exe", path: path.join(distDir, "OpenResearch-win-x64.exe"), sha256: "" }

  const name = resolveInstaller(await listDistFiles())
  if (!name) throw new Error(`No Windows installer found in ${distDir}`)

  const installerPath = path.join(distDir, name)
  const size = (await fs.stat(installerPath)).size
  if (size < 10_000_000) throw new Error(`Installer ${name} looks too small (${size} bytes)`)
  return { name, path: installerPath, sha256: await sha256Hex(installerPath) }
}

async function commitTagPush(opts: {
  version: string
  tag: string
  branch: string
  forceTag: boolean
}) {
  const manifestRel = "packages/desktop/package.json"
  const manifestStatus = (await $`git status --porcelain -- ${manifestRel}`.cwd(rootDir).text()).trim()
  if (manifestStatus) {
    await $`git commit -m ${`chore(desktop): release ${opts.version}`} -- ${manifestRel}`.cwd(rootDir)
  } else {
    log("No version change to commit")
  }

  log(`Pushing ${opts.branch}`)
  await $`git push origin ${opts.branch}`.cwd(rootDir)

  const remoteTag = (await $`git ls-remote --tags origin ${opts.tag}`.cwd(rootDir).text()).trim()
  if (remoteTag && !opts.forceTag) {
    log(`Tag ${opts.tag} already exists on origin; leaving it in place`)
    return
  }

  const localTag = (await $`git tag --list ${opts.tag}`.cwd(rootDir).text()).trim()
  if (localTag) await $`git tag -d ${opts.tag}`.cwd(rootDir)
  await $`git tag ${opts.tag}`.cwd(rootDir)
  if (opts.forceTag) await $`git push origin ${opts.tag} --force`.cwd(rootDir)
  else await $`git push origin ${opts.tag}`.cwd(rootDir)
}

async function publishRelease(opts: {
  repo?: string
  tag: string
  title: string
  body: string
  installerPath: string
}) {
  const repo =
    opts.repo ?? (await $`gh repo view --json nameWithOwner -q .nameWithOwner`.cwd(rootDir).text()).trim()
  const bodyFile = path.join(distDir, "release-body.md")
  await Bun.write(bodyFile, opts.body)

  const existing = await $`gh release view ${opts.tag} --repo ${repo}`.cwd(rootDir).nothrow().quiet()
  if (existing.exitCode === 0) {
    log(`Updating existing release ${opts.tag}`)
    await $`gh release edit ${opts.tag} --repo ${repo} --title ${opts.title} --notes-file ${bodyFile}`.cwd(rootDir)
  } else {
    const sha = (await $`git rev-parse HEAD`.cwd(rootDir).text()).trim()
    log(`Creating release ${opts.tag}`)
    await $`gh release create ${opts.tag} --repo ${repo} --target ${sha} --title ${opts.title} --notes-file ${bodyFile}`.cwd(
      rootDir,
    )
  }

  log(`Uploading ${path.basename(opts.installerPath)}`)
  await $`gh release upload ${opts.tag} ${opts.installerPath} --clobber --repo ${repo}`.cwd(rootDir)
}

async function main() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      bump: { type: "string", default: "patch" },
      version: { type: "string" },
      channel: { type: "string", default: "prod" },
      branch: { type: "string", default: "main" },
      repo: { type: "string" },
      tag: { type: "string" },
      notes: { type: "string" },
      attempts: { type: "string", default: "3" },
      "package-only": { type: "boolean", default: false },
      "skip-clean": { type: "boolean", default: false },
      "skip-bump": { type: "boolean", default: false },
      "skip-build": { type: "boolean", default: false },
      "skip-git": { type: "boolean", default: false },
      "skip-release": { type: "boolean", default: false },
      "allow-dirty": { type: "boolean", default: false },
      "force-tag": { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  })

  if (values.help) {
    console.log(USAGE)
    return
  }

  const bump = requireBump(values.bump)
  const channel = requireChannel(values.channel)
  const attempts = requirePositiveInt(values.attempts, "--attempts")
  const packageOnly = values["package-only"]
  const dryRun = values["dry-run"]
  const skipClean = values["skip-clean"]
  const skipBuild = values["skip-build"]
  const skipGit = values["skip-git"] || packageOnly
  const skipRelease = values["skip-release"] || packageOnly
  const forceTag = values["force-tag"]

  if (!(await Bun.file(manifestPath).exists())) throw new Error(`Desktop package.json not found at ${manifestPath}`)

  const current = await readVersion()
  const version = values["skip-bump"] ? current : (values.version ?? nextVersion(current, bump))
  const tag = values.tag ?? `v${version}`
  const title = `OpenResearch ${version}`
  const rawNotes = await readNotes(values.notes)

  log(`Version ${current} -> ${version} (channel ${channel}, tag ${tag})`)
  if (skipGit) log("Git steps disabled")
  if (skipRelease) log("GitHub release step disabled")
  if (dryRun) log("Dry run: no changes will be made")

  if (!skipGit && !values["allow-dirty"]) {
    const dirty = (await $`git status --porcelain`.cwd(rootDir).text()).trim()
    if (dirty) throw new Error("Working tree is dirty. Commit or stash changes, or pass --allow-dirty.")
  }

  if (!skipClean) {
    log("Cleaning dist and the electron-builder 7zip cache")
    if (!dryRun) await cleanPackaging()
  }

  if (values["skip-bump"]) {
    log(`Keeping desktop version ${current}`)
  } else if (dryRun) {
    log(`Would write version ${version} to packages/desktop/package.json`)
  } else {
    await writeVersion(version)
  }

  if (!skipBuild) {
    log(`Building desktop app (channel ${channel})`)
    if (!dryRun) await $`bun run --cwd packages/desktop build`.cwd(rootDir).env(shellEnv(channel))
  }

  log(`Packaging Windows installer (up to ${attempts} attempts)`)
  if (!dryRun) await buildWindows({ attempts, channel })

  log("Verifying installer")
  const installer = await verifyInstaller(dryRun)
  if (!dryRun) log(`${installer.name} (${installer.sha256})`)

  const body = [stripWindowsSection(rawNotes), windowsSection(installer.name, installer.sha256)]
    .filter(Boolean)
    .join("\n\n")

  if (!skipGit) {
    log(`Committing, pushing ${values.branch}, and tagging ${tag}`)
    if (!dryRun)
      await commitTagPush({ version, tag, branch: values.branch, forceTag })
  }

  if (!skipRelease) {
    if (dryRun) {
      log(`Would publish GitHub release ${tag} with ${installer.name}`)
    } else {
      await publishRelease({
        repo: values.repo,
        tag,
        title,
        body,
        installerPath: installer.path,
      })
    }
  }

  log(dryRun ? "Dry run complete" : `Release ${tag} complete`)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`[release] ${messageOf(error)}`)
    process.exit(1)
  })
}
