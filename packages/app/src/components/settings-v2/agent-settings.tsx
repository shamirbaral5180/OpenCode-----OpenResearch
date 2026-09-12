import { For, Show, type Component, type JSX } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSync } from "@/context/server-sync"
import "./settings-v2.css"

export const SettingsAgentV2: Component = () => {
  const language = useLanguage()
  const serverSync = useServerSync()
  const config = () => serverSync().data.config
  const agent = () => config().agent?.research
  const unavailable = () => language.t("settings.agent.unavailable")
  const json = (value: unknown) => (value === undefined ? unavailable() : JSON.stringify(value, null, 2))
  const roles = () => Object.entries(config().agent ?? {}).filter(([name]) => name !== "research")

  const parameters = () =>
    json(
      agent() && {
        temperature: agent()?.temperature,
        top_p: agent()?.top_p,
        steps: agent()?.steps,
        variant: agent()?.variant ?? null,
      },
    )

  return (
    <>
      <div class="settings-v2-tab-header">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">{language.t("settings.agent.title")}</h2>
          <span class="settings-v2-locked-badge">{language.t("settings.agent.locked")}</span>
        </div>
      </div>
      <div class="settings-v2-tab-body" data-testid="research-policy-readonly">
        <p class="settings-v2-note">{language.t("settings.agent.locked.description")}</p>

        <PolicySection title={language.t("settings.agent.section.direction")}>
          <PolicyBlock
            title={language.t("settings.agent.prompt.title")}
            description={language.t("settings.agent.policy.description")}
            value={agent()?.prompt ?? unavailable()}
          />
          <InfoBlock
            title={language.t("settings.agent.instructions.title")}
            body={language.t("settings.agent.instructions.locked")}
          />
        </PolicySection>

        <PolicySection title={language.t("settings.agent.section.model")}>
          <PolicyBlock
            title={language.t("settings.agent.model.title")}
            description={language.t("settings.agent.model.locked")}
            value={agent()?.model ?? config().model ?? language.t("settings.agent.model.session")}
          />
          <PolicyBlock
            title={language.t("settings.agent.parameters")}
            description={language.t("settings.agent.parameters.description")}
            value={parameters()}
          />
        </PolicySection>

        <PolicySection title={language.t("settings.agent.section.tools")}>
          <InfoBlock
            title={language.t("settings.agent.permission.title")}
            body={language.t("settings.agent.tools.locked")}
          />
          <PolicyBlock title={language.t("settings.agent.section.tools")} value={json(agent()?.permission)} />
        </PolicySection>

        <PolicySection title={language.t("settings.agent.section.memory")}>
          <PolicyBlock title={language.t("settings.agent.section.memory")} value={json(config().compaction)} />
        </PolicySection>

        <PolicySection title={language.t("settings.agent.section.skills")}>
          <InfoBlock
            title={language.t("settings.agent.section.skills")}
            body={language.t("settings.agent.skills.locked")}
          />
        </PolicySection>

        <PolicySection title={language.t("settings.agent.roles")}>
          <For each={roles()}>
            {([name, role]) => (
              <details class="settings-v2-details">
                <summary>{name}</summary>
                <PolicyBody value={json(role)} />
              </details>
            )}
          </For>
        </PolicySection>
      </div>
    </>
  )
}

const PolicySection: Component<{ title: string; children: JSX.Element }> = (props) => (
  <section class="settings-v2-section">
    <h3 class="settings-v2-section-title">{props.title}</h3>
    {props.children}
  </section>
)

const PolicyBlock: Component<{ title: string; description?: string; value: string }> = (props) => (
  <div class="settings-v2-policy">
    <div class="settings-v2-policy-header">
      <span class="settings-v2-policy-header-title">{props.title}</span>
      <Show when={props.description}>
        <span class="settings-v2-policy-header-note">{props.description}</span>
      </Show>
    </div>
    <PolicyBody value={props.value} />
  </div>
)

const PolicyBody: Component<{ value: string }> = (props) => (
  <pre class="settings-v2-policy-body" tabIndex={0}>
    {props.value}
  </pre>
)

const InfoBlock: Component<{ title: string; body: string }> = (props) => (
  <div class="settings-v2-info">
    <span class="settings-v2-info-title">{props.title}</span>
    <p class="settings-v2-info-body">{props.body}</p>
  </div>
)
