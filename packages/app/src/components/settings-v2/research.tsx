import { ButtonV2 } from "@openresearch-ai/ui/v2/button-v2"
import { TextInputV2 } from "@openresearch-ai/ui/v2/text-input-v2"
import { TextareaV2 } from "@openresearch-ai/ui/v2/textarea-v2"
import { createMemo, createResource, createSignal, For, Show, type Component } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerProtocol, useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"

type SkillInfo = { name: string; description?: string; location: string }

type AgentConfig = {
  agent?: Record<string, { prompt?: string }>
  skills?: { paths?: string[]; urls?: string[] }
}

const useResearchConfig = () => {
  const serverSync = useServerSync()
  return () => serverSync().data.config as AgentConfig
}

export const SettingsSystemPromptV2: Component = () => {
  const language = useLanguage()
  const serverSync = useServerSync()
  const config = useResearchConfig()

  const promptOverride = createMemo(() => config().agent?.research?.prompt ?? "")
  const [prompt, setPrompt] = createSignal(promptOverride())
  const [saving, setSaving] = createSignal(false)

  const save = async () => {
    setSaving(true)
    try {
      await serverSync().updateConfig({ agent: { research: { prompt: prompt().trim() } } })
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("settings.research.prompt.saved.title"),
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: language.t("common.requestFailed"), description: message })
    } finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    setPrompt("")
    setSaving(true)
    try {
      await serverSync().updateConfig({ agent: { research: { prompt: "" } } })
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("settings.research.prompt.reset.title"),
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: language.t("common.requestFailed"), description: message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="settings-v2-section">
      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.systemPrompt.title")}
          description={language.t("settings.systemPrompt.description")}
        >
          <div class="flex flex-col gap-2 w-full" data-action="settings-system-prompt">
            <TextareaV2
              value={prompt()}
              onInput={(event) => setPrompt(event.currentTarget.value)}
              rows={14}
              placeholder={language.t("settings.systemPrompt.placeholder")}
            />
            <div class="flex gap-2 justify-end">
              <ButtonV2 variant="outline" onClick={() => void reset()} disabled={saving()}>
                {language.t("settings.systemPrompt.reset")}
              </ButtonV2>
              <ButtonV2 onClick={() => void save()} disabled={saving() || prompt().trim() === promptOverride()}>
                {language.t("settings.systemPrompt.save")}
              </ButtonV2>
            </div>
          </div>
        </SettingsRowV2>
      </SettingsListV2>
    </div>
  )
}

export const SettingsSkillsV2: Component = () => {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const protocol = useServerProtocol()
  const serverSync = useServerSync()
  const config = useResearchConfig()

  const [saving, setSaving] = createSignal(false)
  const [skillPath, setSkillPath] = createSignal("")
  const [skillUrl, setSkillUrl] = createSignal("")

  const [skills] = createResource<SkillInfo[]>(
    async () => {
      if ((await protocol()) !== "v1") return []
      const result = await serverSdk().client.app.skills()
      return (result.data ?? []).map((skill) => ({
        name: skill.name,
        description: skill.description,
        location: skill.location,
      }))
    },
    { initialValue: [] as SkillInfo[] },
  )

  const skillPaths = createMemo(() => config().skills?.paths ?? [])
  const skillUrls = createMemo(() => config().skills?.urls ?? [])

  const persist = async (paths: string[], urls: string[]) => {
    await serverSync().updateConfig({ skills: { paths, urls } })
  }

  const addPath = async () => {
    const value = skillPath().trim()
    if (!value) return
    setSaving(true)
    try {
      await persist([...new Set([...skillPaths(), value])], skillUrls())
      setSkillPath("")
      showToast({ variant: "success", icon: "circle-check", title: language.t("settings.research.skill.added.title") })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: language.t("common.requestFailed"), description: message })
    } finally {
      setSaving(false)
    }
  }

  const addUrl = async () => {
    const value = skillUrl().trim()
    if (!value) return
    setSaving(true)
    try {
      await persist(skillPaths(), [...new Set([...skillUrls(), value])])
      setSkillUrl("")
      showToast({ variant: "success", icon: "circle-check", title: language.t("settings.research.skill.added.title") })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: language.t("common.requestFailed"), description: message })
    } finally {
      setSaving(false)
    }
  }

  const removePath = async (value: string) => {
    await persist(
      skillPaths().filter((item) => item !== value),
      skillUrls(),
    )
  }

  const removeUrl = async (value: string) => {
    await persist(
      skillPaths(),
      skillUrls().filter((item) => item !== value),
    )
  }

  return (
    <div class="settings-v2-section">
      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.skills.installed.title")}
          description={language.t("settings.skills.installed.description")}
        >
          <div class="flex flex-col gap-2 w-full">
            <Show when={skills().length > 0} fallback={<span>{language.t("settings.research.skills.empty")}</span>}>
              <For each={skills()}>
                {(skill) => (
                  <div class="flex flex-col" data-action={`skill-${skill.name}`}>
                    <span>
                      {skill.name}
                      <Show when={skill.description}> ({skill.description})</Show>
                    </span>
                    <span class="text-muted">{skill.location}</span>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.skills.paths.title")}
          description={language.t("settings.skills.paths.description")}
        >
          <div class="flex flex-col gap-2 w-full">
            <div class="flex gap-2 w-full">
              <TextInputV2
                value={skillPath()}
                onInput={(event) => setSkillPath(event.currentTarget.value)}
                placeholder={language.t("settings.research.skill.paths.placeholder")}
              />
              <ButtonV2 onClick={() => void addPath()} disabled={saving() || !skillPath().trim()}>
                {language.t("settings.research.skill.add")}
              </ButtonV2>
            </div>
            <For each={skillPaths()}>
              {(path) => (
                <div class="flex justify-between items-center gap-2" data-action={`skill-path-${path}`}>
                  <span class="truncate">{path}</span>
                  <ButtonV2 variant="ghost" onClick={() => void removePath(path)}>
                    {language.t("common.remove")}
                  </ButtonV2>
                </div>
              )}
            </For>
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.skills.urls.title")}
          description={language.t("settings.skills.urls.description")}
        >
          <div class="flex flex-col gap-2 w-full">
            <div class="flex gap-2 w-full">
              <TextInputV2
                value={skillUrl()}
                onInput={(event) => setSkillUrl(event.currentTarget.value)}
                placeholder={language.t("settings.research.skill.urls.placeholder")}
              />
              <ButtonV2 onClick={() => void addUrl()} disabled={saving() || !skillUrl().trim()}>
                {language.t("settings.research.skill.add")}
              </ButtonV2>
            </div>
            <For each={skillUrls()}>
              {(url) => (
                <div class="flex justify-between items-center gap-2" data-action={`skill-url-${url}`}>
                  <span class="truncate">{url}</span>
                  <ButtonV2 variant="ghost" onClick={() => void removeUrl(url)}>
                    {language.t("common.remove")}
                  </ButtonV2>
                </div>
              )}
            </For>
          </div>
        </SettingsRowV2>
      </SettingsListV2>
    </div>
  )
}
