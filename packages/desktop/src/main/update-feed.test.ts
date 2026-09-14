import { describe, expect, test } from "bun:test"
import { compareVersions, parseVersionTag, selectInstaller, selectUpdate, type ReleaseInfo } from "./update-feed"

const release = (tag: string, overrides: Partial<ReleaseInfo> = {}): ReleaseInfo => ({
  tag_name: tag,
  name: `OpenResearch ${tag}`,
  body: "notes",
  draft: false,
  prerelease: false,
  assets: [{ name: "OpenResearch-win-x64.exe", browser_download_url: `https://example.test/${tag}.exe` }],
  ...overrides,
})

describe("update feed version handling", () => {
  test("parses v-prefixed and bare semver tags", () => {
    expect(parseVersionTag("v1.2.3")?.version).toBe("1.2.3")
    expect(parseVersionTag("1.2.3")?.version).toBe("1.2.3")
    expect(parseVersionTag("nonsense")).toBeUndefined()
  })

  test("compares releases and ignores prerelease downgrades", () => {
    expect(compareVersions("1.2.2", "1.2.3")).toBeGreaterThan(0)
    expect(compareVersions("1.2.2", "1.2.1")).toBeLessThan(0)
    expect(compareVersions("1.2.2", "1.2.2")).toBe(0)
    // A stable version is not replaced by a prerelease of the same number.
    expect(compareVersions("1.2.2", "1.2.2-beta.1")).toBeLessThan(0)
    expect(compareVersions("1.2.2-beta.1", "1.2.2-beta.2")).toBeGreaterThan(0)
  })

  test("selects the installer matching the running platform and arch", () => {
    const info = release("v9.9.9", {
      assets: [
        { name: "OpenResearch-win-arm64.exe", browser_download_url: "https://example.test/arm.exe" },
        { name: "OpenResearch-win-x64.exe", browser_download_url: "https://example.test/x64.exe" },
      ],
    })
    expect(selectInstaller(info, "win32", "x64")?.name).toBe("OpenResearch-win-x64.exe")
    expect(selectInstaller(info, "win32", "arm64")?.name).toBe("OpenResearch-win-arm64.exe")
    expect(selectInstaller(release("v9.9.9", { assets: [] }), "win32", "x64")).toBeUndefined()
  })

  test("ignores drafts, prereleases, and non-newer releases", () => {
    const releases = [
      release("v2.0.0", { draft: true, prerelease: false }),
      release("v1.5.0", { prerelease: true }),
      release("v1.2.2"),
      release("v1.2.3"),
    ]
    const update = selectUpdate({ currentVersion: "1.2.2", releases, allowPrerelease: false })
    expect(update?.version).toBe("1.2.3")
  })

  test("skips a newer release that has no installable asset", () => {
    const releases = [
      release("v3.0.0", { assets: [{ name: "source.tar.gz", browser_download_url: "https://example.test/src" }] }),
      release("v2.5.0"),
    ]
    const update = selectUpdate({ currentVersion: "1.2.2", releases, allowPrerelease: false })
    expect(update?.version).toBe("2.5.0")
    expect(update?.asset.name).toBe("OpenResearch-win-x64.exe")
  })

  test("returns nothing when already current", () => {
    const update = selectUpdate({ currentVersion: "1.2.2", releases: [release("v1.2.2")], allowPrerelease: false })
    expect(update).toBeUndefined()
  })
})
