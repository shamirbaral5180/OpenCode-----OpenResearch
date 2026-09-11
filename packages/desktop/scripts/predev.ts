import { $ } from "bun"
await $`bun run install-electron`

await $`bun ./scripts/copy-icons.ts ${process.env.OPENRESEARCH_CHANNEL ?? "dev"}`

await $`cd ../openresearch && bun script/build-node.ts`
