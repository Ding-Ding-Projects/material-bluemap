# Feature parity with BlueMapGUI

BlueMapGUI is the other desktop wrapper around the BlueMap CLI. It solves the same problem
this project solves, it has solved parts of it for longer, and several of its choices are
worth taking. This document is the audit: everything it does, whether this repository does
it, and what closing each gap would actually cost here.

It is a research document, not a plan. It states what is true on both sides as of the
sources below and says plainly where this project is behind, where it is ahead, and where a
difference is deliberate rather than a gap.

## What was read, and how

| | |
|---|---|
| Repository | `TechnicJelle/BlueMapGUI` |
| Method | Full `git clone` into a temporary directory outside this repository, then read of every non-generated `.dart` file (6,675 lines across 49 files), both CI workflows, `USAGE.md`, `README.md`, `pubspec.yaml` and the bundled `assets/startup.conf`. Nothing here comes from the README alone. |
| Commit read | `1bbb487` (`Bump build_runner from 2.15.0 to 2.15.1`), tip of `main` |
| Released version | v2.0.2, *Updated for BlueMap 5.22* |
| Stack | Flutter/Dart, Riverpod, Freezed; Material Design **2** (`useMaterial3: false`) |
| Targets | Windows x64 and Linux x64 |
| BlueMap it drives | CLI **5.22**, downloaded as a release jar |

### Licence: there is none, so nothing may be copied

`gh api repos/TechnicJelle/BlueMapGUI` returns `"license": null`, and the working tree
contains no `LICENSE` file — the only licence texts in it belong to the bundled PixelCode
font. **No licence granted means all rights reserved.** Not permissive, not "probably fine
because it is on GitHub": the absence of a licence is the strictest state a public
repository can be in.

So: read it, learn from it, reimplement it. Do not copy a file, a function, a class, a
widget tree, or a distinctive block of prose from it into this repository. Behaviour and
ideas are not copyrightable; expression is. Where this audit quotes a string it is quoting
it as *evidence of behaviour*, and even those should be rewritten rather than pasted — this
project has its own voice and its own language modes, and a pasted English sentence has no
Cantonese counterpart anyway.

The one thing that is genuinely safe to take verbatim is what BlueMapGUI itself took from
elsewhere: BlueMap's own config keys, defaults and semantics, which this repository already
sources from the vendored upstream in `design/packages/config/src/templates/`.

## The shape of the two applications

They are not the same program with different paint. The difference that explains most of the
table below is what each one *is*:

- **BlueMapGUI drives a long-running BlueMap process.** Start spawns
  `java -jar bluemap.jar --render --watch --webserver`, which renders, then keeps running,
  watching the world for changes and serving the map on `localhost:8100` out of BlueMap's own
  web server. The app's main screen is a console watching that process. Stop sends SIGINT.
- **Material BlueMap runs a render to completion and then serves the result itself.**
  `design/packages/app/src/main/render/runner.ts` spawns `-c <configDir> -r -s`, no `--watch`
  and no `--webserver`; `render/config.ts` writes `enabled: false` into `webserver.conf` on
  purpose, and the rendered tiles are then served by this project's own
  auth-token-gated local server (`design/packages/server/src/http/HttpServer.ts`,
  `render/LocalMapHandler.ts`) and viewed inside the app rather than in a browser.

Neither is wrong. But "start BlueMap and leave it running" and "render, then look at what was
rendered" produce different screens, and several rows below are gaps only if this project
decides it wants the first behaviour as well as the second.

The second structural difference is **when Java is needed**. BlueMapGUI cannot show you a
project list until Java is configured, because it parses HOCON by shelling out to a bundled
`HOCONReader.jar`. This repository parses HOCON in TypeScript
(`design/packages/config/src/hocon/`), so the whole config editor works with no JVM present.
That is a real advantage and should not be traded away.

## The gap table

Status is one of **have**, **partial**, **missing**, or **deliberate** (this project does
something different on purpose). "Partial" rows name exactly what is absent.

### Getting a BlueMap to run at all

