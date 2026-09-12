import type { Config } from "@openresearch-ai/sdk/v2/client"
import { type Component } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSync } from "@/context/server-sync"
import "./settings-v2.css"

const keys = [
  "agent",
  "instructions",
  "skills",
  "mcp",
  "tools",
  "attachment",
  "tool_output",
  "compaction",
  "experimental",
] as const

export const SettingsAIContextV2: Component = () => {
  const language = useLanguage()
  const serverSync = useServerSync()
  const serialize = () => {
    const config = serverSync().data.config as Config & Record<string, unknown>
    return JSON.stringify(Object.fromEntries(keys.map((key) => [key, config[key] ?? defaultValue(key)])), null, 2)
  }

  return (
    <>
      <div class="settings-v2-tab-header">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">{language.t("settings.tab.aiContext")}</h2>
          <span class="settings-v2-locked-badge">{language.t("settings.agent.locked")}</span>
        </div>
      </div>
      <div class="settings-v2-tab-body" data-testid="ai-context-readonly">
        <p class="settings-v2-note">{language.t("settings.aiContext.config.description")}</p>

        <section class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.aiContext.architecture.title")}</h3>
          <div class="settings-v2-info">
            <span class="settings-v2-info-title">{language.t("settings.aiContext.architecture.title")}</span>
            <p class="settings-v2-info-body">{language.t("settings.aiContext.architecture.description")}</p>
            <p class="settings-v2-info-body">{language.t("settings.aiContext.retrieval")}</p>
            <p class="settings-v2-info-body">{language.t("settings.aiContext.memory")}</p>
          </div>
        </section>

        <section class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.aiContext.config.title")}</h3>
          <div class="settings-v2-policy">
            <div class="settings-v2-policy-header">
              <span class="settings-v2-policy-header-title">{language.t("settings.aiContext.config.title")}</span>
            </div>
            <pre class="settings-v2-policy-body" tabIndex={0} data-action="settings-ai-context">
              {serialize()}
            </pre>
          </div>
        </section>
      </div>
    </>
  )
}

function defaultValue(key: (typeof keys)[number]) {
  if (key === "instructions") return []
  if (key === "skills") return { paths: [], urls: [] }
  return {}
}
