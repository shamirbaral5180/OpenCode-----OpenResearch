import { afterEach, describe, expect, setSystemTime, test } from "bun:test"
import { createRoot } from "solid-js"
import { createSettings } from "../src/context/settings"
import type { Platform } from "../src/context/platform"

afterEach(() => setSystemTime())

describe.each(["2026-09-10T12:00:00Z", "2026-09-14T12:00:00Z", "2030-01-01T12:00:00Z"])(
  "legacy layout on %s",
  (date) => {
    test.each([undefined, false, true])("ignores saved preference %s and cannot be enabled", async (preference) => {
      setSystemTime(new Date(date))
      const storage = new Map<string, string>()
      if (preference !== undefined) {
        storage.set("settings.v3", JSON.stringify({ general: { newLayoutDesigns: preference } }))
        storage.set("app-version.v1", JSON.stringify({ version: "1.17.19" }))
      }
      const platform: Platform = {
        platform: "desktop",
        version: "1.18.30",
        openExternal() {},
        restart: async () => {},
        notify: async () => {},
        openDirectoryPickerDialog: async () => null,
        storage: () => ({
          getItem: async (key) => storage.get(key) ?? null,
          setItem: async (key, value) => {
            storage.set(key, value)
          },
          removeItem: async (key) => {
            storage.delete(key)
          },
        }),
      }
      const state = createRoot((dispose) => ({ settings: createSettings(platform), dispose }))
      try {
        expect(state.settings.general.newLayoutDesigns()).toBe(false)
        await state.settings.ready.promise
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(state.settings.ready()).toBe(true)
        expect(state.settings.current.general.newLayoutDesigns).toBe(preference)
        expect(state.settings.general.newLayoutDesigns()).toBe(false)

        state.settings.general.setOldLayoutEligible(true)
        state.settings.general.setNewLayoutDesigns(true)
        expect(state.settings.general.newLayoutDesigns()).toBe(false)
        expect(state.settings.current.general.newLayoutDesigns).toBe(false)

        state.settings.general.setNewLayoutDesigns(false)
        expect(state.settings.general.newLayoutDesigns()).toBe(false)
        expect(JSON.parse(storage.get("settings.v3")!).general.newLayoutDesigns).toBe(false)
        expect(state.settings.visibility.fileTree()).toBe(true)
        expect(state.settings.visibility.search()).toBe(true)
        expect(state.settings.visibility.status()).toBe(true)
        expect(state.settings.visibility.customAgents()).toBe(true)
      } finally {
        state.dispose()
      }
    })
  },
)