| Feature | BlueMapGUI's behaviour | Status here | Evidence | What it would take |
|---|---|---|---|---|
| Ship the BlueMap CLI | Downloads `bluemap-5.22-cli.jar` from the upstream GitHub release into the project folder on first open, with a progress bar, then verifies it against a SHA-256 hardcoded in `lib/versions.dart`. Re-hashes on every start and warns (not errors) if it no longer matches. | **deliberate** | `design/packages/app/src/main/java/jars.ts` resolves jars built from the `vendor/BlueMap` submodule by `tools/build-jars.mjs`; version comes off the filename (`cli-5.22-27-shadow.jar`). | Nothing to do, but see the version-selector row below. Adopting a release download would swap a build-from-source supply chain for a fetch-and-trust-a-constant one — a step backwards, not forwards. |
| Choose which BlueMap version to use | Implicitly one per app release; upgrading the app re-templates the project (see "project upgrade" below). | **missing** | The only pin is the submodule commit in `.gitmodules`. No selector, no channel, no list. | Real work. The jar layer would need to resolve more than one version, and the config schema is version-shaped. Worth an issue, not worth blocking on. |
| Detect system Java | Runs `java -fullversion`, parses both `1.8` and `25.x` numbering, requires **25 or newer**, reports the detected number in the UI. | **have** | `design/packages/app/src/main/java/discovery.ts`, `probe.ts`, `version.ts` (`REQUIRED_JAVA_FEATURE = 25`). This project actually *executes* each candidate and collects per-candidate rejection reasons, which BlueMapGUI does not. | — |
| Download a JRE automatically | "Managed" mode: Adoptium v3 API for the current ABI, hardcoded SHA-256 per platform, unpack into the app support directory, delete the archive, locate `bin/java`. Only linux-x64 and windows-x64; anything else is disabled with an explanation. | **have**, and better | `java/adoptium.ts` (refuses artefacts with no digest — the digest is fetched, not hardcoded), `download.ts` (resumable, verified), `extract.ts`, `installation.ts` (writes an auditable install record), `provision.ts` (opt-in, off by default). | — |
| Pick a Java executable manually | File picker, then version-check the chosen binary and show the result inline. | **partial** | `design/packages/ui/src/components/settings/JavaRuntimeRow.vue` exposes the runtime and provisioning. A **manual browse-to-a-`java`-binary** path is not there; discovery is `JAVA_HOME` → `PATH` → provisioned. | Small: a directory/file picker feeding one more candidate into `discovery.ts`, with the same probe and the same rejection reporting. Genuinely useful for anyone whose JDK is somewhere unusual. |
| Refuse to proceed without Java | The projects list is replaced entirely by "Please set up Java in the settings" and an arrow pointing at the sidebar. Three distinct messages depending on whether Java is unset, too old, or a stale managed install. | **partial** | Java state is a settings row here, and a render fails at the point of running. There is no equivalent up-front gate with a route to the fix. | Small, and worth doing at the render wizard's review step rather than app-wide — this app can do plenty without a JVM. |

### The Mojang download and the EULA

