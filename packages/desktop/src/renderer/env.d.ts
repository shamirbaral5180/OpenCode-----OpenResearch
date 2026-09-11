import type { ElectronAPI } from "../preload/types"

declare global {
  interface Window {
    api: ElectronAPI
    __OPENRESEARCH__?: {
      deepLinks?: string[]
    }
  }
}
