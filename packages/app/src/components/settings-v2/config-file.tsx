import { ButtonV2 } from "@openresearch-ai/ui/v2/button-v2"
import { TextareaV2 } from "@openresearch-ai/ui/v2/textarea-v2"
import type { Config } from "@openresearch-ai/sdk/v2/client"
import { type Component } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useServerSync } from "@/context/server-sync"
import { showToast } from "@/utils/toast"
import "./settings-v2.css"

// Keys the research policy owns. They are shown read-only on the Agent Settings tab
// and must never be written from a free-form config editor.
const LOCKED_KEYS = [
  "agent",
  "mode",
  "default_agent",
  "instructions",
  "permission",
  "tools",
  "compaction",
  "skills",
] as const

export const SettingsConfigFileV2: Component = () => {
  const language = useLanguage()
  const serverSync = useServerSync()
  const unavailable = () => language.t("settings.agent.unavailable")
  const json = (value: unknown) => JSON.stringify(value ?? {}, null, 2)

  const editable = () => {
    const source = { ...(serverSync().data.config as Record<string, unknown>) }
    for (const key of LOCKED_KEYS) delete source[key]
    return source
  }
  const initial = json(editable())
  const [store, setStore] = createStore({ text: initial, baseline: initial, saving: false })
  const dirty = () => store.text !== store.baseline

  const reload = () => {
    const text = json(editable())
    setStore({ text, baseline: text })
  }

  const save = async () => {
    setStore("saving", true)
    try {
      const parsed: unknown = JSON.parse(store.text)
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(language.t("settings.configFile.invalid"))
      }
      const values = parsed as Record<string, unknown>
      const rejected = LOCKED_KEYS.filter((key) => key in values)
      if (rejected.length > 0) {
        throw new Error(language.t("settings.configFile.lockedKeys", { keys: rejected.join(", ") }))
      }
      await serverSync().updateConfig(values as Config)
      const text = JSON.stringify(values, null, 2)
      setStore({ text, baseline: text })
      showToast({ variant: "success", icon: "circle-check", title: language.t("settings.configFile.saved") })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: language.t("common.requestFailed"), description: message })
    } finally {
      setStore("saving", false)
    }
  }

  return (
    <>
      <div class="settings-v2-tab-header">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">{language.t("settings.tab.configFile")}</h2>
          <span class="settings-v2-locked-badge">
            {language.t("settings.configFile.path", { path: "~/.config/openresearch/openresearch.json" })}
          </span>
        </div>
      </div>
      <div class="settings-v2-tab-body" data-testid="config-file-editor">
        <p class="settings-v2-note">{language.t("settings.configFile.description")}</p>
        <section class="settings-v2-section">
          <div class="settings-v2-policy">
            <div class="settings-v2-policy-header">
              <span class="settings-v2-policy-header-title">{language.t("settings.configFile.editor")}</span>
            </div>
            <div class="settings-v2-config-editor" data-action="settings-config-file">
              <TextareaV2
                value={store.text}
                onInput={(event) => setStore("text", event.currentTarget.value)}
                rows={22}
                spellcheck={false}
                class="font-mono"
              />
              <div class="settings-v2-config-actions">
                <ButtonV2 variant="outline" onClick={reload} disabled={store.saving}>
                  {language.t("settings.aiContext.reload")}
                </ButtonV2>
                <ButtonV2 onClick={() => void save()} disabled={store.saving || !dirty()}>
                  {language.t("settings.configFile.save")}
                </ButtonV2>
              </div>
            </div>
          </div>
          <div class="settings-v2-info">
            <span class="settings-v2-info-title">{language.t("settings.configFile.locked.title")}</span>
            <p class="settings-v2-info-body">{language.t("settings.configFile.locked.description")}</p>
          </div>
        </section>
      </div>
    </>
  )
}
