interface ImportMetaEnv {
  readonly OPENRESEARCH_CHANNEL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module "virtual:openresearch-server" {
  export namespace Server {
    export const listen: typeof import("../../../openresearch/dist/types/src/node").Server.listen
    export type Listener = import("../../../openresearch/dist/types/src/node").Server.Listener
  }
  export namespace Config {
    export const get: typeof import("../../../openresearch/dist/types/src/node").Config.get
    export type Info = import("../../../openresearch/dist/types/src/node").Config.Info
  }
  export const bootstrap: typeof import("../../../openresearch/dist/types/src/node").bootstrap
}
