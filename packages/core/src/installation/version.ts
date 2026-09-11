declare global {
  const OPENRESEARCH_VERSION: string
  const OPENRESEARCH_CHANNEL: string
}

export const InstallationVersion = typeof OPENRESEARCH_VERSION === "string" ? OPENRESEARCH_VERSION : "local"
export const InstallationChannel = typeof OPENRESEARCH_CHANNEL === "string" ? OPENRESEARCH_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
