import type { Argv } from "yargs"
import { UI } from "../ui"
import { Installation } from "../../installation"

export const UpgradeCommand = {
  command: "upgrade [target]",
  describe: "upstream upgrades are disabled for OpenResearch; rebuild from local source",
  builder: (yargs: Argv) =>
    yargs
      .positional("target", { describe: "version (unsupported for this local fork)", type: "string" })
      .option("method", {
        alias: "m",
        describe: "installation method (unsupported for this local fork)",
        type: "string",
        choices: ["curl", "npm", "pnpm", "bun", "brew", "choco", "scoop"],
      }),
  handler: async (_args: { target?: string; method?: string }) => {
    UI.error(Installation.LOCAL_FORK_MESSAGE)
    process.exitCode = 1
  },
}