| Feature | BlueMapGUI's behaviour | Status here | Evidence | What it would take |
|---|---|---|---|---|
| `accept-download` consent | A checkbox in the Core config with a long explanation and two links (Mojang's EULA, `piston-meta.mojang.com`). Unchecked by default; the first Start fails and the console is rewritten to say "Please check the Core config in the bar on the left!". | **have**, and better | `design/packages/app/src/main/consent.ts` records the decision once with the document URL, a terms version, an ISO-8601 timestamp and the app version, and never re-asks. Schema field at `design/packages/config/src/schema/core.ts` (`consentGated: true`). UI at `ui/src/components/setup/ConsentSettingsRow.vue`. | — |
| Failing usefully when consent is missing | Rewrites the CLI's own "Please check: .../core.conf" line into a sentence naming the UI location. | **partial** | `render/failure.ts` classifies failures, but there is no rule that maps a consent failure to "open the consent row". | Small: one more classified failure with an action that deep-links the settings anchor `mojang-download-consent`, which already exists in `settingsSections.ts`. |

### Projects

BlueMapGUI's "project" is **a folder on disk** containing `config/`, `web/`, the downloaded
jar and the rendered output — one BlueMap installation per project, so one modpack or one
Minecraft version per project. This project's `project.ts` means something else entirely: a
single `material-bluemap.project.json` file living **at the root of a Minecraft world**,
holding that world's maps and storages. They are different concepts wearing the same word,
and any implementing agent should be careful not to conflate them.

| Feature | BlueMapGUI's behaviour | Status here | Evidence | What it would take |
|---|---|---|---|---|
| A named project folder | Create dialog with a name (validated `^[ a-zA-Z0-9_-]+$`), a location field with a folder picker, and a live "Project will be created in: `<path>`" preview. Rejects duplicates and reports permission failures by name. | **missing** | `design/packages/config/src/project.ts` defines a project *file*, and nothing outside `test/project.test.ts` imports it. There is no projects list, no create, no delete. | Medium. The bigger question is whether this project wants folder-projects at all, given it renders per-world into a configured storage directory. |
| A projects list | Rows of name + full path; each row watches its parent directory and shows "Error: Directory not found." live when the folder is moved or deleted. | **missing** | — | The live directory watch is the clever bit and is cheap: one watcher per row, not a poll. |
| Remove from list without deleting | Hover menu → confirmation dialog that says in as many words that the directory stays on disk. | **missing** | Compare `docs/finding-worlds.md`, which makes exactly this argument about unmount. The reasoning already exists here; the surface does not. | — |
| OneDrive protection | The default location is the OS Documents folder, but if Documents sits under `OneDrive`, it redirects to the real Documents path instead — with a guard for a user literally named `OneDrive`. | **missing** | No equivalent anywhere. | Tiny, and worth stealing the *idea* wholesale. A Windows user syncing a 40 GB tile tree to OneDrive by accident is a real support burden. Applies here to the **map storage directory**, not to projects. |
| Open the project folder in the file manager | Toolbar button and a per-row menu item. | **missing** | No `shell.showItemInFolder` or `shell.openPath` anywhere in `design/`; the only shell route is `github/external.ts`, which is https-only by design. | Small, and a real gap: this app writes tiles, configs and backups to disk and offers no way to get to them. Needs its own IPC channel with a path allowlist, not a general "open anything" hole. |
| Close the project | Toolbar button with a confirmation. | **n/a** | No project concept to close. | — |

### Opening a project (the first-run sequence)

This is BlueMapGUI's most interesting machinery and has no counterpart here, because this
project generates configs from vendored templates rather than by asking the CLI for them.

| Feature | BlueMapGUI's behaviour | Status here | Evidence | What it would take |
|---|---|---|---|---|
| Generate default configs | Runs the CLI once with **no arguments** and a 30-second timeout in the project directory, and treats the string `Generated default config files for you` in stdout as success. Tolerates config-parse problems and opens anyway, deliberately, so the user meets the error later where it is explicable. | **deliberate** | `design/packages/config/src/generate.ts` + `templates/sources.ts` emit configs from byte-copies of upstream's own defaults, with no JVM involved. | Do not adopt. Requiring Java before the config editor opens would be a straight regression. |
| Map templates | The generated `config/maps/` is renamed to `config/map-templates-<version>/` and an empty `config/maps/` is put back. "New map" then copies from the templates. | **have** in effect | `generate.ts` has `MapPreset` as a union of `"overworld"`, `"nether"` and `"end"`, with per-preset sky/void/ambient/cave/nether-ceiling values. | — |
| Project upgrade across BlueMap versions | If `config/maps/` exists but there is no templates directory for the current version, the user's maps are moved to `config/maps.temp`, the CLI regenerates fresh defaults, those become the new templates, and the user's maps are moved back. | **missing** | Config migration across upstream versions is not modelled here at all. | Medium, and only becomes urgent once the bundled BlueMap version moves. Worth an issue now so it is not discovered later. |
| A staged, honest progress dialog | Eight named steps — checking, downloading, hashing, running, mapping, copying, opening — each with its own sentence, plus a determinate bar during the download. Six distinct error states, each with its own copy and a scrollable monospace detail pane. | **partial** | `RenderRunPanel.vue` has real phases (`starting → downloading-resources → … → finished`) and `render/failure.ts` classifies failures. But there is no equivalent multi-step *setup* flow, because there is no setup. | The pattern is already this project's house style. Nothing to import; noted because it is the standard to match if a folder-project flow ever lands. |
| `startup.conf` | BlueMapGUI **invents a config file BlueMap does not have** and copies it into `config/`: `mods-path`, `minecraft-version`, `max-ram-limit`. At start it turns them into `--mods`, `--mc-version` and a JVM `-XX:MaxRAM=`. | **partial** | `mods-folder` and `mc-version` are modelled as CLI flags on the Run tab (`design/packages/config/src/cli/flags.ts`), so the values exist. **Max RAM is not a setting**: `jvmArgs` is plumbed from `orchestrator.ts` to `runner.ts` and is exercised only by `runner.test.ts` with `-Xmx4G`. No UI, no persistence, no caller. | Max RAM is the real gap and it is small: one setting, one persisted value, one `-Xmx`/`-XX:MaxRAM` argument into the existing `jvmArgs`. It matters — an unbounded JVM rendering a large world is the classic "my computer froze" report. Do **not** copy the invented file format; put it where this project puts settings. |

### Maps

| Feature | BlueMapGUI's behaviour | Status here | Evidence | What it would take |
|---|---|---|---|---|
| New map from a template | Dialog: template dropdown (Overworld/Nether/End, sorted by each template's own `sorting`), name field, live **"Map ID: `<slug>`"** preview (`nameToID`: lowercase, everything outside `[a-z0-9_-]` collapsed to `-`), duplicate-ID rejection, adaptive placeholder. Copies the template then rewrites `name:`. | **have**, differently | The render wizard (`design/packages/ui/src/components/world/wizardSteps.ts`) is five steps: world → name and dimension → options → where it goes → review. | The **live slug preview** is worth taking: a user who types "My Cool Map" should see `my-cool-map` before committing, because the id is what ends up in a URL and a folder name. |
| Reorder maps | Drag handles in the sidebar; dropping rewrites every map's `sorting:` to `index * 100`. Disabled in advanced mode and when any config is broken, with the reason recorded in a comment. | **partial** | `sorting` is in the map schema and in `project.ts`, and the maps screen edits it as a number. There is no drag-reorder. | Small-to-medium, and pleasant. The `index * 100` trick — leaving gaps so a single insert does not rewrite every file — is worth copying as an idea. |
| Re-render one map | "Danger zone" button that deletes `web/maps/<sanitised-id>/` so the next run regenerates it. Disabled with a tooltip when the folder is absent, and the copy says plainly that nothing unrecoverable is lost. | **missing** | `--force-render` exists on the Run tab and `force`/`fixEdges` exist on the render request, and `configWorkspace.ts` warns which maps *will need* re-rendering after a config edit. But no code deletes a render's tiles. | Medium. It needs an IPC channel that deletes inside the app's own storage root and nowhere else, and it must go behind [super confirmation](./super-confirmation.md) — deleting rendered output is exactly the shape that gate exists for. The honest copy ("nothing unrecoverable is lost, it just takes time") is the right framing and this project should use it too. |
| Delete a map | Confirmation dialog, then deletes both the config file **and** the rendered data directory. | **partial** | `MapsScreen.vue` deletes the map config behind the super-confirm gate, and its own copy states that "already-rendered tiles in storage `{storage}` are NOT deleted." | Same channel as the row above. The current copy is honest, which is the right way to be incomplete — but a user who deletes a map and finds gigabytes of orphaned tiles has still been left with a chore. |
| Warn that a world folder is not a world | The World Path field validates live: directory must exist, and must contain `level.dat`, or `region/`, or a `dimensions/<ns>/<dim>/region/`. | **have** | `design/packages/app/src/main/world/inspect.ts` plus the whole discovery layer in `world/` — see [finding-worlds.md](./finding-worlds.md). This project is far ahead here: it finds worlds rather than asking you to browse to them. | — |
| Warn that a mods folder has no mods | The Mods Path field warns if the directory is missing or contains no `.jar`. | **missing** | `mods-folder` is a plain path flag on the Run tab. | Tiny, and a good example of the class of check this project should have on every path field. |

### The running process, and watching it

| Feature | BlueMapGUI's behaviour | Status here | Evidence | What it would take |
|---|---|---|---|---|
| Start / Stop | One button over a four-state machine (stopped / starting / running / stopping), label and icon following the state. Stop is SIGINT. | **have** | `render/runner.ts` (SIGINT then SIGKILL escalation, with the Windows behaviour documented), `render/ipc.ts`, `ui/.../world/renderRun.ts` state machine, cancel button in `RenderRunPanel.vue`. | — |
| Keep BlueMap running and watching | `--render --watch --webserver`: renders, then stays up watching the world and serving the map. | **deliberate**, with a caveat | `runner.ts` spawns `-r -s` only. `--watch` **is** modelled in `cli/flags.ts` but no local run uses it. | Flagged, not recommended blindly. A watch mode implies a long-lived process, a live web server and a very different main screen. If it is ever wanted, it should be a distinct explicit mode, not a flag quietly added to the existing render. |
| A console | Black panel, monospace, colour-coded by level (`ERR` red, `WARN` yellow, `INFO` white, `[TIP]` blue, `[Signal]` grey), selectable text, sticky auto-scroll that only sticks when already at the bottom, and a scroll-to-bottom button that fades in when you scroll away. | **partial** | `render/progress.ts` parses `[HH:MM:SS LEVEL] message` into typed lines; `renderRun.ts` keeps a **200-line ring**; `RenderRunPanel.vue` shows a collapsible `<pre>`. | Medium, and the most visible gap. What is missing: it is a bounded disclosure rather than a first-class console; only 200 lines are kept; there is no level colouring, no sticky-scroll behaviour, no scroll-to-bottom affordance, no per-level filter, and **no search** — which this project's own rules say every such surface must have, wired to the [regex builder](./regex-builder.md). It should also be exportable and copyable like every other record here. |
| Synthetic status lines in the log | Injects `[Signal] Starting… / Running! / Stopping… / Stopped. (exitcode)` so the console reads as a narrative. | **missing** | Phases exist as state, not as log lines. | Tiny once a real console exists. |
| Annotating the CLI's output | Six specific rewrites and injected tips: the `core.conf` pointer; a four-line explanation of a port conflict naming BlueMap-as-a-client-mod and orphaned processes; a one-shot "raise the render thread count" tip on the first `(ETA:` line; a warning when it says `Start updating 0 maps`; a "you can open the map now" tip when the web server starts. | **missing** | `render/progress.ts` parses levels and progress; `render/failure.ts` classifies terminal failures. Nothing annotates a *running* log with advice. | Small per rule, and this is the single best idea to take from BlueMapGUI. It is knowledge about BlueMap's own output encoded where a user meets it. It fits this project's tone rules cleanly: the fact is the CLI's line, the advice is this app's voice, and the [funny level](./language-and-tone.md) styles the advice without touching the quoted line. Build it as a table of (pattern → advice), tested, not as conditionals scattered through a stream handler. |
| Working around an upstream hang | On `Failed to load map config` the CLI is known to hang, so BlueMapGUI kills it after 5 seconds. | **missing** | No watchdog on the child process. | Small, and worth having as a general guard: a defined stall condition with a timeout beats a spinner that never resolves. Whether *this* particular hang still exists in 5.22-27 needs checking before the rule is copied. |
| Stopping cleanly on window close | Intercepts the window close, stops the process, waits for the stopped state, pauses one second so the user reads "Stopped.", then closes. | **partial** | Interrupted runs are detected by app-instance id and offered for resume (`render/resume.ts`, `InterruptedRenders.vue`) — arguably a better answer, because it survives a crash and not just a polite close. | Small: also stop the child on a clean quit, so the resume offer is for real crashes rather than for every exit. |
| Clear the console before each start | An app setting, on by default, with copy explaining that old errors otherwise stay on screen and confuse. | **missing** | — | Tiny, once there is a console. |

### Viewing the rendered map

| Feature | BlueMapGUI's behaviour | Status here | Evidence | What it would take |
|---|---|---|---|---|
| Open the map | An "Open" button that launches `http://localhost:<port>` in the system browser, enabled only while running. | **deliberate** | This project serves rendered tiles itself at `/local/{renderId}` (`render/LocalMapHandler.ts`) and views them in-app: `App.vue`'s `openRenderedMap()` turns a finished render into an entry in the same list a remote server uses (`ui/src/stores/profiles.ts`), and selecting it opens the map. | Nothing. The in-app route is better: no unauthenticated listener, no browser round trip. |
| Learn the port | Scrapes it out of the CLI's log line `WebServer bound to …:8100` with a regex, defaulting to 8100 if that fails. | **n/a** | `webserver.conf` is written `enabled: false`. | — |
| Celebrate | The Open button scales and glows when the server comes up, damped as soon as the pointer touches it. | **missing** | — | Noted for delight, not for parity. Anything like it here must respect reduced-motion. |

### Editing configuration

| Feature | BlueMapGUI's behaviour | Status here | Evidence | What it would take |
|---|---|---|---|---|
| A form editor over the configs | Five typed views: Core, Startup, Webapp, Webserver, Map. Roughly **21 settings in total** — Core has 2, Webapp has 1, Webserver has 1, Startup has 2, and a map has about 15. | **have**, far ahead | Seven screens (`ui/src/components/config/configSearch.ts`): Core, Maps, Storages, Web app, Web server, Server plugin, Run — plus a History tab. Schema field counts: core 10, map 32, mask 8, plugin 12, storage 10, webapp 19, webserver 8, plus the CLI flag set. | — |
| Rich per-option prose, with links and inline code | Every option carries a paragraph under its title; links open in a browser; code fragments (`minecraft:the_nether`) are styled. | **have** | Field descriptions and groups live in the schema (`design/packages/config/src/schema/*.ts`) and render on the screens. | — |
| Options a config file is too old to contain | Missing keys are **struck through and disabled**, the checkbox goes tri-state, and a tooltip explains the file is out of date. | **missing** | This project rewrites whole files from schema rather than editing keys in place, so the situation arises differently — but a *user-supplied* config folder with an old file hits exactly this case. | Small-to-medium, and a genuinely good pattern: it shows the setting exists, says why it cannot be used, and does not silently hide it. That matches this project's stated rule about never dropping a value it cannot represent. |
| Surgical writes that preserve comments | A regex replaces only the value on the matching `key:` line in the real file, so comments, ordering and formatting survive. Saves on editing-complete, on slider release and on dispose. | **partial** | `ConfigApplyDialog.vue` and `configWorkspace.ts` write a config set; `render/config.ts` writes files whose own header says edits there are overwritten. | Relevant only where this app edits a folder somebody else authored. If that is a supported case, comment preservation is close to mandatory — silently eating a user's comments is the kind of thing they discover a month later. |
| Friendlier names over unfriendly keys | "Render All Caves" over `remove-caves-below-y: -10000`; "Render Only Visited Chunks" over `min-inhabited-time: 0/1`; a three-way icon toggle over the perspective/flat/free-flight booleans. | **partial** | The schema exposes the real fields with real labels. | Small and worth doing where a numeric sentinel is really a boolean. The rule to keep: the friendly control must not hide the actual value, and switching to the raw view must show what was written. |
| Colour pickers for sky and void | An HSV wheel with a hex field, six-digit, no alpha. | **have**, far ahead | The [appearance editors](./appearance-editors.md) carry an infinite picker with a colour translator across many spaces. | Confirm the *map config* colour fields actually reach that picker rather than a plain text input. |
| Advanced/raw HOCON editor | A switch replaces the form with a full text editor over the raw file: **YAML syntax highlighting**, line numbers, light/dark code themes, green comments, no word wrap, autosave every five seconds plus a synchronous save on dispose. | **partial** | An `showAdvanced` toggle exists (`ConfigFileForm.vue`, `MapOptionsStep.vue`) but it reveals *advanced fields*, not raw text. Raw text is a read-only "show the file as it will be written" `<pre>` with a Copy button; an editable textarea exists **only** as the fallback for a file whose HOCON will not parse (`ConfigFileForm.vue`, gated in `configModel.ts`). **No syntax highlighting exists anywhere in this repository.** | Medium. Two distinct pieces: an editable raw view for every config (not just broken ones), and a highlighter. Note the naming collision — "advanced mode" means two different things in the two apps, and the docs here should not inherit the ambiguity. |
| Parse errors pointed at the line | The gutter prints `Error` in place of the line number on the offending line, and a red banner names the problem. A type-mismatch gets its own message: "There is likely a critical option renamed, removed, or commented out." | **missing** | Unparseable files fall back to a plain textarea with no position information. | Medium, and it depends on the parser reporting a position. Worth checking whether `config/src/hocon/` already carries one — if it does, this is mostly presentation. |
| A route out of a broken config | When the form cannot render, a red panel appears with a "Switch to Advanced Mode" button. | **partial** | The textarea fallback appears, but nothing explains why or offers the choice. | Small: name the problem, then offer the raw editor as a labelled action rather than as a silent substitution. |

### Application settings, chrome and updates

| Feature | BlueMapGUI's behaviour | Status here | Evidence | What it would take |
|---|---|---|---|---|
| Theme mode | System / Light / Dark radio group, persisted. | **have** | `ui/src/components/menu/SettingsMenu.vue` (default / dark / light / contrast) and, for the docs site, `site/src/theme/ThemeController.ts`. | — |
| Material Design | Material **2**, explicitly (`useMaterial3: false`), with a hand-rolled `TechApp` theme. | **deliberate** | This project is M3 throughout. | Nothing to take. Screenshots of BlueMapGUI are not a design reference here. |
| Window chrome | The ordinary OS title bar, with a Flutter `AppBar` under it. | **deliberate** | This project requires a frameless window with a custom Material title bar. | Nothing to take. |
| Update check | HEADs the `releases/latest` URL **without following the redirect** and reads the tag out of the `Location` header — clever, and it needs no API token and no rate limit. Only runs for release builds; disabled by an environment variable. Shows a yellow "Update" button whose tooltip reads `2.0.1 -> 2.0.2` and which opens the releases page in a browser. **No in-app download, no install.** | **missing** | No `autoUpdater`, no update check anywhere. `electron-builder.config.cjs` notes that Squirrel produces the `RELEASES`/`.nupkg` pair "that Electron's own autoUpdater consumes" — and nothing consumes it. | Medium, and this project's bar is higher than BlueMapGUI's: a Squirrel feed, background download, signature verification, and a persistent non-blocking "restart to install" banner rather than a link to a web page. The redirect trick is still worth remembering as a zero-dependency fallback. |
| A help link | Toolbar button opening the project's help page. | **partial** | There is a docs site and a [changelog viewer](./changelog-viewer.md), and `github/external.ts` opens https URLs. Whether a Help affordance exists in the app chrome should be confirmed. | Tiny if missing. |
| Version display | "Version: `<v>` / BlueMap: `<tag>`" printed permanently in the bottom-left corner. | **partial** | Version appears in the changelog viewer and About-shaped surfaces. The **BlueMap version being driven** is knowable (`jars.ts` parses it off the filename) but is not obviously surfaced. | Tiny, and worth it: "which BlueMap is this?" is the first question in any support thread. |
| Resource packs and data packs | Not managed. `USAGE.md` tells the user to click "Open in file manager", walk to `config/packs/`, and paste files in, and links upstream's wiki. Explicitly deferred. | **missing** | No `packs/` concept anywhere in `design/`. (`design/packages/engine` parses resource packs as a *renderer*; that is not a user-facing packs folder.) | Medium, and an opportunity: both applications are equally missing it, so building a real pack manager — list, add, reorder, enable/disable, with the load order made visible — is a place to be ahead rather than level. |

### Packaging and delivery

| Feature | BlueMapGUI's behaviour | Status here | Evidence | What it would take |
|---|---|---|---|---|
| Windows artefact | A **zip of the runner directory**. No installer. | **deliberate** | This project ships Squirrel.Windows: `Setup.exe`, `RELEASES`, full and delta `.nupkg`. | Nothing to take. |
| Linux artefact | Bundle zip plus an AppImage. | **deliberate** | This project is Windows-only by decision. | Nothing to take. |
| Release gating | A CI job asserts the release tag matches `pubspec.yaml`'s version before either platform builds. | Worth noting | — | A cheap, good idea. Whether this repository has an equivalent guard is outside this audit's scope. |
| Website | A Dart static-site generator with a home page and a help page mirroring `USAGE.md`. | **have**, far ahead | `design/packages/site/` carries an article per feature. | — |

## Things not to take

Recorded so nobody has to rediscover the reasoning:

1. **Downloading a prebuilt CLI jar against a hardcoded hash.** It works, and it keeps the
   app small. It also means the app can only ever run the one BlueMap build its constant
   names, and that a hash rotation is an app release. This repository builds from a pinned
   submodule, which is a stronger position.
2. **Generating configs by running the CLI.** Elegant — the defaults are always upstream's,
   by construction. But it makes a JVM a prerequisite for opening the settings screen, and
   it makes the first-open path a 30-second subprocess with a string-match success test.
   Vendored templates give the same guarantee without either.
3. **Parsing HOCON by shelling out to a bundled jar.** Same objection, larger. This project's
   TypeScript parser is testable, fast, and works with no Java at all.
4. **Material Design 2 and the OS title bar.** Both are settled the other way here.
5. **`startup.conf` as a file format.** The three settings it holds are worth having. A
   config file BlueMap does not read, sitting in BlueMap's config directory looking like one
   of BlueMap's own, is a trap for anyone who later opens that folder with the real CLI.
6. **A zip as the Windows install path.** Settled the other way here.
7. **Confirmation dialogs with a bare red text button.** This project has
   [super confirmation](./super-confirmation.md) for anything irreversible, and it exists
   precisely because a one-click red button is not a gate.

## Where this project is ahead

Stated so the implementing work is scoped to the gaps and does not accidentally regress
something:

- World discovery. BlueMapGUI asks you to browse to a folder; this project finds worlds,
  reads `level.dat`, lets you mount extra installations, and searches the lot
  ([finding-worlds.md](./finding-worlds.md)).
- Config coverage: roughly 99 schema fields across seven screens against about 21 settings.
- Storages beyond a plain directory, including SQL.
- Rendering in GitHub Actions, sharded and resumable
  ([render-in-actions.md](./render-in-actions.md), [resumable-renders.md](./resumable-renders.md)).
- Local git history over config folders ([config-history.md](./config-history.md)), the
  [notification centre](./notification-centre.md), the [command palette](./command-palette.md),
  [tabbed navigation](./tabbed-navigation.md), the [appearance editors](./appearance-editors.md),
  the [regex builder](./regex-builder.md) on every search surface, and
  [language modes and funny levels](./language-and-tone.md). BlueMapGUI has none of these; it
  is English-only, with no in-app search of any kind.
- Java provisioning that verifies a fetched digest rather than a compiled-in constant, and
  records what it installed.
- Consent recorded as an auditable decision rather than a checkbox in a file.

## Verification

Nothing in this document was verified by running either application. It is a source read on
both sides, and every claim above names the file it came from so it can be checked. Two
things in particular should be confirmed before anyone builds against them:

- that the `Failed to load map config` hang BlueMapGUI works around still exists in the
  BlueMap version this project vendors, before its five-second watchdog is copied;
- that `design/packages/config/src/hocon/` reports a position on a parse error, which decides
  whether "point at the broken line" is presentation work or parser work.

## Related

- [finding-worlds.md](./finding-worlds.md) - how this project finds worlds instead of asking
- [regex-builder.md](./regex-builder.md) - the search every new surface here has to carry
- [super-confirmation.md](./super-confirmation.md) - the gate a "delete rendered tiles" action belongs behind
- [language-and-tone.md](./language-and-tone.md) - why annotated log advice can be funny and the quoted line cannot
