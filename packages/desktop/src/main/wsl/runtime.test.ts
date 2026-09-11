import { expect, test } from "bun:test"
import { installWslOpenResearch } from "./runtime"

test("WSL provisioning refuses upstream installation for every requested version", async () => {
  for (const version of ["1.0.0", "latest", "local"]) {
    await expect(installWslOpenResearch(version, "Ubuntu")).rejects.toThrow(
      "OpenResearch WSL CLI provisioning is unsupported",
    )
  }
})
