import {
  DESKTOP_NATIVE_ENGLISH,
  DESKTOP_NATIVE_KEYS,
  formatDesktopNativeMessage,
  type DesktopNativeBundle,
  type DesktopNativeKey,
} from "@openresearch-ai/app/i18n/desktop-native"

let bundle: DesktopNativeBundle = { locale: "en", messages: { ...DESKTOP_NATIVE_ENGLISH } }

const forkMessages = {
  "desktop.fork.updater.disabled":
    "OpenResearch updates are disabled. Rebuild and install from local source.",
  "desktop.fork.updater.installFailed": "OpenResearch could not launch the downloaded update.",
  "desktop.fork.wsl.unsupported":
    "OpenResearch WSL integration is disabled to keep this application isolated.",
} as const

export function setNativeTranslations(next: DesktopNativeBundle) {
  if (
    next.locale === bundle.locale &&
    DESKTOP_NATIVE_KEYS.every((key) => next.messages[key] === bundle.messages[key])
  ) {
    return false
  }
  bundle = next
  return true
}

export function nativeT(key: DesktopNativeKey | keyof typeof forkMessages, params?: Record<string, string | number>) {
  const message = key in forkMessages
    ? forkMessages[key as keyof typeof forkMessages]
    : bundle.messages[key as DesktopNativeKey]
  return formatDesktopNativeMessage(message.replace(/OpenResearch(?:Research)?/g, "OpenResearch"), params)
}
