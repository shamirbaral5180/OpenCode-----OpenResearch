<p align="center">
  <a href="https://openresearch.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenResearch logo">
    </picture>
  </a>
</p>
<p align="center">Den open source AI-kodeagent.</p>
<p align="center">
  <a href="https://openresearch.ai/discord"><img alt="Discord" src="https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord" /></a>
  <a href="https://www.npmjs.com/package/openresearch-ai"><img alt="npm" src="https://img.shields.io/npm/v/openresearch-ai?style=flat-square" /></a>
  <a href="https://github.com/anomalyco/openresearch/actions/workflows/publish.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/anomalyco/openresearch/publish.yml?style=flat-square&branch=dev" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.it.md">Italiano</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.bs.md">Bosanski</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.no.md">Norsk</a> |
  <a href="README.br.md">Português (Brasil)</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.uk.md">Українська</a> |
  <a href="README.bn.md">বাংলা</a> |
  <a href="README.gr.md">Ελληνικά</a> |
  <a href="README.vi.md">Tiếng Việt</a>
</p>

[![OpenResearch Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://openresearch.ai)

---

### Installation

```bash
# YOLO
curl -fsSL https://openresearch.ai/install | bash

# Pakkehåndteringer
npm i -g openresearch-ai@latest        # eller bun/pnpm/yarn
scoop install openresearch             # Windows
choco install openresearch             # Windows
brew install anomalyco/tap/openresearch # macOS og Linux (anbefalet, altid up to date)
brew install openresearch              # macOS og Linux (officiel brew formula, opdateres sjældnere)
sudo pacman -S openresearch            # Arch Linux (Stable)
paru -S openresearch-bin               # Arch Linux (Latest from AUR)
mise use -g openresearch               # alle OS
nix run nixpkgs#openresearch           # eller github:anomalyco/openresearch for nyeste dev-branch
```

> [!TIP]
> Fjern versioner ældre end 0.1.x før installation.

### Desktop-app (BETA)

OpenResearch findes også som desktop-app. Download direkte fra [releases-siden](https://github.com/anomalyco/openresearch/releases) eller [openresearch.ai/download](https://openresearch.ai/download).

| Platform              | Download                           |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `openresearch-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `openresearch-desktop-mac-x64.dmg`     |
| Windows               | `openresearch-desktop-windows-x64.exe` |
| Linux                 | `.deb`, `.rpm`, eller AppImage     |

```bash
# macOS (Homebrew)
brew install --cask openresearch-desktop
# Windows (Scoop)
scoop bucket add extras; scoop install extras/openresearch-desktop
```

#### Installationsmappe

Installationsscriptet bruger følgende prioriteringsrækkefølge for installationsstien:

1. `$OPENRESEARCH_INSTALL_DIR` - Tilpasset installationsmappe
2. `$XDG_BIN_DIR` - Sti der følger XDG Base Directory Specification
3. `$HOME/bin` - Standard bruger-bin-mappe (hvis den findes eller kan oprettes)
4. `$HOME/.openresearch/bin` - Standard fallback

```bash
# Eksempler
OPENRESEARCH_INSTALL_DIR=/usr/local/bin curl -fsSL https://openresearch.ai/install | bash
XDG_BIN_DIR=$HOME/.local/bin curl -fsSL https://openresearch.ai/install | bash
```

### Agents

OpenResearch har to indbyggede agents, som du kan skifte mellem med `Tab`-tasten.

- **build** - Standard, agent med fuld adgang til udviklingsarbejde
- **plan** - Skrivebeskyttet agent til analyse og kodeudforskning
  - Afviser filredigering som standard
  - Spørger om tilladelse før bash-kommandoer
  - Ideel til at udforske ukendte kodebaser eller planlægge ændringer

Derudover findes der en **general**-subagent til komplekse søgninger og flertrinsopgaver.
Den bruges internt og kan kaldes via `@general` i beskeder.

Læs mere om [agents](https://openresearch.ai/docs/agents).

### Dokumentation

For mere info om konfiguration af OpenResearch, [**se vores docs**](https://openresearch.ai/docs).

### Bidrag

Hvis du vil bidrage til OpenResearch, så læs vores [contributing docs](./CONTRIBUTING.md) før du sender en pull request.

### Bygget på OpenResearch

Hvis du arbejder på et projekt der er relateret til OpenResearch og bruger "openresearch" som en del af navnet; f.eks. "openresearch-dashboard" eller "openresearch-mobile", så tilføj en note i din README, der tydeliggør at projektet ikke er bygget af OpenResearch-teamet og ikke er tilknyttet os på nogen måde.

---

**Bliv en del af vores community** [Discord](https://discord.gg/openresearch) | [X.com](https://x.com/openresearch)
