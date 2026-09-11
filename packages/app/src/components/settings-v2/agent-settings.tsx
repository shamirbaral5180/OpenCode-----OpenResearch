import type { Config } from "@openresearch-ai/sdk/v2/client"
import { ButtonV2 } from "@openresearch-ai/ui/v2/button-v2"
import { Switch } from "@openresearch-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@openresearch-ai/ui/v2/text-input-v2"
import { TextareaV2 } from "@openresearch-ai/ui/v2/textarea-v2"
import { type Component } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useServerSync } from "@/context/server-sync"
import { showToast } from "@/utils/toast"
import { SettingsSkillsV2 } from "./research"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"

type ResearchAgent = {
  prompt?: string
  model?: string
  variant?: string
  temperature?: number
  top_p?: number
  steps?: number
  permission?: Record<string, unknown>
  options?: Record<string, unknown>
}

type AgentSettingsConfig = Config & {
  agent?: Record<string, ResearchAgent>
  instructions?: string[]
  compaction?: {
    auto?: boolean
    prune?: boolean
    tail_turns?: number
    preserve_recent_tokens?: number
    reserved?: number
  }
}

export const SettingsAgentV2: Component = () => {
  const language = useLanguage()
  const serverSync = useServerSync()
  const current = () => serverSync().data.config as AgentSettingsConfig
  const values = () => {
    const agent = current().agent?.research ?? {}
    const compaction = current().compaction ?? {}
    return {
      prompt: agent.prompt ?? "",
      instructions: (current().instructions ?? []).join("\n"),
      model: agent.model ?? "",
      variant: agent.variant ?? "",
      temperature: optionalString(agent.temperature),
      topP: optionalString(agent.top_p),
      steps: optionalString(agent.steps),
      permission: JSON.stringify(agent.permission ?? {}, null, 2),
      options: JSON.stringify(agent.options ?? {}, null, 2),
      compactAuto: compaction.auto ?? true,
      compactPrune: compaction.prune ?? false,
      tailTurns: optionalString(compaction.tail_turns),
      preserveTokens: optionalString(compaction.preserve_recent_tokens),
      reservedTokens: optionalString(compaction.reserved),
      saving: false,
    }
  }
  const [store, setStore] = createStore(values())

  const reload = () => setStore(values())
  const save = async () => {
    setStore("saving", true)
    try {
      const permission = parseObject(store.permission, language.t("settings.agent.error.permission"))
      const options = parseObject(store.options, language.t("settings.agent.error.options"))
      const research: ResearchAgent = {
        prompt: store.prompt.trim(),
        permission,
        options,
      }
      if (store.model.trim()) research.model = store.model.trim()
      if (store.variant.trim()) research.variant = store.variant.trim()
      const temperature = parseNumber(store.temperature, 0, 2, false, language.t("settings.agent.error.temperature"))
      const topP = parseNumber(store.topP, 0, 1, false, language.t("settings.agent.error.topP"))
      const steps = parseNumber(store.steps, 1, undefined, true, language.t("settings.agent.error.steps"))
      if (temperature !== undefined) research.temperature = temperature
      if (topP !== undefined) research.top_p = topP
      if (steps !== undefined) research.steps = steps

      await serverSync().updateConfig({
        agent: { research },
        instructions: [...new Set(store.instructions.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))],
        compaction: {
          auto: store.compactAuto,
          prune: store.compactPrune,
          tail_turns: parseNumber(store.tailTurns, 0, undefined, true, language.t("settings.agent.error.tailTurns")),
          preserve_recent_tokens: parseNumber(
            store.preserveTokens,
            0,
            undefined,
            true,
            language.t("settings.agent.error.preserveTokens"),
          ),
          reserved: parseNumber(
            store.reservedTokens,
            0,
            undefined,
            true,
            language.t("settings.agent.error.reservedTokens"),
          ),
        },
      } as Config)
      showToast({ variant: "success", icon: "circle-check", title: language.t("settings.agent.saved") })
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
        <h2 class="settings-v2-tab-title">{language.t("settings.agent.title")}</h2>
        <div class="flex gap-2">
          <ButtonV2 variant="outline" onClick={reload} disabled={store.saving}>
            {language.t("settings.agent.reload")}
          </ButtonV2>
          <ButtonV2 onClick={() => void save()} disabled={store.saving}>
            {language.t("settings.agent.save")}
          </ButtonV2>
        </div>
      </div>

      <div class="settings-v2-tab-body">
        <section class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.agent.section.direction")}</h3>
          <SettingsListV2>
            <SettingsRowV2
              title={language.t("settings.agent.prompt.title")}
              description={language.t("settings.agent.prompt.description")}
            >
              <TextareaV2
                value={store.prompt}
                onInput={(event) => setStore("prompt", event.currentTarget.value)}
                rows={14}
                placeholder={language.t("settings.agent.prompt.placeholder")}
              />
            </SettingsRowV2>
            <SettingsRowV2
              title={language.t("settings.agent.instructions.title")}
              description={language.t("settings.agent.instructions.description")}
            >
              <TextareaV2
                value={store.instructions}
                onInput={(event) => setStore("instructions", event.currentTarget.value)}
                rows={6}
                class="font-mono"
                spellcheck={false}
                placeholder={language.t("settings.agent.instructions.placeholder")}
              />
            </SettingsRowV2>
          </SettingsListV2>
        </section>

        <section class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.agent.section.model")}</h3>
          <SettingsListV2>
            <AgentTextField
              title={language.t("settings.agent.model.title")}
              description={language.t("settings.agent.model.description")}
              value={store.model}
              placeholder={language.t("settings.agent.model.placeholder")}
              onInput={(value) => setStore("model", value)}
            />
            <AgentTextField
              title={language.t("settings.agent.variant.title")}
              description={language.t("settings.agent.variant.description")}
              value={store.variant}
              placeholder={language.t("settings.agent.variant.placeholder")}
              onInput={(value) => setStore("variant", value)}
            />
            <AgentTextField
              title={language.t("settings.agent.temperature.title")}
              description={language.t("settings.agent.temperature.description")}
              value={store.temperature}
              placeholder={language.t("settings.agent.temperature.placeholder")}
              type="number"
              onInput={(value) => setStore("temperature", value)}
            />
            <AgentTextField
              title={language.t("settings.agent.topP.title")}
              description={language.t("settings.agent.topP.description")}
              value={store.topP}
              placeholder={language.t("settings.agent.topP.placeholder")}
              type="number"
              onInput={(value) => setStore("topP", value)}
            />
            <AgentTextField
              title={language.t("settings.agent.steps.title")}
              description={language.t("settings.agent.steps.description")}
              value={store.steps}
              placeholder={language.t("settings.agent.steps.placeholder")}
              type="number"
              onInput={(value) => setStore("steps", value)}
            />
          </SettingsListV2>
        </section>

        <section class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.agent.section.tools")}</h3>
          <SettingsListV2>
            <SettingsRowV2
              title={language.t("settings.agent.permission.title")}
              description={language.t("settings.agent.permission.description")}
            >
              <TextareaV2
                value={store.permission}
                onInput={(event) => setStore("permission", event.currentTarget.value)}
                rows={10}
                class="font-mono"
                spellcheck={false}
              />
            </SettingsRowV2>
            <SettingsRowV2
              title={language.t("settings.agent.options.title")}
              description={language.t("settings.agent.options.description")}
            >
              <TextareaV2
                value={store.options}
                onInput={(event) => setStore("options", event.currentTarget.value)}
                rows={8}
                class="font-mono"
                spellcheck={false}
              />
            </SettingsRowV2>
          </SettingsListV2>
        </section>

        <section class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.agent.section.memory")}</h3>
          <SettingsListV2>
            <SettingsRowV2
              title={language.t("settings.agent.compaction.auto.title")}
              description={language.t("settings.agent.compaction.auto.description")}
            >
              <Switch checked={store.compactAuto} onChange={(value) => setStore("compactAuto", value)} />
            </SettingsRowV2>
            <SettingsRowV2
              title={language.t("settings.agent.compaction.prune.title")}
              description={language.t("settings.agent.compaction.prune.description")}
            >
              <Switch checked={store.compactPrune} onChange={(value) => setStore("compactPrune", value)} />
            </SettingsRowV2>
            <AgentTextField
              title={language.t("settings.agent.compaction.tailTurns.title")}
              description={language.t("settings.agent.compaction.tailTurns.description")}
              value={store.tailTurns}
              placeholder={language.t("settings.agent.optional")}
              type="number"
              onInput={(value) => setStore("tailTurns", value)}
            />
            <AgentTextField
              title={language.t("settings.agent.compaction.preserveTokens.title")}
              description={language.t("settings.agent.compaction.preserveTokens.description")}
              value={store.preserveTokens}
              placeholder={language.t("settings.agent.optional")}
              type="number"
              onInput={(value) => setStore("preserveTokens", value)}
            />
            <AgentTextField
              title={language.t("settings.agent.compaction.reservedTokens.title")}
              description={language.t("settings.agent.compaction.reservedTokens.description")}
              value={store.reservedTokens}
              placeholder={language.t("settings.agent.optional")}
              type="number"
              onInput={(value) => setStore("reservedTokens", value)}
            />
          </SettingsListV2>
        </section>

        <section class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.agent.section.skills")}</h3>
          <SettingsSkillsV2 />
        </section>
      </div>
    </>
  )
}

const AgentTextField: Component<{
  title: string
  description: string
  value: string
  placeholder: string
  type?: "text" | "number"
  onInput: (value: string) => void
}> = (props) => (
  <SettingsRowV2 title={props.title} description={props.description}>
    <div class="w-full sm:w-[280px]">
      <TextInputV2
        type={props.type ?? "text"}
        value={props.value}
        onInput={(event) => props.onInput(event.currentTarget.value)}
        placeholder={props.placeholder}
        spellcheck={false}
      />
    </div>
  </SettingsRowV2>
)

function optionalString(value: number | undefined) {
  return value === undefined ? "" : String(value)
}

function parseObject(value: string, message: string) {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(message)
    return parsed as Record<string, unknown>
  } catch {
    throw new Error(message)
  }
}

function parseNumber(value: string, min: number, max: number | undefined, integer: boolean, message: string) {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < min || (max !== undefined && parsed > max) || (integer && !Number.isInteger(parsed))) {
    throw new Error(message)
  }
  return parsed
}
