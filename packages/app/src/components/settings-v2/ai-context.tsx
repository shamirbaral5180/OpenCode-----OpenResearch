import type { Config } from "@openresearch-ai/sdk/v2/client"
import { ButtonV2 } from "@openresearch-ai/ui/v2/button-v2"
import { TextareaV2 } from "@openresearch-ai/ui/v2/textarea-v2"
import { type Component } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useServerSync } from "@/context/server-sync"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"

const keys = ["agent", "instructions", "skills", "mcp", "tools", "attachment", "tool_output", "compaction", "experimental"] as const

export const SettingsAIContextV2: Component = () => {
  const language = useLanguage()
  const serverSync = useServerSync()
  const serialize = () => {
    const config = serverSync().data.config as Config & Record<string, unknown>
    return JSON.stringify(Object.fromEntries(keys.map((key) => [key, config[key] ?? defaultValue(key)])), null, 2)
  }
  const initial = serialize()
  const [store, setStore] = createStore({ text: initial, baseline: initial, saving: false })

  const reload = () => {
    const text = serialize()
    setStore({ text, baseline: text })
  }

  const save = async () => {
    setStore("saving", true)
    try {
      const parsed: unknown = JSON.parse(store.text)
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(language.t("settings.aiContext.invalid"))
      }
      const values = parsed as Record<string, unknown>
      const update = Object.fromEntries(keys.filter((key) => key in values).map((key) => [key, values[key]])) as Config
      await serverSync().updateConfig(update)
      const text = JSON.stringify(parsed, null, 2)
      setStore({ text, baseline: text })
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("settings.aiContext.saved"),
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: language.t("common.requestFailed"), description: message })
    } finally {
      setStore("saving", false)
    }
  }

  return (
    <div class="settings-v2-section">
      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.aiContext.architecture.title")}
          description={language.t("settings.aiContext.architecture.description")}
        >
          <div class="flex flex-col gap-2 w-full">
            <span>{language.t("settings.aiContext.retrieval")}</span>
            <span>{language.t("settings.aiContext.memory")}</span>
          </div>
        </SettingsRowV2>
        <SettingsRowV2
          title={language.t("settings.aiContext.config.title")}
          description={language.t("settings.aiContext.config.description")}
        >
          <div class="flex flex-col gap-2 w-full" data-action="settings-ai-context">
            <TextareaV2
              value={store.text}
              onInput={(event) => setStore("text", event.currentTarget.value)}
              rows={26}
              spellcheck={false}
              class="font-mono"
            />
            <div class="flex gap-2 justify-end">
              <ButtonV2 variant="outline" onClick={reload} disabled={store.saving}>
                {language.t("settings.aiContext.reload")}
              </ButtonV2>
              <ButtonV2 onClick={() => void save()} disabled={store.saving || store.text === store.baseline}>
                {language.t("settings.aiContext.save")}
              </ButtonV2>
            </div>
          </div>
        </SettingsRowV2>
      </SettingsListV2>
    </div>
  )
}

function defaultValue(key: (typeof keys)[number]) {
  if (key === "instructions") return []
  if (key === "skills") return { paths: [], urls: [] }
  return {}
}
