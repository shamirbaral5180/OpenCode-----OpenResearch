import { app, dialog, shell } from "electron"
import { createWriteStream } from "node:fs"
import { mkdir } from "node:fs/promises"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { join } from "node:path"
import { createUpdaterController } from "./updater-controller"
import { fetchReleases, selectUpdate, type ReleaseInfo } from "./update-feed"
import { getStore } from "./store"
import { nativeT } from "./native-translations"
import { UPDATER_ENABLED } from "./constants"

const OWNER = "shamirbaral5180"
const REPO = "OpenCode-----OpenResearch"

type Ready = { version: string; path?: string; notes?: string; name?: string }

function persistence() {
  return {
    get: (): Ready | undefined => getStore().get("updaterReady") as Ready | undefined,
    set: (value: Ready) => getStore().set("updaterReady", value),
    clear: () => getStore().delete("updaterReady"),
  }
}

async function download(url: string, destination: string) {
  const response = await fetch(url, { headers: { "User-Agent": "OpenResearch-Updater" } })
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`)
  }
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(destination))
}

export function setupAutoUpdater(stop: () => Promise<void>) {
  return createUpdaterController({
    enabled: UPDATER_ENABLED,
    currentVersion: app.getVersion(),
    backend: {
      checkForUpdates: async () => {
        const releases: ReleaseInfo[] = await fetchReleases({ owner: OWNER, repo: REPO, fetch: globalThis.fetch })
        const update = selectUpdate({
          currentVersion: app.getVersion(),
          releases,
          allowPrerelease: false,
        })
        if (!update) return { isUpdateAvailable: false }
        await mkdir(app.getPath("userData"), { recursive: true })
        const destination = join(app.getPath("userData"), update.asset.name)
        await download(update.asset.browser_download_url, destination)
        return {
          isUpdateAvailable: true,
          updateInfo: { version: update.version },
          ready: { version: update.version, path: destination, notes: update.notes, name: update.name },
        }
      },
      downloadUpdate: async () => {
        // The installer is already downloaded during the check; nothing to do.
        return undefined
      },
      quitAndInstall: async (ready) => {
        await stop()
        if (process.platform === "win32") {
          const error = await shell.openPath(ready.path ?? "")
          if (error) {
            dialog.showErrorBox(nativeT("desktop.fork.updater.installFailed"), error)
            return
          }
          app.quit()
          return
        }
        await shell.openPath(ready.path ?? "")
        app.quit()
      },
    },
    persistence: persistence(),
    stop,
  })
}

export async function showUpdaterDialog(controller: ReturnType<typeof setupAutoUpdater>, alertOnFail: boolean) {
  const state = await controller.check()
  if (state.status === "ready") return
  if (!alertOnFail) return
  if (state.status === "up-to-date") {
    await dialog.showMessageBox({ type: "info", message: nativeT("desktop.updater.dialog.upToDate.message") })
    return
  }
  if (state.status === "error") {
    await dialog.showMessageBox({ type: "error", message: state.message })
  }
}
