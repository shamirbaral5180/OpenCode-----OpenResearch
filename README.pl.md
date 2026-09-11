<p align="center">
  <a href="https://openresearch.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenResearch logo">
    </picture>
  </a>
</p>
<p align="center">Otwartoźródłowy agent kodujący AI.</p>
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

### Instalacja

```bash
# YOLO
curl -fsSL https://openresearch.ai/install | bash

# Menedżery pakietów
npm i -g openresearch-ai@latest        # albo bun/pnpm/yarn
scoop install openresearch             # Windows
choco install openresearch             # Windows
brew install anomalyco/tap/openresearch # macOS i Linux (polecane, zawsze aktualne)
brew install openresearch              # macOS i Linux (oficjalna formuła brew, rzadziej aktualizowana)
sudo pacman -S openresearch            # Arch Linux (Stable)
paru -S openresearch-bin               # Arch Linux (Latest from AUR)
mise use -g openresearch               # dowolny system
nix run nixpkgs#openresearch           # lub github:anomalyco/openresearch dla najnowszej gałęzi dev
```

> [!TIP]
> Przed instalacją usuń wersje starsze niż 0.1.x.

### Aplikacja desktopowa (BETA)

OpenResearch jest także dostępny jako aplikacja desktopowa. Pobierz ją bezpośrednio ze strony [releases](https://github.com/anomalyco/openresearch/releases) lub z [openresearch.ai/download](https://openresearch.ai/download).

| Platforma             | Pobieranie                         |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `openresearch-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `openresearch-desktop-mac-x64.dmg`     |
| Windows               | `openresearch-desktop-windows-x64.exe` |
| Linux                 | `.deb`, `.rpm` lub AppImage        |

```bash
# macOS (Homebrew)
brew install --cask openresearch-desktop
# Windows (Scoop)
scoop bucket add extras; scoop install extras/openresearch-desktop
```

#### Katalog instalacji

Skrypt instalacyjny stosuje następujący priorytet wyboru ścieżki instalacji:

1. `$OPENRESEARCH_INSTALL_DIR` - Własny katalog instalacji
2. `$XDG_BIN_DIR` - Ścieżka zgodna ze specyfikacją XDG Base Directory
3. `$HOME/bin` - Standardowy katalog binarny użytkownika (jeśli istnieje lub można go utworzyć)
4. `$HOME/.openresearch/bin` - Domyślny fallback

```bash
# Przykłady
OPENRESEARCH_INSTALL_DIR=/usr/local/bin curl -fsSL https://openresearch.ai/install | bash
XDG_BIN_DIR=$HOME/.local/bin curl -fsSL https://openresearch.ai/install | bash
```

### Agents

OpenResearch zawiera dwóch wbudowanych agentów, między którymi możesz przełączać się klawiszem `Tab`.

- **build** - Domyślny agent z pełnym dostępem do pracy developerskiej
- **plan** - Agent tylko do odczytu do analizy i eksploracji kodu
  - Domyślnie odmawia edycji plików
  - Pyta o zgodę przed uruchomieniem komend bash
  - Idealny do poznawania nieznanych baz kodu lub planowania zmian

Dodatkowo jest subagent **general** do złożonych wyszukiwań i wieloetapowych zadań.
Jest używany wewnętrznie i można go wywołać w wiadomościach przez `@general`.

Dowiedz się więcej o [agents](https://openresearch.ai/docs/agents).

### Dokumentacja

Więcej informacji o konfiguracji OpenResearch znajdziesz w [**dokumentacji**](https://openresearch.ai/docs).

### Współtworzenie

Jeśli chcesz współtworzyć OpenResearch, przeczytaj [contributing docs](./CONTRIBUTING.md) przed wysłaniem pull requesta.

### Budowanie na OpenResearch

Jeśli pracujesz nad projektem związanym z OpenResearch i używasz "openresearch" jako części nazwy (na przykład "openresearch-dashboard" lub "openresearch-mobile"), dodaj proszę notatkę do swojego README, aby wyjaśnić, że projekt nie jest tworzony przez zespół OpenResearch i nie jest z nami w żaden sposób powiązany.

---

**Dołącz do naszej społeczności** [Discord](https://discord.gg/openresearch) | [X.com](https://x.com/openresearch)
