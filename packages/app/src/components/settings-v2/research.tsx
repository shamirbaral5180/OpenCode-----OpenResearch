import { type Component } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSync } from "@/context/server-sync"

export const SettingsSystemPromptV2: Component = () => {
  const language = useLanguage()
  const sync = useServerSync()
  return (
    <section class="settings-v2-section">
      <p>{language.t("settings.agent.locked.description")}</p>
      <pre class="whitespace-pre-wrap break-words text-12" tabIndex={0}>
        {sync().data.config.agent?.research?.prompt ?? language.t("settings.agent.unavailable")}
      </pre>
    </section>
  )
}

export const SettingsSkillsV2: Component = () => {
  const language = useLanguage()
  return <p class="text-text-weak text-13">{language.t("settings.agent.skills.locked")}</p>
}
