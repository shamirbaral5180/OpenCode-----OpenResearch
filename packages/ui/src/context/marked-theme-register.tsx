import { registerCustomTheme } from "@pierre/diffs"
import { OpenResearchTheme } from "./marked-theme"

let registered = false

export function registerOpenResearchTheme() {
  if (registered) return
  registered = true
  registerCustomTheme("OpenResearch", () => Promise.resolve(OpenResearchTheme))
}
