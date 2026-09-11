import { expect, test } from "bun:test"
import { join } from "node:path"
import { CLI_BINARIES, getCurrentCli, localCliPath } from "./utils"

for (const cli of CLI_BINARIES) {
  test(`resolves ${cli.rustTarget} exclusively to a local fork build`, () => {
    expect(getCurrentCli(cli.rustTarget)).toEqual(cli)
    expect(localCliPath(cli)).toBe(
      join(
        import.meta.dir,
        "../../openresearch/dist",
        `openresearch-${cli.os === "win32" ? "windows" : cli.os}-${cli.cpu}`,
        "bin",
        cli.os === "win32" ? "openresearch.exe" : "openresearch",
      ),
    )
  })
}

test("rejects unsupported targets rather than falling back to upstream", () => {
  expect(() => getCurrentCli("unsupported")).toThrow("CLI configuration not available")
})
