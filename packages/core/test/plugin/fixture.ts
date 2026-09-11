import { AgentV2 } from "@openresearch-ai/core/agent"
import { AISDK } from "@openresearch-ai/core/aisdk"
import { Catalog } from "@openresearch-ai/core/catalog"
import { CommandV2 } from "@openresearch-ai/core/command"
import { Credential } from "@openresearch-ai/core/credential"
import { AppNodeBuilder } from "@openresearch-ai/core/effect/app-node-builder"
import { LayerNodePlatform } from "@openresearch-ai/core/effect/app-node-platform"
import { LayerNode } from "@openresearch-ai/core/effect/layer-node"
import { EventV2 } from "@openresearch-ai/core/event"
import { FileSystem } from "@openresearch-ai/core/filesystem"
import { FSUtil } from "@openresearch-ai/core/fs-util"
import { Integration } from "@openresearch-ai/core/integration"
import { Location } from "@openresearch-ai/core/location"
import { Npm } from "@openresearch-ai/core/npm"
import { PluginV2 } from "@openresearch-ai/core/plugin"
import { Reference } from "@openresearch-ai/core/reference"
import { SkillV2 } from "@openresearch-ai/core/skill"
import { Effect, Layer } from "effect"
import { tempLocationLayer } from "../fixture/location"

const npmLayer = Layer.succeed(
  Npm.Service,
  Npm.Service.of({
    add: () => Effect.succeed({ directory: "", entrypoint: undefined }),
    install: () => Effect.void,
    which: () => Effect.succeed(undefined),
  }),
)

export const PluginTestLayer = AppNodeBuilder.build(
  LayerNode.group([
    FileSystem.node,
    FSUtil.node,
    Location.node,
    Npm.node,
    Credential.node,
    EventV2.node,
    LayerNodePlatform.httpClient,
    PluginV2.node,
    AgentV2.node,
    AISDK.node,
    Catalog.node,
    CommandV2.node,
    Integration.node,
    Reference.node,
    SkillV2.node,
  ]),
  [
    [Location.node, tempLocationLayer],
    [Npm.node, npmLayer],
  ],
)
