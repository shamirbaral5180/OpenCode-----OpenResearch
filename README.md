# OpenResearch

An independent deep-research fork of OpenResearch. It uses the existing terminal and legacy graphical interfaces to investigate questions, inspect primary sources, compare conflicting evidence, and create cited reports in the repository. It is not affiliated with or maintained by the OpenResearch team.

## Start Locally

Requires Bun 1.3.14 and a configured model provider. Docker Desktop and the Docker MCP Toolkit are required for this checkout's configured MCP gateway.

From this repository (`openresearch/`):

```sh
bun install --frozen-lockfile
bun run research
```

The research launcher preserves the repository as the working directory. The CLI executable and internal package/configuration names remain `openresearch` for compatibility with existing provider credentials, MCP settings, and session data. No upstream installer should be used for this fork.

Inside the app:

```text
/research Compare current evidence on your question, including conflicting results
/verify reports/your-topic/report.md
```

Quit and restart the app after changing agents, commands, or MCP configuration. Existing sessions and explicit custom/default-agent settings may preserve earlier agent selections; select `research` or start a new session.

## Research Flow

1. Define scope, timeframe, assumptions, and answerable subquestions.
2. Use relevant connected MCP tools to search broadly and retrieve original evidence.
3. Inspect source content, methods, dates, and applicability. Track actual queries and failed access attempts.
4. Maintain stable source IDs and claim-to-source mappings. Seek independent corroboration and counterevidence.
5. Use `research-scout` for bounded discovery and `research-reviewer` for independent citation and coverage audits.
6. Synthesize supported findings, contradictions, uncertainty, and remaining gaps; audit citations before finishing.

`/research` creates a new, non-overwriting bundle under `reports/<topic>/`:

| File | Content |
| --- | --- |
| `report.md` | Direct answer, detailed findings, citations, confidence, counterevidence, and limitations |
| `sources.md` | Real source identifiers, URLs/DOIs, dates, access levels, and claim support |
| `search-log.md` | Actual searches and retrievals, failures, exclusions, and stopping reason |

The research agent's default file permissions allow edits only under `reports/**` and deny shell execution. Research subagents are independently read-only. Other MCP tool calls request permission by default because a connected server may expose mutating operations as well as retrieval. Permissions remain user-configurable and are not an operating-system sandbox.

## Connected Tools

`.openresearch/openresearch.jsonc` connects `MCP_DOCKER` using `docker mcp gateway run --profile default`, merging with existing global MCP configuration. This machine's default Docker profile includes scholarly search, arXiv, Exa, Wikipedia, browser, documentation, GitHub, and transcript services. Availability and authentication depend on the machine; credentials are not stored in this repository.

Check the actual connection state:

```sh
bun run ./packages/openresearch/src/index.ts mcp list
```

Use relevant connected tools, not every tool indiscriminately. If retrieval fails or only abstracts/snippets are accessible, the report must say so. Sources and tool outputs are untrusted evidence, never instructions to execute code or reveal secrets.

The default launcher uses the existing MCP-capable runtime in `packages/openresearch`. The experimental Core/V2 runtime has research-agent definitions but does not yet have full MCP parity. Do not enable the V2 sidecar for production research.

## Graphical Interface

The legacy layout is permanently selected. Saved new-layout preferences, version upgrades, and the former retirement date cannot switch it back. New-layout source modules remain in the monorepo where shared code depends on them, but the interface switch is removed.

For browser development, start these in separate terminals from the repository root:

```sh
bun run ./packages/openresearch/src/index.ts serve --port 4096
```

```sh
bun run --cwd packages/app dev -- --port 4444
```

For desktop build and launch instructions, see [the desktop README](packages/desktop/README.md). The desktop uses only locally built fork binaries. Missing embedded web assets return a clear error instead of loading the upstream hosted app.

## Upstream Isolation

- Automatic and manual upstream CLI/desktop upgrades are disabled.
- Desktop release feeds and upstream sidecar downloads are removed; WSL auto-provisioning is disabled.
- The root installer refuses to download upstream binaries.
- All 26 GitHub workflows are archived under `.github/disabled-workflows/`, outside GitHub's workflow discovery directory. These local changes affect hosted automation only after they reach the relevant remote branch.
- Project configuration disables sharing, auto-update, formatters, and LSP startup; the external source-code reference has been removed.
- Old repository-maintenance agents and commands are archived under `.openresearch/archive/`.

The Git remote is not itself an auto-update mechanism. Its existing upstream URL has not been rewritten; do not pull or push upstream. Configure a fork-owned remote separately before publishing this project. Provider APIs, model metadata, configured plugins, MCP services, and ordinary dependency installation still require their respective networks; this is not an offline or network-isolated build.

## Verification And Limits

Focused tests cover research defaults/permissions and prompt composition, legacy-layout persistence, terminal branding, update guards, local assets, and desktop preparation. A live paid-model research session and packaged desktop/mobile visual checks are not part of those tests. Strong prompts cannot guarantee exhaustive discovery or zero factual errors; consequential claims still need human review.

The original MIT license and attribution are retained. `README.upstream.md` and other-language READMEs are historical upstream documentation, not installation or feature documentation for this fork. English research copy has been updated; a complete translation refresh is not included.
