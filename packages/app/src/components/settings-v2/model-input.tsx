import { ButtonV2 } from "@openresearch-ai/ui/v2/button-v2"
import type { ModelInputSnapshot } from "@openresearch-ai/sdk/v2/client"
import { For, Match, Switch, createResource, type Accessor, type Component } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"

export const SettingsModelInputV2: Component<{
  sessionID?: string
  directory: Accessor<string | undefined>
}> = (props) => {
  const language = useLanguage()
  const serverSDK = useServerSDK()
  const [snapshot, controls] = createResource(
    () => ({ sessionID: props.sessionID, directory: props.directory() }),
    async (source): Promise<ModelInputSnapshot | null> => {
      if (!source.sessionID) return null
      const result = await serverSDK().client.session.modelInput({
        sessionID: source.sessionID,
        directory: source.directory,
      })
      if (result.error) throw result.error
      return result.data ?? null
    },
  )

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">{language.t("settings.modelInput.title")}</h2>
        <ButtonV2 variant="outline" onClick={() => void controls.refetch()} disabled={!props.sessionID || snapshot.loading}>
          {language.t("settings.modelInput.refresh")}
        </ButtonV2>
      </div>

      <div class="settings-v2-tab-body">
        <Switch>
          <Match when={!props.sessionID}>
            <div class="text-text-weak">{language.t("settings.modelInput.noSession")}</div>
          </Match>
          <Match when={snapshot.error}>
            <div class="text-text-weak">
              {language.t("settings.modelInput.loadFailed", { error: String(snapshot.error) })}
            </div>
          </Match>
          <Match when={snapshot.loading}>
            <div class="text-text-weak">{language.t("settings.modelInput.loading")}</div>
          </Match>
          <Match when={!snapshot()}>
            <div class="text-text-weak">{language.t("settings.modelInput.empty")}</div>
          </Match>
          <Match when={snapshot()}>
            {(data) => (
              <>
                <SettingsListV2>
                  <SettingsRowV2
                    title={language.t("settings.modelInput.request.title")}
                    description={language.t("settings.modelInput.request.description")}
                  >
                    <ModelInputCode
                      value={{
                        capturedAt: new Date(Number(data().capturedAt)).toISOString(),
                        providerID: data().providerID,
                        modelID: data().modelID,
                        agent: data().agent,
                        ...data().request,
                      }}
                    />
                  </SettingsRowV2>
                  <SettingsRowV2
                    title={language.t("settings.modelInput.system.title")}
                    description={language.t("settings.modelInput.system.description")}
                  >
                    <div class="flex flex-col gap-3 w-full min-w-0">
                      <For each={data().system}>
                        {(part, index) => (
                          <div class="flex flex-col gap-1 min-w-0">
                            <span class="text-text-weak">{language.t("settings.modelInput.system.part", { number: index() + 1 })}</span>
                            <ModelInputCode value={part} />
                          </div>
                        )}
                      </For>
                    </div>
                  </SettingsRowV2>
                  <SettingsRowV2
                    title={language.t("settings.modelInput.messages.title")}
                    description={language.t("settings.modelInput.messages.description")}
                  >
                    <ModelInputCode value={data().messages} />
                  </SettingsRowV2>
                  <SettingsRowV2
                    title={language.t("settings.modelInput.tools.title")}
                    description={language.t("settings.modelInput.tools.description", { count: data().tools.length })}
                  >
                    <ModelInputCode value={data().tools} />
                  </SettingsRowV2>
                </SettingsListV2>
              </>
            )}
          </Match>
        </Switch>
      </div>
    </>
  )
}

const ModelInputCode: Component<{ value: unknown }> = (props) => (
  <pre class="w-full min-w-0 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-base px-3 py-2 text-12-regular font-mono select-text">
    {typeof props.value === "string" ? props.value : JSON.stringify(props.value, null, 2)}
  </pre>
)
