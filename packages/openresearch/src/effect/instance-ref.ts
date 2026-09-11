import { Context } from "effect"
import type { InstanceContext } from "@/project/instance-context"
import type { WorkspaceV2 } from "@openresearch-ai/core/workspace"

export const InstanceRef = Context.Reference<InstanceContext | undefined>("~openresearch/InstanceRef", {
  defaultValue: () => undefined,
})

export const WorkspaceRef = Context.Reference<WorkspaceV2.ID | undefined>("~openresearch/WorkspaceRef", {
  defaultValue: () => undefined,
})
