# Worldlens

A from-scratch TypeScript port of [BlueMap](https://github.com/BlueMap-Minecraft/BlueMap), the
Minecraft 3D map renderer and web viewer. It is built to ship as two things from one codebase:

- a **Material Design 3 Electron desktop app** that renders local Minecraft worlds offline and
  connects to remote BlueMap servers — this is what ships today, and there is an installer
  below; and
- a **standalone headless server** (`@worldlens/cli`) that renders and serves the map
  webapp to ordinary browsers — this is Phase E, and the CLI now really renders, serves,
  ships a Docker image, and its `--watch` flag really watches, wired to a real
  `MapUpdateService` per map (issue #40, closed 2026-08-06).

Target world versions: Minecraft **1.12.2 through 26.x**.

**How rendering works.** Local world rendering runs upstream BlueMap's own Java renderer, built
from the vendored source and driven by the app, so a world can be rendered today rather than
after the TypeScript mesher is finished. The TypeScript mesher now produces output identical to
that renderer on the project's fixture worlds, but it is not yet what runs: switching over is a
separate, separately verified change. Everything around the renderer — the viewer, the world
reading layer, the resource-pack pipeline, the server and the whole interface — is TypeScript.
See [Rendering engines](#rendering-engines).

## Status: in development, and honest about it

**[Download the latest Windows installer](https://github.com/Ding-Ding-Projects/material-bluemap/releases/latest)**
· [all releases](https://github.com/Ding-Ding-Projects/material-bluemap/releases)
· [documentation site](https://ding-ding-projects.github.io/material-bluemap/)

> **Rename in progress.** The product, packages, installer and machine identifiers are Worldlens.
> The source repository and Pages URLs above retain their old path until the separate repository
> rename is executed; keeping the currently live addresses here avoids publishing guessed links.
> Existing profiles, project files, markers and environment variables are migrated through
> explicit adapters. See [Migrating to Worldlens](docs/worldlens-migration.md).
>
> `node scripts/finalize-worldlens-repository.mjs --check-ready` proves the live repository,
> Pages, policy and legal references across all 17 inventoried files are ready for one
> deterministic rename-time switch;
> `--apply` performs that switch only after the repository rename actually lands.

The documentation site is a Material 3 tabbed application, not a plain scroll: `Search` owns
independent regex-builder-backed searches for documentation, settings, tabs, groups and bulk
close; `Changelog` reads the committed release history with date filters and export; `Settings`
persists language mode, both funny-level sliders and per-element appearance controls; and
`Ctrl+Shift+F` opens the searchable command palette, and the changelog date filter is an anchored
calendar with typed ISO/slash dates, month jumps, presets and range selection. Pages copy follows
the persisted English, Hong Kong Cantonese or bilingual mode and both funny-level sliders while
search builders refresh their own labels when that choice changes. Its left/right navigation can
be collapsed without hiding the expand control, starts collapsed on a compact first visit, and
persists an explicit visitor choice; the hand-written
[Pages feature-parity inventory](docs/pages-feature-parity.md) names implementation and verification
evidence for every applicable shared requirement and states each browser-only boundary. Scheduled
language and appearance rules can use local time windows, bounded JSON APIs, or Home Assistant
boolean entities. Home Assistant tokens stay only in page-session memory and `off` falls through to
the next matching rule. Every settings, tab, anchored, dialog and menu panel shares
viewport-bounded, persisted resize/drag controls. These surfaces are assembled in `design/packages/site/src/main.ts`
and verified with the site type checker, Vitest suite, Vite production build, and exact compact
headless metrics at 360, 390 and 414 CSS pixels plus a desktop viewport. All 18 proof records use a
guarded schema that checks scenario identity, ARIA state, focus, both toggle label/state changes and
complete overflow classification.

Every push to the default branch that passes lint, build and the full test suite publishes a real
Squirrel.Windows installer with its own uniquely tagged release. Read what it can and cannot do
before installing it.

**What works today.** Rendering a local Minecraft world, and browsing a **remote** BlueMap
server end to end: the viewer, the three.js scene, markers, the token-gated embedded server and
its reverse proxy. The whole world-reading layer (NBT, compression, region containers, chunk
decoders for 1.12.2 through 26.x) and the resource-pack pipeline are ported and unit tested.
A render can also be handed to a remote machine over SSH, to a Docker container, or to GitHub
Actions.

> **The TypeScript mesher passes its parity gate, and it is still not what renders.** On
> 2026-08-04 the byte-comparison oracle rendered a generated 1000x1000 world with both engines
> and reported identical output — 961 of 961 hires tiles equal byte for byte after
> decompression, all 24 lowres tiles equal pixel for pixel. Passing the gate does not switch
> the product over: local rendering still drives upstream's Java engine, and making the switch
> is a separate change with its own verification. Nothing in the app is a mock or a demo shell.

Phases 0, A, B, C and D are complete and verified — Phase C's three exit criteria (textures.json
parity, live blockstate resolution, 1.12.2 legacy-jar loading) all passed on 2026-08-05 (issue
#31, closed). Phase E is part done: its worker pool, render-task layer, watch-driven re-render
(`MapUpdateService`), full HTTP routes with SSE, and a standalone server CLI plus Dockerfile are
all ported, and the CLI's own `--watch` flag is now wired to `MapUpdateService` too (issue #40's
CLI half, closed 2026-08-06); what remains open in Phase E is `-n`/mod-resource scanning,
`resourceExtensions.zip` parity and SQL storages in the CLI. Every render-mask shape, ordered
combination and subtraction now has matching local, standalone-CLI and GitHub Actions semantics. F
is reachable and in use. G is pending; H is part done (SQL storages proven against real
MySQL/MariaDB/PostgreSQL, cross-verified against upstream's own Java engine, and the command
palette shipped early); I is part done (the update checker and packaging shipped early). See
[Phase status](#phase-status).

<details id="features">
<summary><b>Everything the application does</b> - the full feature list, with its article for each</summary>

Every row below is built, unit tested and reachable by clicking. Each links the article that
states its behaviour, configuration, failure modes, security considerations and verification.

| Feature                                    | What it does                                                                                                                                                              | Article                                                                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local rendering**                        | Turns a Minecraft save into a 3D map, driving upstream BlueMap's Java engine                                                                                              | [`docs/legacy-1-12-worlds.md`](docs/legacy-1-12-worlds.md)                                                                                                           |
| **Remote BlueMap servers**                 | Browses a map somebody else's server already rendered, through a token-gated proxy                                                                                        | —                                                                                                                                                                    |
| **Projects**                               | A project is the document you edit: its maps, its storages, its settings. Its nested tabs are pointer- and keyboard-operable, and the wizard is the quick way to make one | [`docs/project-editor.md`](docs/project-editor.md)                                                                                                                   |
| **The map wizard**                         | Makes a map in steps, starting from the worlds already on this computer                                                                                                   | [`docs/finding-worlds.md`](docs/finding-worlds.md)                                                                                                                   |
| **Render-mask drawing**                    | Draws every BlueMap mask shape over measured region bounds and the real overworld spawn, with identical local, CLI and Actions semantics                                  | [`docs/render-mask-drawing.md`](docs/render-mask-drawing.md)                                                                                                         |
| **The options editor**                     | Eight tabs over every BlueMap configuration file, with a search across all of them                                                                                        | —                                                                                                                                                                    |
| **Local version history**                  | An append-only git history per config folder and per project, kept beside the app's data — never inside your folder                                                       | [`docs/config-history.md`](docs/config-history.md)                                                                                                                   |
| **The render console**                     | Annotated engine output rather than a raw log                                                                                                                             | [`docs/render-console.md`](docs/render-console.md)                                                                                                                   |
| **Automatic repair**                       | Diagnoses a failed render and proposes an edit, behind guardrails, showing its evidence                                                                                   | [`docs/automatic-repair.md`](docs/automatic-repair.md)                                                                                                               |
| **Docker or this machine**                 | One render plan that resolves to a container or to the local runtime                                                                                                      | [`docs/docker-and-local.md`](docs/docker-and-local.md)                                                                                                               |
| **Remote rendering over SSH**              | Runs the render on another machine, with host-key handling and a preflight                                                                                                | [`docs/remote-render.md`](docs/remote-render.md)                                                                                                                     |
| **Rendering in GitHub Actions**            | Hands the whole render to GitHub's runners, sharded and resumable                                                                                                         | [`docs/render-in-actions.md`](docs/render-in-actions.md) · [`docs/large-worlds.md`](docs/large-worlds.md) · [`docs/resumable-renders.md`](docs/resumable-renders.md) |
| **Disposable cloud CI**                    | Builds, tests, packages, publishes and deploys on explicit standard GitHub-hosted Linux and Windows runners                                                               | [`docs/cloud-runners.md`](docs/cloud-runners.md)                                                                                                                     |
| **Publish a rendered map to GitHub Pages** | Preflights the real render, publishes guarded static files, verifies the public address, and offers a two-key stop-hosting gate                                           | [`docs/pages-hosting.md`](docs/pages-hosting.md) · [`docs/render-in-actions.md`](docs/render-in-actions.md)                                                          |
| **Private worlds**                         | Sealed before they leave the machine, rendered on public runners, published only privately                                                                                | [`docs/private-world-rendering.md`](docs/private-world-rendering.md)                                                                                                 |
| **World sources**                          | Fetches a world from any GitHub release, including one split into parts in another repository                                                                             | [`docs/world-sources.md`](docs/world-sources.md)                                                                                                                     |
| **Backups**                                | Packs a world or a rendered map, splits it and publishes it as release assets, with digests                                                                               | [`docs/backup.md`](docs/backup.md)                                                                                                                                   |
| **Worldlens migration**                    | Moves profiles and preferences without deleting the old copy; reads legacy project/marker/env names and writes current identifiers                                        | [`docs/worldlens-migration.md`](docs/worldlens-migration.md)                                                                                                         |
| **Automatic updates**                      | Reads the unsigned Squirrel feed, checks its package hashes, and offers a restart in a banner that never blocks                                                           | [`docs/automatic-updates.md`](docs/automatic-updates.md)                                                                                                             |
| **EULA and consent**                       | The licence at first run, a tabbed viewer afterwards, and one remembered answer about Mojang downloads                                                                    | [`docs/eula-and-consent.md`](docs/eula-and-consent.md)                                                                                                               |
| **Changelog viewer**                       | Every released version, with date filters, search and export                                                                                                              | [`docs/changelog-viewer.md`](docs/changelog-viewer.md)                                                                                                               |
| **Command palette**                        | `Ctrl+Shift+F` over every command, page and setting                                                                                                                       | [`docs/command-palette.md`](docs/command-palette.md)                                                                                                                 |
| **Notification centre**                    | Nothing that only informs is a dialog; dismissed messages stay reviewable                                                                                                 | [`docs/notification-centre.md`](docs/notification-centre.md)                                                                                                         |
| **The regex builder**                      | On every search bar, anchored beside the field it belongs to                                                                                                              | [`docs/regex-builder.md`](docs/regex-builder.md)                                                                                                                     |
| **Tabbed navigation**                      | Browser-style tabs docked left, right, top or bottom, with overflow, reordering, pinning, grouping and four discovery searches                                            | [`docs/tabbed-navigation.md`](docs/tabbed-navigation.md)                                                                                                             |
| **Appearance editors**                     | Per-element **Edit appearance…**, with a continuous colour picker and Word-depth typography                                                                               | [`docs/appearance-editors.md`](docs/appearance-editors.md)                                                                                                           |
| **Language and tone**                      | English, Hong Kong Cantonese and bilingual, each with its own funny-level slider                                                                                          | [`docs/language-and-tone.md`](docs/language-and-tone.md)                                                                                                             |
| **Scheduled language and appearance**      | Applies versioned rules by date, time, weekday and timezone, optionally gated by bounded JSON API or Home Assistant boolean sources                                       | [`docs/scheduled-settings-and-external-sources.md`](docs/scheduled-settings-and-external-sources.md)                                                                 |
| **Resizable and draggable panels**         | Keeps every panel class viewport-bounded, persistent, resettable and keyboard movable/resizable                                                                           | [`docs/panel-geometry.md`](docs/panel-geometry.md)                                                                                                                   |
| **Action-specific artwork**                | Gives cloud setup, local speed, restart, repository publication and destructive config review their own bundled realistic image and semantic alt text                     | [`docs/action-artwork.md`](docs/action-artwork.md)                                                                                                                   |
| **Super confirmation**                     | Two keys and a full-travel slider before anything destructive, with an emergency exit throughout                                                                          | [`docs/super-confirmation.md`](docs/super-confirmation.md)                                                                                                           |

[`docs/README.md`](docs/README.md) is the index, and every article is also published on the
[documentation site](https://ding-ding-projects.github.io/material-bluemap/).

</details>

## Screenshots

Photographed from the real running application by the project's Playwright harness. None is a
mockup. The harness covers the shell, the wizard, the options editor, settings, the menu, the
notification surfaces, the destructive-action gate and the Pages publishing screen. The harness
also fails closed when the UI, main process or preload bundle is stale, so a passing capture is
not silently photographing an older build. The world under the interface
was generated by `packages/worldgen` and rendered by upstream BlueMap's Java engine, then served
to the application over loopback; the harness fails its own run if the application reaches the
public internet while capturing.

<img src="docs/screenshots/shell-1280x800.png" alt="The Worldlens desktop application showing a Minecraft world in three dimensions, with its own Material title bar across the top, the viewer control bar at the top right, and the settings, servers and configuration buttons at the bottom left" width="900">

Open a section to see the rest. Each capture's own caption sits beside it in
`docs/screenshots/captions.md`, and `docs/screenshots/manifest.json` records what took it, by
what method, and every surface the run could not reach.

<details>
<summary><b>Starting a render: the guide, step by step</b></summary>

Captured from the installed Windows build on an off-screen desktop, driving the real
packaged app. The Mojang download consent was **declined** in this run, which is why the
review step says the render would stop before it started: that is the app being honest
about a decision nobody made, not a failure.

**Where rendered maps are stored**, asked once during setup and changeable later in
Settings. Nothing is written to disk until the first render starts.

![The setup step that chooses where rendered maps are stored](docs/screenshots/guide-0-where-maps-are-stored.png)

**Choosing a world.** The folder is checked as soon as it is given, and the dimensions
offered come from the world itself rather than from a list of vanilla defaults - here one
dimension with one region file.

![The guide's first step with a world folder accepted and its dimensions read](docs/screenshots/guide-1-world-validated.png)

**Where the map is written.** The folder every tile, the viewer copy and the engine's
working files go under, plus the map's own storage setting.

![The guide's step four, choosing the folder the rendered map is written to](docs/screenshots/guide-2-where-it-goes.png)

**What is about to happen.** The world, the dimension, the map id, the folder it is
written to and the engine that will run, stated before anything starts.

![The guide's review step listing the world, dimension, map, destination folder and engine](docs/screenshots/guide-3-review-and-start.png)

**Maps and servers.** A finished render becomes an entry in this same list, beside any
remote BlueMap server, so switching between a map rendered here and one served elsewhere
is the same action.

![The maps and servers list, holding a remote BlueMap server entry](docs/screenshots/guide-4-map-server-list.png)

</details>

<details>
<summary><b>Window sizes, display scales and colour schemes</b> - where clipping and sizing defects appear first</summary>

|                                                                                                                |                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="docs/screenshots/shell-1920x1080.png" alt="The application at 1920 by 1080 pixels" width="420">      | <img src="docs/screenshots/shell-800x600-narrow.png" alt="The application at 800 by 600 pixels, the narrowest supported window" width="420"> |
| 1920x1080                                                                                                      | 800x600, the narrowest supported width                                                                                                       |
| <img src="docs/screenshots/theme-light.png" alt="The application in the light colour scheme" width="420">      | <img src="docs/screenshots/theme-dark.png" alt="The application in the dark colour scheme" width="420">                                      |
| Light scheme                                                                                                   | Dark scheme                                                                                                                                  |
| <img src="docs/screenshots/shell-scale-1x.png" alt="The application at 100 percent display scale" width="420"> | <img src="docs/screenshots/shell-scale-2x.png" alt="The application at 200 percent display scale" width="420">                               |
| 100% display scale                                                                                             | 200% display scale                                                                                                                           |

Also captured: 1024x768, and 125% and 150% display scale.

</details>

<details>
<summary><b>The window's own chrome</b> - the Material title bar, its window buttons and the control bar</summary>

The window is frameless, so the operating system draws no caption bar and the application draws
all of it, including the three window buttons.

<img src="docs/screenshots/chrome-titlebar.png" alt="A historical pre-rename capture of the application's Material title bar, retained only as layout evidence; the shipped title is now Worldlens" width="900">

|                                                                                                                                                             |                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="docs/screenshots/chrome-titlebar-window-buttons.png" alt="The minimize, maximize and close buttons the application draws for itself" width="200"> | <img src="docs/screenshots/chrome-shell-buttons.png" alt="The three round shell buttons: settings, maps and servers, and server configuration" width="60"> |
| The window buttons                                                                                                                                          | The shell buttons                                                                                                                                          |

<img src="docs/screenshots/chrome-control-bar.png" alt="The viewer control bar: the menu button on the left, and on the right the day and night switch, the perspective, flat and free-flight view modes, reset camera, live x and z position inputs, and a compass" width="900">

</details>

<details>
<summary><b>First run</b> - the three setup steps, the language modes and the two funny levels</summary>

Captured on a throwaway profile, so it is genuinely a first run. The harness answers it the way
a cautious person would: it declines the Mojang download consent, which is a real answer, is
remembered, and downloads nothing.

|                                                                                                                                                                                                                |                                                                                                                                                                                                                           |                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="docs/screenshots/firstrun-1-welcome.png" alt="The first-run welcome step, offering English, Cantonese and bilingual language modes and a separate funny level slider for each language" width="280"> | <img src="docs/screenshots/firstrun-2-consent.png" alt="The first-run Minecraft files step, asking once whether the application may download Minecraft's own client files and saying what each answer means" width="280"> | <img src="docs/screenshots/firstrun-3-storage.png" alt="The first-run map storage step, asking where rendered maps should be written" width="280"> |
| Welcome, with the language modes                                                                                                                                                                               | Minecraft files                                                                                                                                                                                                           | Map storage                                                                                                                                        |

<img src="docs/screenshots/firstrun-1-welcome-window.png" alt="The first-run setup dialog over the whole application window on a fresh profile" width="900">

</details>

<details>
<summary><b>The menu</b> - its root page, the maps, markers, settings and info pages, and the regex builder</summary>

|                                                                                                                                                                                                   |                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="docs/screenshots/menu-root.png" alt="The main menu side sheet, listing maps, markers, settings and info, then go fullscreen, reset camera, take screenshot and update map" width="420"> | <img src="docs/screenshots/menu-maps.png" alt="The maps page of the menu, listing the maps the active profile serves with a search bar above them" width="420"> |
| The root page                                                                                                                                                                                     | Maps                                                                                                                                                            |
| <img src="docs/screenshots/menu-settings.png" alt="The viewer settings page of the menu, with view, resolution, render distance and free-flight controls" width="420">                            | <img src="docs/screenshots/menu-info.png" alt="The info page of the menu, with the application version at the foot of it" width="420">                          |
| Viewer settings                                                                                                                                                                                   | Info                                                                                                                                                            |
| <img src="docs/screenshots/menu-markers.png" alt="The marker page of the menu, showing the marker sets of the map that is loaded" width="420">                                                    | <img src="docs/screenshots/menu-search.png" alt="The settings menu filtered by its own search bar, showing how many settings match" width="420">                |
| Markers                                                                                                                                                                                           | The menu's search bar                                                                                                                                           |

<img src="docs/screenshots/menu-regex-builder.png" alt="The regex builder anchored to the menu's search bar, with a pattern box, the supported flags, and buttons for character classes, anchors, groups, alternation, quantifiers and literals above the live matches" width="420">

</details>

<details>
<summary><b>Settings</b> - the drawer, every section in it, its search and its regex builder</summary>

<img src="docs/screenshots/settings-drawer.png" alt="The application settings drawer open over the map, with a search field at the top and the Mojang download consent section below it" width="900">

|                                                                                                                                                                                                              |                                                                                                                                                |                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="docs/screenshots/settings-section-mojang-download-consent.png" alt="The Mojang download consent settings section, showing the answer given during setup and the text being agreed to" width="280"> | <img src="docs/screenshots/settings-section-java-runtime.png" alt="The Java runtime settings section" width="280">                             | <img src="docs/screenshots/settings-section-map-storage-directory.png" alt="The section that sets where rendered maps go" width="280"> |
| Mojang download consent                                                                                                                                                                                      | Java runtime                                                                                                                                   | Where rendered maps go                                                                                                                 |
| <img src="docs/screenshots/settings-section-world-folder.png" alt="The world folder settings section" width="280">                                                                                           | <img src="docs/screenshots/settings-section-github-account.png" alt="The GitHub account settings section in its signed-out state" width="280"> | <img src="docs/screenshots/settings-search.png" alt="The settings drawer filtered by its search field" width="280">                    |
| World folder                                                                                                                                                                                                 | GitHub account, signed out                                                                                                                     | The settings search                                                                                                                    |

<img src="docs/screenshots/settings-regex-builder.png" alt="The regex builder anchored to the settings search, showing the pattern, the supported flags, the guided token palette and the live matches against the text on screen" width="420">

</details>

<details>
<summary><b>The options editor</b> - all eight tabs of BlueMap's own configuration</summary>

<img src="docs/screenshots/config-screen.png" alt="The options editor with eight tabs, a search across all 154 settings on them, and the core settings below" width="900">

|                                                                                                                                                                        |                                                                                                                                                      |                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="docs/screenshots/config-tab-core.png" alt="The Core tab of the options editor" width="280">                                                                  | <img src="docs/screenshots/config-tab-maps.png" alt="The Maps tab of the options editor" width="280">                                                | <img src="docs/screenshots/config-tab-storages.png" alt="The Storages tab of the options editor" width="280">                         |
| Core                                                                                                                                                                   | Maps                                                                                                                                                 | Storages                                                                                                                              |
| <img src="docs/screenshots/config-tab-web-app.png" alt="The Web app tab of the options editor" width="280">                                                            | <img src="docs/screenshots/config-tab-web-server.png" alt="The Web server tab of the options editor" width="280">                                    | <img src="docs/screenshots/config-tab-server-plugin.png" alt="The Server plugin tab of the options editor" width="280">               |
| Web app                                                                                                                                                                | Web server                                                                                                                                           | Server plugin                                                                                                                         |
| <img src="docs/screenshots/config-tab-run.png" alt="The Run tab of the options editor, showing the command-line flags a render is started with" width="280">           | <img src="docs/screenshots/config-search.png" alt="The options editor's search, which reaches every setting on all of the tabs at once" width="280"> | <img src="docs/screenshots/config-regex-builder.png" alt="The regex builder anchored to the options editor's search bar" width="280"> |
| Run                                                                                                                                                                    | The search across every tab                                                                                                                          | Its regex builder                                                                                                                     |
| <img src="docs/screenshots/config-tab-history.png" alt="The History tab of the options editor, which lists the saved revisions of the open config folder" width="280"> |                                                                                                                                                      |                                                                                                                                       |
| History                                                                                                                                                                |                                                                                                                                                      |                                                                                                                                       |

Deleting a map's configuration is guarded the same way any destructive action is, and the gate
names what would actually go before it asks.

<img src="docs/screenshots/config-delete-gate.png" alt="The confirmation that guards deleting a map's configuration, naming the file that would go, the map id whose tiles stop being served, and that already-rendered tiles are not deleted, above two key switches, a slider and an emergency exit" width="420">

These captures show the editor holding BlueMap's own generated defaults, which is what it opens
on when this machine has no config folder to carry on from - it says so in a notice across the
top. Every setting, tab and control in them is real, live and savable; what is absent is a folder
read off the machine, not the ability to write one.

</details>

<details>
<summary><b>Making a map</b> - the wizard, step by step, after reading a real world off disk</summary>

|                                                                                                                                                                                 |                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="docs/screenshots/wizard-1-world.png" alt="The make-a-map wizard on its first step, asking for a world folder, with its five steps listed across the top" width="420"> | <img src="docs/screenshots/wizard-1-world-read.png" alt="The wizard's first step after the world folder has been read, naming the dimensions it found and how many region files each holds" width="420"> |
| Choose a world                                                                                                                                                                  | The same step, after the folder is read                                                                                                                                                                  |
| <img src="docs/screenshots/wizard-2-name-and-dimension.png" alt="The wizard's name and dimension step" width="420">                                                             | <img src="docs/screenshots/wizard-3-options.png" alt="The wizard's options step" width="420">                                                                                                            |
| Name and dimension                                                                                                                                                              | Options                                                                                                                                                                                                  |
| <img src="docs/screenshots/wizard-4-where-it-goes.png" alt="The wizard's step for choosing where the rendered map is written" width="420">                                      | <img src="docs/screenshots/wizard-5-review.png" alt="The wizard's review step, showing every decision the earlier steps collected before a render is started" width="420">                               |
| Where it goes                                                                                                                                                                   | Review                                                                                                                                                                                                   |

<img src="docs/screenshots/wizard-release-downloads.png" alt="The release downloads panel, which offers to fetch a world from a GitHub release for somebody with no Minecraft save on this machine" width="600">

</details>

<details>
<summary><b>Dialogs, notifications and the destructive-action gate</b></summary>

Nothing that only informs is a dialog. Messages appear in a corner, never block, and stay
readable afterwards in a history.

|                                                                                                                                                                                                                                         |                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="docs/screenshots/profiles-manager.png" alt="The maps and servers manager, listing the maps rendered on this computer and the remote BlueMap servers the application knows about, with fields for adding another" width="420"> | <img src="docs/screenshots/notifications-toast.png" alt="The notification corner reporting what the options editor loaded when it opened, without blocking anything" width="420"> |
| Maps and servers                                                                                                                                                                                                                        | A message in the corner                                                                                                                                                           |
| <img src="docs/screenshots/notifications-corner.png" alt="The small bell button in the bottom right corner that opens the notification history, showing a count of three" width="120">                                                  | <img src="docs/screenshots/notifications-history.png" alt="The notification history panel, listing three messages with their level and the time each was raised" width="300">     |
| The button that opens the history                                                                                                                                                                                                       | The history itself                                                                                                                                                                |

A destructive action takes two keys and a full-travel slider, and an emergency exit is available
throughout.

|                                                                                                                                                                  |                                                                                                                                                             |                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="docs/screenshots/super-confirm-untouched.png" alt="The reset-settings gate before either key is turned, with the slider refusing to move" width="280"> | <img src="docs/screenshots/super-confirm-one-key.png" alt="The reset-settings gate with one key turned, which is not enough to arm the slider" width="280"> | <img src="docs/screenshots/super-confirm-armed.png" alt="The reset-settings gate with both keys turned and the slider armed" width="280"> |
| Untouched                                                                                                                                                        | One key                                                                                                                                                     | Both keys, armed                                                                                                                          |

</details>

<details>
<summary><b>What is not captured, and why</b></summary>

The harness records the surfaces it could not reach rather than substituting something that
looks similar. As of the committed set:

- **A signed-in GitHub account.** Signing in needs a real account and a real device-flow round
  trip to github.com, and the capture guard refuses every request that is not loopback. The
  signed-out state of the account section is real, and it is the one shown above.
- **A release's asset list, and a download in progress.** Both need real traffic to github.com.
  The panel is shown in the state it is in before anything has been asked for.
- **The render progress panel.** It only exists while a render is actually running, which needs
  a Java runtime, an accepted Mojang download consent and minutes of work. The capture run
  declines that consent.
- **Interrupted renders.** That surface only appears when a previous render was interrupted and
  left a session behind, and the throwaway profile the harness uses has never started one.
- **The marker search and sort controls.** The map the run captured carries no markers, so the
  marker menu has no marker section and those controls are not on screen to photograph.
- **The options editor's save plan.** That dialog lists the files a save would write, and its
  Save control is disabled while the editor has no folder attached, so there is no door to open
  it through in the state the captures were taken in.

The exact list for the committed set, with reasons, is the `skipped` array in
`docs/screenshots/manifest.json`.

Separately, and for a different reason, these surfaces shipped on 2026-08-04 with **no capture
step written yet** — the harness does not attempt them, so it would not notice if one stopped
opening: the **History** tab of the options editor, the **projects** screen, the **render
console**, the **EULA viewer** and the **rendering-in-Actions** screen. Adding them is tracked
in [`design/ROADMAP.md`](design/ROADMAP.md).

</details>

## Build it

Requires **Node 22+** and **pnpm 10**. The upstream Java reference is a git submodule; the port
reads it directly.

```sh
git clone https://github.com/Ding-Ding-Projects/material-bluemap.git
cd material-bluemap
git submodule update --init --recursive

node scripts/bootstrap.mjs
```

That one command installs and **verifies** everything: workspace dependencies, the
Electron binary, a JDK matching upstream's toolchain, Gradle, the BlueMap jars built from the
vendored source, and the Playwright browsers the screenshot harness drives. It asks nothing and
needs no administrator rights, and every install is repository-local or user-scoped so no
machine-wide toolchain is touched.

It verifies rather than assumes, which is not pedantry: Electron once shipped a `dist/` folder
containing only `locales/`, with no binary at all, and its own installer kept exiting 0 because
the folder existed. A presence check passes that; running the binary does not. Where a
dependency's own installer is the thing that is broken, bootstrap repairs it.

```sh
node scripts/bootstrap.mjs --check       # verify only, install nothing
node scripts/bootstrap.mjs --skip-jars   # skip the slow first Gradle build

cd design
pnpm build
pnpm test
pnpm lint
```

Everything except `plan.md` and repository metadata lives in `design/`, a pnpm workspace of
thirteen packages.

Generate a test world without needing Minecraft, a server jar or a network connection:

```sh
node design/packages/worldgen/dist/cli.js --seed 1 --size 1000 --out ./test-world
```

That writes anvil format byte by byte: 3969 chunks across four region files, about 16 MB on disk
and 8 MB zipped, in a few seconds. The same seed always produces byte-identical output.

At release `v0.1.0-build.196`, measured at commit `0008dd4d`, the project is **288,533 lines**
hand written across 1,258 files, or 309,624 lines across 1,738 files counting bundled data and
binary assets. Of those hand-written lines, 284,498 are agent-written and 4,035 are
human-written. Every release publishes the full breakdown — by category, by package and by
authorship — generated at the tagged commit by `scripts/count-lines.mjs`. Run that script
rather than counting by hand; it is the same command CI runs.

## Rendering on GitHub Actions, for computers that cannot render locally

Rendering a big Minecraft world is hours of CPU and gigabytes of disk. On a thin laptop
that is an afternoon of the fan at full speed and, on some machines, a render that never
finishes at all. **The point of this feature is that your computer does not do the work:**
a GitHub standard runner has 4 vCPU, around 14 GB of free disk and nothing else to do, and
the `Render world` workflow will use as many of them in parallel as the world needs. Your
machine uploads the world and then waits.

The desktop app drives the whole loop as one action — upload the world as release assets,
start the workflow, follow the run and report its real per-job states, download the
finished map, and register it so it opens exactly like a local render. It reuses the backup
subsystem for the upload, the download subsystem for the transfer, and the render subsystem
for the mount; there is no second uploader, downloader or credential anywhere in it. It is
resumable, so closing the app during a four-hour render and reopening it afterwards picks
the run back up, and it will not upload a world it can see has not changed. It can drive
GitHub through the app's own sign-in or through an authenticated `gh` CLI, and it says
which credential is in play.

**Proven, on a real run rather than in principle.** A 96-block world committed to a
throwaway probe repository rendered end to end on GitHub's runners on 2026-08-04:
[run 30953146107](https://github.com/DingDingChae/bluemap-tiny-render-probe/actions/runs/30953146107)
— plan, jar build, one shard and the merge all green, producing 21 hires `.prbm.gz` tiles,
`settings.json` and `textures.json.gz`, in a 1.9 MB `rendered-map` artifact.

Getting there found two real defects, both now fixed and both worth knowing about:

- The jar is compiled with **Java 25** and the render jobs set up **Java 21**, so every
  shard died with `UnsupportedClassVersionError` before drawing a tile.
- That failure was then **swallowed**. `continue-on-error` is right for a shard that ran
  out of time with hours of real tiles to hand over, but it also let a render that produced
  _nothing_ report success, upload no artifact, and break three jobs later with
  `Artifact not found for name: webapp` — pointing at the merge and saying nothing about
  the engine refusing to start. A render that drew nothing now fails next to its reason.

A third trap is worth recording for anyone using `world-source: repository`: this
repository's `.gitignore` contains `*.mca`, so a world committed into a clone of it
silently loses every region file, and the render then correctly reports a world with
nothing in it.

**The trade-offs, because advertising without them wastes an afternoon:**

- uploading a multi-gigabyte world takes real time and bandwidth — that is the slow part now;
- GitHub's free Actions minutes are finite for **private** repositories, while **public**
  repositories get unlimited standard-runner minutes;
- a very large world can still exceed a job's six-hour budget, and a world whose archive
  would pass a release asset's 2 GiB limit is refused before anything is packed;
- uploading a world sends it to GitHub, and a **public** repository makes it downloadable
  by anybody. The app says both plainly and refuses without an explicit acknowledgement.

Mojang's EULA is a real legal acceptance the workflow makes on the repository owner's
behalf. The app never accepts it for you: it checks the consent given at first run and
refuses when it is missing.

[`docs/render-in-actions.md`](docs/render-in-actions.md) has the whole design, including
how the shard merge is kept correct.

### Hosting the finished map on GitHub Pages

A rendered map is a static web app, so it can be hosted on GitHub Pages and shared as a
link. The CI render screen offers it as a tick box (off by default — rendering a world is
private until you say otherwise, and Pages is public whether or not the repository is), and
the map is published **underneath** the documentation site at `/map/` so publishing a map
never takes the docs down.

![A Worldlens render served from GitHub Pages](docs/screenshots/map-hosted-on-github-pages.png)

_The tiny probe world, rendered by GitHub's runners and served from
`dingdingchae.github.io`, loaded in a browser with no BlueMap server anywhere._

**One detail decides whether this works at all,** and it is invisible until every tile
returns 404. The engine stores hires tiles gzipped — the file on disk is `0.prbm.gz` — and
the viewer asks for `0.prbm` unless its `settings.json` says `clientDecompression: true`.
BlueMap's own web server bridges that gap, and so does this app's; **Pages does not.** It
serves the files that exist, under the names they have, and 404s the rest.

So the map is prepared before it is published, and the preparation is _verified against the
files really on disk_ rather than assumed — flipping that flag on a map rendered without
compression would point the viewer at files nobody wrote, which is exactly as broken and far
harder to diagnose. The step also writes `.nojekyll`, measures the site against GitHub's
limits, and fails the run rather than publishing a site nobody can use.

**Proven on a real published map**, not in principle. The tile URL the viewer requests
returns `200` with gzip magic bytes and no `Content-Encoding`, which is precisely what the
browser's `DecompressionStream` needs:

```
200  maps/tiny/tiles/0/x0/z0.prbm.gz     application/gzip   first bytes 1f 8b
404  maps/tiny/tiles/0/x0/z0.prbm        ← the URL the viewer asks for without the flag
```

What Pages will not host: a map delivered in **parts** (more than one merge group — no single
runner ever holds it whole, which is the point of the split), a site over GitHub's 1 GB soft
limit, or any single file over its 100 MB hard limit. Each is reported before anything is
uploaded rather than discovered halfway through.

## Documentation

**[ding-ding-projects.github.io/material-bluemap](https://ding-ding-projects.github.io/material-bluemap/)**
carries an article for every feature, each stating its behaviour, configuration, failure modes,
security considerations and verification, with a visible badge saying whether the subject is
shipped, ported but unverified, or only specified.

The source of truth lives in the repository:

| Document                                                                                                                                | What it covers                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [`plan.md`](plan.md)                                                                                                                    | The approved full port plan. Read this first.                                                                       |
| [`docs/README.md`](docs/README.md)                                                                                                      | The index of the per-feature articles, one file per feature                                                         |
| [`design/README.md`](design/README.md)                                                                                                  | The workspace: packages, development, port notes                                                                    |
| [`design/ROADMAP.md`](design/ROADMAP.md)                                                                                                | Phase table and status, and what is proven versus merely built                                                      |
| [`design/HANDOFF.md`](design/HANDOFF.md)                                                                                                | Current state. Its opening plain-language summary is written to be readable with no prior knowledge of the codebase |
| [`design/docs/`](design/docs/)                                                                                                          | Porting conventions, design decisions, deviations log                                                               |
| [`design/docs/contracts/`](design/docs/contracts/README.md)                                                                             | The five product contracts and their status                                                                         |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) · [`SECURITY.md`](SECURITY.md) · [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) · [`LICENSE`](LICENSE) | Repository policy, rendered as their own tabs above                                                                 |
| [`AGENTS.md`](AGENTS.md)                                                                                                                | Instructions for automated agents working in this repository                                                        |

## Contents

- [Everything the application does](#features)
- [Rendering engines](#rendering-engines)
- [Phase status](#phase-status)
- [Packages](#packages)
- [Repository layout](#repository-layout)
- [Minecraft version support](#minecraft-version-support)
- [Differences from upstream BlueMap](#differences-from-upstream-bluemap)
- [Product contracts](#product-contracts)
- [Porting rules in one screen](#porting-rules-in-one-screen)
- [Attribution](#attribution)

---

<details id="rendering-engines">
<summary><b>Rendering engines</b> (why there are two, and which one runs)</summary>

Turning a Minecraft save into map tiles is the single largest and highest-risk part of this port.
The project ships two paths to it.

|             | Java engine                                   | TypeScript mesher                                                                                                                                                                     |
| ----------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status      | **primary today**                             | passes its parity gate; not yet switched on                                                                                                                                           |
| Source      | upstream BlueMap, built from `vendor/BlueMap` | `design/packages/engine`                                                                                                                                                              |
| Needs a JDK | yes                                           | no                                                                                                                                                                                    |
| Correctness | upstream's own output, by definition          | **measured identical** to the Java engine on a 1000x1000 world and a 200x200 fixture: 961 of 961 hires tiles byte for byte after decompression, 24 of 24 lowres tiles pixel for pixel |

**Why the Java engine is primary.** It renders correctly today. Writing a mesher that produces
byte-identical geometry is months of work, and until it is finished a pure TypeScript app cannot
render anything at all. Driving upstream's renderer means a user can render a world now, and it
gives the TypeScript mesher an exact oracle to be checked against rather than a plausible-looking
approximation.

**Why the TypeScript mesher still exists.** The Java path needs a JDK and carries a JVM's memory
profile. The mesher's gate — decompressed PRBM bytes identical to the Java engine's and lowres
PNGs identical pixel for pixel across every fixture world — **closed on 2026-08-04**. Passing it
is not the same as switching over: making the mesher the default is its own change, with its own
verification, and it has not been made. Until it is, the JDK requirement stands.

The app tells you which engine rendered a map. It does not silently switch.

</details>

<details id="phase-status">
<summary><b>Phase status</b> (0/A/B/C/D done, E/H/I part done, G pending)</summary>

Mirrored from [`design/ROADMAP.md`](design/ROADMAP.md), which is the source of truth and
carries the reasoning behind every "part done" below.

| Phase     | Scope                                                                                                                                                               | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0         | `plan.md`, submodules (plus the `v0.10.3-mc1.12` legacy tag), monorepo scaffold, CI                                                                                 | **Done**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| A         | Viewer port (65 files to TS), MD3 shell, Electron shell, embedded server plus remote proxy, live-demo verification                                                  | **Done**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| B         | shared utils, NBT, compression, MCA parsing 1.12.2 to 26.x including legacy `Chunk_1_12`, e2e synthetic-world proofs                                                | **Done**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| C         | Resource-pack pipeline (VFS, blockstates/models/atlases, textures, legacy compat, Mojang downloader, `textures.json`)                                               | **Done.** Exit criteria run 2026-08-05 (issue #31, closed): textures.json parity, live blockstate resolution and 1.12.2 legacy-jar loading all pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| J         | Java render path (toolchain discovery and provisioning, jar resolution, config writer, CLI runner, progress parser, provenance record, local map serving)           | Built; driven by hand on one Windows machine                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D         | Hires mesher, byte-exact PRBM writer, lowres LOD cascade, renderstate, file storage, masks                                                                          | **Done, and the gate is closed** — both engines produced identical output on a 1000x1000 world                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| E         | RenderManager worker pool, watch re-render, full HTTP routes plus SSE, config schema, standalone server CLI and Dockerfile                                          | **Part done.** The worker pool, render-task hierarchy and config schema (all issued earlier), watch-driven re-render (`MapUpdateService`, issue #40), full HTTP routes with SSE (issue #41), and the standalone CLI plus Dockerfile (issue #42) are ported, and `RenderDriver` now drives a real `RenderManager` end to end. The CLI's own `--watch` flag is wired to `MapUpdateService` too, closed 2026-08-06 (issue #40's CLI half); every render-mask shape and ordered/subtracted combination is now ported with local/CLI/Actions parity; still open in this phase: `-n`/mod-resource scanning, `resourceExtensions.zip` parity and SQL storages in the CLI |
| F         | Full options GUI (all settings, map wizard, storage editors, config import)                                                                                         | Reachable and in use; eight tabs over BlueMap's own configuration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| G         | Docker hosting GUI (dockerode instance manager)                                                                                                                     | Pending. Rendering _in_ a container landed separately — see [`docs/docker-and-local.md`](docs/docker-and-local.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| H         | SQL storages, command palette, marker editor, JS addon system, static export, three.js upgrade                                                                      | **Part done.** SQL storages proven against real MySQL/MariaDB/PostgreSQL and, over a shared MariaDB database, cross-compatible with upstream's own Java engine in both directions (issue #32, closed); the command palette shipped early. Marker editor, JS addon system, static export and the three.js upgrade remain pending                                                                                                                                                                                                                                                                                                                                   |
| I         | Local live players (playerdata/RCON), measurement/waypoints/gallery/scheduler/dashboard/update checker, packaging                                                   | **Part done, landed early, out of order.** The update checker is built and wired into the main process, and packaging shipped early too. Local live players and measurement/waypoints/gallery/scheduler/dashboard remain pending                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Contracts | The five product contracts in [`design/docs/contracts/`](design/docs/contracts/README.md)                                                                           | **Shipped.** Issues #6 to #13 are closed, each with its evidence on the issue                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Delivery  | Sign-in, private worlds, split archives, resumable renders, Actions rendering, remote and container rendering, world sources, updates, projects, packaging pipeline | **Landed.** Not a plan phase; see `design/ROADMAP.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Deferred verification flag: the lz4-java block-framing constants get oracle validation against
upstream's own CLI, which now happens on every local render rather than only when someone runs
the harness. That is recorded in
[`design/docs/deviations.md`](design/docs/deviations.md) and tracked as
[#3](https://github.com/Ding-Ding-Projects/material-bluemap/issues/3).

</details>

<details id="packages">
<summary><b>Packages</b> (what the thirteen workspace packages are for)</summary>

| Package                          | Purpose                                                                                                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `design/packages/shared`         | Wire formats (settings/textures/markers/players), config schema, math, path codecs                                                                                               |
| `design/packages/nbt`            | Binary NBT reader/writer with schema mapping (a BlueNBT-subset port)                                                                                                             |
| `design/packages/engine`         | Render engine: MCA world parsing, resource packs, hires/lowres tile rendering, storage, render manager and its task hierarchy                                                    |
| `design/packages/server`         | Service facade, full HTTP routes with server-sent events, watch-driven re-render (`MapUpdateService`) and the remote proxy                                                       |
| `design/packages/cli`            | Standalone server CLI and Docker image: real rendering, serving, container packaging and a real `--watch`, wired to `MapUpdateService` (issue #40's CLI half, closed 2026-08-06) |
| `design/packages/viewer`         | three.js viewer library, a port of the BlueMap webapp core                                                                                                                       |
| `design/packages/ui`             | Material Design 3 Vue UI                                                                                                                                                         |
| `design/packages/app`            | Electron desktop app: main process, render orchestration, projects, backups, remote and container rendering, updates                                                             |
| `design/packages/config`         | The schema and control policy behind the eight-tab options editor                                                                                                                |
| `design/packages/parts`          | Splitting and rejoining large files into release-asset-sized parts, with digests                                                                                                 |
| `design/packages/render-actions` | The sharding, merging and resumption logic for rendering on GitHub Actions                                                                                                       |
| `design/packages/worldgen`       | Generates a Minecraft world from a seed, in the modern format or the 1.12.2 one, with no Minecraft and no network                                                                |
| `design/packages/site`           | The Material 3 documentation site published to GitHub Pages                                                                                                                      |

</details>

<details id="repository-layout">
<summary><b>Repository layout</b> (where things live and why)</summary>

```
plan.md                  the approved full port plan
docs/                    an article for every feature, indexed by docs/README.md
design/                  the pnpm workspace (all code)
  packages/              the thirteen packages above
  docs/                  porting conventions, decisions, deviations, contracts
  tools/                 the worker-isolated reference regex builder
  LICENSE, NOTICE        licence and upstream attribution for the ported code
vendor/BlueMap           upstream Java/JS reference, git submodule @ e664c1a
.github/workflows/ci.yml lint, build and test on push and pull request
```

`vendor/BlueMap` is a read-only reference. The port reads it file by file; nothing in it is
edited, and nothing from it is copied without attribution in `design/NOTICE`.

</details>

<details id="minecraft-version-support">
<summary><b>Minecraft version support</b> (1.12.2 through 26.x, and where legacy support came from)</summary>

Current upstream BlueMap decodes 1.13 and newer. Support for 1.12.2 is combined back in from
upstream tag `v0.10.3-mc1.12`, the last release that carried it: the `Chunk_1_12` decoder, the
legacy block-id mapper, and the 15 neighbour-derived block-state extensions (fence connections,
snowy grass, and the rest).

`design/packages/engine/test/world-e2e.test.ts` is the acceptance proof for this. It builds a
synthetic 1.18 world and a synthetic 1.12.2 world byte by byte, then asserts exact block state,
biome and light decoding through `MCAWorld`, including the legacy extension reconstruction.

</details>

<details id="differences-from-upstream-bluemap">
<summary><b>Differences from upstream BlueMap</b> (what a port cannot carry over, and the security fixes)</summary>

Structural differences, because a TypeScript port cannot reproduce them one for one:

- The six Minecraft-server **platform adapters** (paper, spigot, fabric, forge, neoforge,
  sponge) embed BlueMap inside a server JVM, so they have no place inside the desktop
  application itself. Because decision D17 put a JVM in the product, they are no longer inert:
  **all six, plus the CLI, are built from the vendored source and attached to every release** as
  `bluemap-*.jar` (decision D18). They are a separate download and are not needed to install the
  desktop app. Inside the app, live data comes from remote BlueMap servers, or from local
  `playerdata` and RCON polling, which is a capability beyond upstream.
- Java jar **addons** are loaded by those adapter jars, not by the desktop application. An
  equivalent JS/ESM addon system against the ported TypeScript API is planned for the app
  itself and has not been built yet.
- The Java **BlueMapAPI artifact** is not shipped. Its wire formats and API surface are ported
  to TypeScript.
- **Metrics** are opt-in here. Upstream defaults to opt-out.

Deliberate security deviations, mandated by the porting conventions:

- Marker and popup HTML is passed through DOMPurify before it reaches `innerHTML`. Upstream
  injects it raw.
- `PopupMarker` uses event listeners instead of inline `onclick`, so the viewer works under a
  strict Content-Security-Policy.

Every intentional difference, including the ones above, is recorded with its upstream file and
line in [`design/docs/deviations.md`](design/docs/deviations.md). That log is a hard rule, not a
convention: a port that diverges silently is a port nobody can check.

</details>

<details id="product-contracts">
<summary><b>Product contracts</b> (five cross-cutting UI requirements, all shipped)</summary>

Five contracts apply to every user-facing surface this project ships: a regex builder on every
search bar, full browser-style tabbed navigation, per-element appearance editors with an
infinite colour picker, English / Hong Kong Cantonese / bilingual language modes with
per-language funny-level sliders, and super confirmation for destructive actions.

**All five are implemented, in the desktop application and on the documentation site.** They
were tracked as GitHub issues #6 to #13, all of which are closed with their evidence on the
issue. Two of them are enforced by tests rather than by remembering:
`components/config/regexPolicy.test.ts` fails if a search bar appears without its builder, and
`components/confirm/superConfirmPolicy.test.ts` fails if a destructive call site is not
declared with the gate that guards it.

What is named as remaining sits inside the closed issues rather than being hidden: the
appearance wrapper is proven end to end on the shell chrome with each further surface a
one-line wrap; most of the localization keys still render their English fallback until a
catalogue entry is added for them; and GitHub sign-out is the one destructive action still
behind an inline two-step confirm, listed in that guard's own `KNOWN_GAPS` so it is a stated
fact rather than an oversight.

Each contract has its own document, and
[`design/docs/contracts/README.md`](design/docs/contracts/README.md) is the index with the
per-contract status.

</details>

<details id="porting-rules-in-one-screen">
<summary><b>Porting rules in one screen</b> (the short version of the conventions)</summary>

The full text is [`design/docs/porting-conventions.md`](design/docs/porting-conventions.md).
The short version:

1. Fidelity first. Port file by file and preserve class, method, field and constant names and
   the control flow. The upstream file is the spec.
2. Same relative path and file name as upstream, with a `.ts` extension.
3. TypeScript strict. Avoid `any`; use `unknown` plus narrowing where upstream is dynamic.
4. Keep upstream logic comments. Drop upstream licence headers, since attribution lives in
   `design/NOTICE`.
5. No behavioural improvements during the port. Bug-for-bug compatibility unless the plan calls
   out a change, and every intentional deviation goes in `design/docs/deviations.md`.
6. Node packages are ESM with explicit `.js` extensions on relative imports (NodeNext).
   Browser-bundled packages use bundler resolution.
7. Preserve integer semantics where Java int/long maths matters.
8. Every ported module with non-trivial logic gets a colocated vitest.
9. Prettier with 4-space indent, to stay visually close to the upstream Java and JS.

</details>

<details id="attribution">
<summary><b>Attribution</b> (upstream copyright and the Minecraft asset position)</summary>

This project is derived from BlueMap, MIT licensed, Copyright (c) Blue
(<https://bluecolored.de>) and contributors. Full attribution, including the exact upstream
commit and the BlueMapAPI commit the wire formats come from, is in
[`design/NOTICE`](design/NOTICE). This repository is MIT licensed; see [`LICENSE`](LICENSE).

Minecraft assets (block models, textures) are the property of Mojang AB and are **not**
distributed with this project. The application downloads the Minecraft client jar from Mojang's
servers at runtime, only after explicit user consent, mirroring upstream BlueMap's
accept-download flow. BlueMap's own `resourceExtensions` JSONs are MIT and are bundled.

</details>
