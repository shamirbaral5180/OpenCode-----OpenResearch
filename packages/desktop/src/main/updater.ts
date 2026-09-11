import { app, dialog } from "electron"
import { createUpdaterController } from "./updater-controller"
import { nativeT } from "./native-translations"

export function setupAutoUpdater(stop: () => Promise<void>) {
  return createUpdaterController({
    enabled: false,
    currentVersion: app.getVersion(),
    backend: {
      checkForUpdates: async () => {
        throw new Error(nativeT("desktop.fork.updater.disabled"))
      },
      downloadUpdate: async () => {
        throw new Error(nativeT("desktop.fork.updater.disabled"))
      },
      quitAndInstall: () => {
        throw new Error(nativeT("desktop.fork.updater.disabled"))
      },
    },
    persistence: { get: () => undefined, set: () => {}, clear: () => {} },
    stop,
  })
}

export async function showUpdaterDialog(_controller: ReturnType<typeof setupAutoUpdater>, alertOnFail: boolean) {
  if (!alertOnFail) return
  await dialog.showMessageBox({
    type: "info",
    message: nativeT("desktop.fork.updater.disabled"),
  })
}
