import { expect, test } from "bun:test"
import type { Configuration } from "electron-builder"

for (const channel of ["dev", "beta", "prod"] as const) {
  test(`isolates ${channel} packaging without a CLI or update feeds`, async () => {
    const previous = process.env.OPENRESEARCH_CHANNEL
    process.env.OPENRESEARCH_CHANNEL = channel
    try {
      const module = await import(`./electron-builder.config.ts?channel=${channel}`)
      const config = module.default as Configuration
      const appId = `com.srbcorporation.openresearch${channel === "prod" ? "" : `.${channel}`}`
      expect(config.appId).toBe(appId)
      expect(config.productName).toStartWith("OpenResearch")
      expect(config.publish).toBeNull()
      expect(config.extraMetadata?.desktopName).toBe(`${appId}.desktop`)
      expect(config.linux?.executableName).toBe(appId)
      expect(config.linux?.desktop?.entry?.StartupWMClass).toBe(appId)
      expect(config.deb?.fpm).toEqual([expect.stringContaining(`/usr/share/metainfo/${appId}.metainfo.xml`)])
      expect(config.rpm?.fpm).toEqual([expect.stringContaining(`/usr/share/metainfo/${appId}.metainfo.xml`)])
      expect(config.files).toContain("!resources/*-cli*")
      expect(config.extraResources).not.toContainEqual({ from: "resources/", to: "", filter: [expect.anything()] })
    } finally {
      if (previous === undefined) delete process.env.OPENRESEARCH_CHANNEL
      else process.env.OPENRESEARCH_CHANNEL = previous
    }
  })
}
