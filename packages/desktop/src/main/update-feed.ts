type RuntimePlatform = NodeJS.Platform

export type ReleaseAsset = {
  name: string
  browser_download_url: string
  size?: number
}

export type ReleaseInfo = {
  tag_name: string
  name?: string
  body?: string
  draft?: boolean
  prerelease?: boolean
  published_at?: string
  assets?: ReleaseAsset[]
}

export type AvailableUpdate = {
  version: string
  tag: string
  name: string
  notes: string
  asset: ReleaseAsset
}

export function parseVersionTag(tag: string) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+](.*))?$/.exec(tag.trim())
  if (!match) return undefined
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? "",
    version: `${match[1]}.${match[2]}.${match[3]}`,
  }
}

// Compare release versions. Returns >0 when `candidate` is newer than `current`.
// A prerelease (e.g. -beta.1) is never considered newer than its release, and a
// candidate prerelease only wins when the current version shares that prerelease.
export function compareVersions(current: string, candidate: string) {
  const a = parseVersionTag(current)
  const b = parseVersionTag(candidate)
  if (!a || !b) return 0
  if (b.major !== a.major) return b.major - a.major
  if (b.minor !== a.minor) return b.minor - a.minor
  if (b.patch !== a.patch) return b.patch - a.patch
  const aPre = a.prerelease
  const bPre = b.prerelease
  if (!aPre && !bPre) return 0
  if (!aPre) return -1
  if (!bPre) return 1
  const aChannel = aPre.split(".")[0] ?? ""
  const bChannel = bPre.split(".")[0] ?? ""
  if (aChannel !== bChannel) return 0
  const aNum = Number(aPre.split(".")[1] ?? 0)
  const bNum = Number(bPre.split(".")[1] ?? 0)
  return bNum - aNum
}

export function selectInstaller(
  release: ReleaseInfo,
  platform: RuntimePlatform = process.platform,
  arch: string = process.arch,
) {
  const assets = release.assets ?? []
  const suffix = platform === "win32" ? ".exe" : platform === "darwin" ? ".dmg" : ".AppImage"
  const matches = assets.filter((asset) => asset.name.toLowerCase().endsWith(suffix.toLowerCase()))
  if (matches.length === 0) return undefined
  const archHint = arch === "arm64" ? ["arm64", "aarch64"] : ["x64", "x86_64", "amd64"]
  return matches.find((asset) => archHint.some((hint) => asset.name.toLowerCase().includes(hint))) ?? matches[0]
}

// Pick the newest eligible release for the running channel. Drafts are ignored.
// Prereleases are ignored on the stable channel. The newest release that carries an
// installable asset for this platform wins; if none of the newest candidates carry
// one, older releases are considered so a newer malformed release cannot brick updates.
export function selectUpdate(input: {
  currentVersion: string
  releases: ReleaseInfo[]
  allowPrerelease: boolean
  platform?: RuntimePlatform
  arch?: string
}): AvailableUpdate | undefined {
  const candidates = input.releases
    .filter((release) => !release.draft)
    .filter((release) => input.allowPrerelease || !release.prerelease)
    .flatMap((release) => {
      const parsed = parseVersionTag(release.tag_name)
      if (!parsed) return []
      if (compareVersions(input.currentVersion, parsed.version) <= 0) return []
      const asset = selectInstaller(release, input.platform, input.arch)
      if (!asset) return []
      return [{ release, parsed, asset }]
    })
    .sort((a, b) => compareVersions(a.parsed.version, b.parsed.version))
  const best = candidates[0]
  if (!best) return undefined
  return {
    version: best.parsed.version,
    tag: best.release.tag_name,
    name: best.release.name ?? best.release.tag_name,
    notes: best.release.body ?? "",
    asset: best.asset,
  }
}

export async function fetchReleases(input: {
  owner: string
  repo: string
  fetch: typeof globalThis.fetch
  perPage?: number
  token?: string
}): Promise<ReleaseInfo[]> {
  const response = await input.fetch(
    `https://api.github.com/repos/${input.owner}/${input.repo}/releases?per_page=${input.perPage ?? 30}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "OpenResearch-Updater",
        ...(input.token ? { Authorization: `Bearer ${input.token}` } : {}),
      },
    },
  )
  if (!response.ok) throw new Error(`GitHub releases request failed: ${response.status} ${response.statusText}`)
  const data = await response.json()
  if (!Array.isArray(data)) throw new Error("GitHub releases response was not a list")
  return data as ReleaseInfo[]
}
