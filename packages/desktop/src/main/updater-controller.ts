import type { UpdaterState } from "@openresearch-ai/app/updater"

export type { UpdaterState } from "@openresearch-ai/app/updater"

export type UpdaterReadyRecord = {
  version: string
  path?: string
  notes?: string
  name?: string
}

export type UpdaterBackend = {
  checkForUpdates(): Promise<
    | {
        isUpdateAvailable?: boolean
        updateInfo?: { version?: string }
        ready?: UpdaterReadyRecord
      }
    | null
    | undefined
  >
  downloadUpdate(): Promise<unknown>
  quitAndInstall(ready: UpdaterReadyRecord): void
}

type UpdaterPersistence = {
  get(): UpdaterReadyRecord | undefined | Promise<UpdaterReadyRecord | undefined>
  set(value: UpdaterReadyRecord): void | Promise<void>
  clear(): void | Promise<void>
}

export function createUpdaterController(input: {
  enabled: boolean
  currentVersion: string
  backend: UpdaterBackend
  persistence: UpdaterPersistence
  stop: () => Promise<void>
  log?: (message: string, data?: object) => void
}) {
  let state: UpdaterState = input.enabled ? { status: "idle" } : { status: "disabled" }
  let ready: UpdaterReadyRecord | undefined
  let pending: Promise<UpdaterState> | undefined
  const listeners = new Set<(state: UpdaterState) => void>()

  const transition = (next: UpdaterState) => {
    input.log?.("updater state changed", { from: state.status, to: next.status })
    state = next
    listeners.forEach((listener) => listener(state))
    return state
  }

  const check = () => {
    if (!input.enabled) return Promise.resolve(state)
    if (state.status === "ready") return Promise.resolve(state)
    if (pending) return pending

    pending = (async () => {
      transition({ status: "checking" })
      const result = await input.backend.checkForUpdates()
      const version = result?.updateInfo?.version
      if (!result?.isUpdateAvailable || !version || version === input.currentVersion) {
        ready = undefined
        await input.persistence.clear()
        return transition({ status: "up-to-date" })
      }

      transition({ status: "downloading", version })
      await input.backend.downloadUpdate()
      ready = result.ready ?? { version }
      await input.persistence.set(ready)
      return transition({ status: "ready", version })
    })()
      .catch((error) =>
        transition({ status: "error", message: error instanceof Error ? error.message : String(error) }),
      )
      .finally(() => {
        pending = undefined
      })
    return pending
  }

  return {
    getState: () => state,
    subscribe(listener: (state: UpdaterState) => void) {
      listeners.add(listener)
      listener(state)
      return () => listeners.delete(listener)
    },
    async start() {
      if (!input.enabled) return state
      const persisted = await input.persistence.get()
      if (persisted?.version === input.currentVersion) await input.persistence.clear()
      return check()
    },
    check,
    async install() {
      if (!input.enabled) return
      if (state.status !== "ready") throw new Error("Update is not ready to install")
      const version = state.version
      const record: UpdaterReadyRecord = ready ?? { version }
      transition({ status: "installing", version })
      await input
        .stop()
        .then(() => {
          input.backend.quitAndInstall(record)
          transition({ status: "ready", version })
        })
        .catch((error) => {
          transition({ status: "ready", version })
          throw error
        })
    },
  }
}

export type UpdaterController = ReturnType<typeof createUpdaterController>
