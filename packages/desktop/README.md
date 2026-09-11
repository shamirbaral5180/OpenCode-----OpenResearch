# OpenResearch Desktop

The local OpenResearch fork, built with Electron. Upstream updates and hosted UI fallback are disabled.

Before running desktop `predev` or `prebuild`, build the fork CLI from `packages/openresearch`:

```bash
bun script/build.ts --single --skip-install
```

The hooks copy `packages/openresearch/dist/openresearch-<os>-<arch>/bin/openresearch` (`windows` and `.exe` on Windows)
into desktop resources, then build the local Node server. They never download an upstream CLI and fail if
the local artifact is missing. Rebuild the CLI after source changes. For a non-native `RUST_TARGET`, provide
the corresponding locally compiled artifact first; `--single` builds only the host target.

Automatic and manual desktop upgrades are disabled in every channel. WSL CLI provisioning is unsupported:
build and provision this fork locally inside WSL instead. The desktop will not run the upstream installer.

## Development

```bash
bun install
bun dev
```

## Build

Run the `build` script to build the app's JS assets, then `package` to
bundle the assets as an application. The resulting app will be in `dist/`.

```bash
bun run build && bun run package
```
