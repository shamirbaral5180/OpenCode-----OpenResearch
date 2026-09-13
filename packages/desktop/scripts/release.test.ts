import { expect, test } from "bun:test"
import {
  isRetryable,
  nextVersion,
  resolveInstaller,
  stripWindowsSection,
  windowsSection,
} from "./release"

test("bumps patch, minor, and major versions", () => {
  expect(nextVersion("1.2.1", "patch")).toBe("1.2.2")
  expect(nextVersion("1.2.1", "minor")).toBe("1.3.0")
  expect(nextVersion("1.2.1", "major")).toBe("2.0.0")
  expect(nextVersion("1.2", "patch")).toBe("1.2.1")
})

test("recognizes transient packaging failures", () => {
  expect(isRetryable(new Error("EBUSY: resource busy or locked, rmdir 'dist'"))).toBe(true)
  expect(isRetryable(Object.assign(new Error("operation not permitted"), { code: "EBUSY" }))).toBe(true)
  expect(isRetryable("7-Zip: cannot access the file because it is being used by another process")).toBe(true)
  expect(isRetryable(new Error("Type error in renderer bundle"))).toBe(false)
})

test("selects the OpenResearch installer and ignores companion files", () => {
  expect(
    resolveInstaller(["OpenResearch-win-x64.exe", "OpenResearch-win-x64.exe.blockmap", "latest.yml"]),
  ).toBe("OpenResearch-win-x64.exe")
  expect(resolveInstaller(["builder-debug.yml"])).toBeUndefined()
})

test("strips a stale Windows section before appending the verified one", () => {
  const raw = "## Highlights\n\nBody text.\n\n## Windows\n\nSHA-256: `OLD`"
  const body = [stripWindowsSection(raw), windowsSection("OpenResearch-win-x64.exe", "ABC123")].join("\n\n")
  expect(body).toBe("## Highlights\n\nBody text.\n\n## Windows\n\nDownload `OpenResearch-win-x64.exe`.\n\nSHA-256: `ABC123`")
})
