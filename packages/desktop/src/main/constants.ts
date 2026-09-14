type Channel = "dev" | "beta" | "prod"
const raw = import.meta.env.OPENRESEARCH_CHANNEL
export const CHANNEL: Channel = raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

// Updates are only published for release channels. Local dev builds never
// contact a release feed.
export const UPDATER_ENABLED = CHANNEL !== "dev"
