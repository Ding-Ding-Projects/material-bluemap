# Handoff

## Update, 2026-08-04 — every rendered Pages element and live group discovery

The clean `pages-material3-full-continuation` linked checkout starts from `origin/main` at
`0a99147`, while the main checkout's concurrent history/config work remains untouched. This
checkpoint adds two Pages-only contract fixes:

- `decoratePage` now walks every rendered HTMLElement through
  `packages/site/src/appearance/editor/coverage.ts`, so prose, headings, disclosure summaries,
  table cells, links and controls all receive the same Material 3 appearance context menu and
  anchored editor. Script/style/template plumbing is excluded because it has no user-facing
  appearance.
- The discovery tab now rebuilds only the per-group search surfaces when the persisted group
  list changes. Each new group receives its own anchored regex builder and independent query;
  removed groups destroy their field listeners instead of leaving orphaned searches behind.

The new regression coverage is `coverage.test.ts` and `discoveryView.test.ts`. Focused verification
currently passes **2 tests** and site typecheck passes. The full suite/build and hosted Pages proof
remain outstanding for this continuation.

## Update, 2026-08-04 — searchable tab, group and overflow menus

The same clean linked checkout now gives the shared site `Menu` primitive its own local filter and
guided regex builder. Tab, group, overflow and page-action menus pass localized labels into that
primitive, so each menu filters only its own command list, reports an explicit no-match state,
and restores focus through the existing overlay path. The search model is non-persistent; plain
text remains the default and regex is opt-in from the adjacent builder.

`packages/site/src/platform/Menu.test.ts` covers the field/list relationship, local filtering,
builder affordance and empty state. Focused verification now passes **3 tests** including the
appearance and dynamic-group regressions; the full suite, production build and hosted Pages proof
still need to be re-run for this additional change.

## Update, 2026-08-04 — site gate re-run after menu integration

The Pages package now passes `pnpm --filter @material-bluemap/site typecheck`, repository lint,
the full site Vitest suite (**132 tests across 16 files**), `pnpm --filter
@material-bluemap/site build` (211 modules), and `git diff --check`. The site build retains the
existing non-failing warning about the main JavaScript chunk exceeding 500 kB. The repository-wide
Vitest command is not a clean gate on this checkout: 21 engine tests cannot resolve the unbuilt
`@material-bluemap/nbt` package entry, and config fixture tests fail on the checkout's CRLF/LF
byte boundary; those failures are outside this Pages change and are reported as such.

The generated changelog was refreshed with `node scripts/build-changelog.mjs` and its check passes
from the repository root. Hosted PR checks and a real headless/runtime capture remain outstanding.

## Update, 2026-08-04 — shell regex slot now has a real provider

The shared `RegexBuilderSlot` had been constructed but never provided, which left the tab-list
menu and bulk-close builder buttons absent at runtime. `main.ts` now registers a non-persistent
provider backed by the same `SearchQueryModel`, bounded evaluator and anchored builder used by
the other search fields. Tab-list filtering carries the selected regex mode and flags into its
matcher, so opening the builder no longer silently falls back to plain text.

The site gate was re-run after this wiring: **132 tests across 16 files**, lint, typecheck and the
211-module production build pass. A hidden Chrome capture from the fresh preview server shows the
landing surface and the Search tab; the tab-list menu capture shows its own keyboard-focused
`Filter pages` field. The screenshot is local evidence only until the branch is pushed and GitHub
Pages rebuilds it.

## Update, 2026-08-04 midday — config controls, a history per folder, backups, and the door to the options editor

Six commits on `main`, in the order they landed. Every SHA below resolves; each was read with
`git show --stat` before it was written about here.

### `6b8ef7bd0075a2a817f33e68e0292a11d9649ff1` — selects that rendered blank, and colours without alpha

The premise going in was "too many text boxes"; the commit records that 82 of 90 fields
already carried a real control. What the sweep found instead was closed selects rendering
**blank** for values BlueMap itself writes: `storage-type` offered `file` and `sql` while the
Java default is `bluemap:file`, so a fresh install's own config matched no option and the
next interaction would have overwritten a correct value with a different spelling of itself.
The same shape sat on compression, loader, dialect and the dimension keys, and
`resolution-default` was a closed select over a float.

Selects now normalise registry keys before matching — a `keyNamespace` on the control says
which namespace applies — and where a file carries a value no option holds verbatim, the
control prepends an item carrying the file's own text, labelled with the matched option's
meaning when it is only a different spelling and flagged as unlisted when it is genuinely
unknown. Both colour fields now mount the application's continuous colour picker with alpha,
because upstream's `Color.parse` reads an eighth hex byte as alpha.

The guard is `design/packages/config/test/controlPolicy.test.ts`: it classifies each field's
real domain from its zod schema, asserts the control fits, and takes a second opinion from
upstream's own Java field types. Measured today: **14 tests** in that file, **11** in the new
`design/packages/ui/src/components/config/ConfigControl.test.ts`.

### `1b77779a4144ef97271c6727c9894e5d1646e724` — a local git history per config folder

Each config folder now gets its own isolated git repository beside the app's data directory
(`<userData>/config-history/<folder-slug>-<hash16>/`), never a `.git` inside the user's
folder. Every save snapshots the folder as it is, deletions included. Restore is append-only:
it snapshots what is on disk first, then writes the old files, then records the restore
itself as a new revision with a `Restored-From` trailer — no `reset`, no `amend`, no
`rebase`. The panel is a **History** tab in the config screen, reusing the changelog date
picker, deriving its action chips from the revisions actually present, and carrying the
regex-builder search field. Trimming is the only operation that deletes anything and sits
behind the super-confirmation gate; it refuses to empty a history.

The structural rule: **a failed history write never fails the save.** The git runner returns
failures as values rather than throwing, every IPC handler resolves, and the snapshot call
after a save is fire-and-forget.

Measured today: **74 tests** across the three history files —
`packages/app/src/main/history/ipc.test.ts` (37),
`packages/ui/src/components/history/historyModel.test.ts` (20) and `HistoryPanel.test.ts` (17).

### `157f4c3eb3cacff1d82b0010f59a5f5827d7710a` — `docs/config-history.md`

The article for the feature above, indexed from `docs/README.md`. Behaviour, configuration,
failure modes, security and verification.

### `8cbac6334136948301c8f83d8e57702ff71fdaf6` — backing a world up to release assets

Worlds and rendered maps can be packed, split and published as GitHub release assets, and
read back. Git LFS was rejected on cost, by name, in `main/backup/pointer.ts` and in
`docs/backup.md`: 1 GB free storage, bandwidth metered against every restore. Release assets
are free on public repositories and capped per asset rather than per account.

The pointer format is **not** this project's own. It is Desktop Material's Cheap LFS v1,
copied rather than reinvented, so a backup written here is readable by that application.
Metadata belonging to this application went into a separate `backup.json` asset rather than
into the pointer. The interop claim is scoped honestly and stays scoped here: the canonical
regexes are copied into a fixture and this writer's output is run through them, which proves
the format — **not** a round trip through an application these tests cannot run.

Restoring hands the chosen release to the existing downloads surface, which fetches parts,
checks each against its published SHA-256, rejoins them and verifies the whole file. A backup
whose upload stopped before the pointer went up is listed, marked unfinished, and offered no
restore button, because there is no digest to verify it against.

The screen is a fourth shell tab (`Backups`), with a test that opens it. Measured today:
**128 tests** across the nine backup files — 95 in `packages/app/src/main/backup/` and 33 in
`packages/ui/src/components/backup/`.

### `5c810d0277fc4cafbbcf76bafc3dca80c3d441e6` — the options editor opened on a locked door

Fixing the earlier provide/inject bug had a consequence nobody looked for. With no host the
editor used to fall back to a generated config set, so every tab and setting was on screen;
once it resolved a real bridge that fallback stopped applying, and the editor began opening
on "Nothing is open yet" with **no tabs at all** until a folder existed. That is what the
report "I don't see all bluemap configs available in gui" was actually about.

It now opens on the config folder BlueMap already uses when that folder is really on disk,
and otherwise on BlueMap's own defaults, labelled as not yet saved — deliberately *not*
reusing the no-bridge wording, which says "this build cannot write one". The commit records
154 settings across all eight tabs in both states; that figure is the commit's, not an
independent measurement here. What was checked here is the tab set:
`components/config/configSearch.ts` declares seven `SCREENS` and `ConfigScreen.vue` adds the
History tab, which is eight.

The same commit added the capture-harness gate. `attempt()` records a missing surface instead
of failing, which is right for a screen needing a Java runtime or a real GitHub account and
wrong for a screen that is simply part of the application: six options-editor captures had
vanished from the artifact while the job stayed green. `REQUIRED_SURFACES` now names six
surfaces — `Options editor`, `Options editor tabs`, `Options editor search`, `Options editor
regex builder`, `Profile manager`, `Notification corner` — and a run that cannot open one
fails.

### `8491f0d3c39a02358fe0adf213fece51603bdf90` — three stale capture selectors

The gate fired on its first CI run and turned the build red, which is the correct outcome.
Three selectors had been photographing around broken navigation:

1. The profile manager was opened from a floating button the tabbed shell deleted on purpose;
   the harness now opens the tab, and clicks the tab's **label** rather than the tab, because
   a tab carries its own close button and a click on its centre is a coin toss between
   selecting and closing it.
2. It then waited for the profile list to be *visible*. The listbox is always rendered, but
   with no maps and no servers it has no rows and therefore no height, and a zero-height
   element is invisible by Playwright's definition — so the wait was really waiting for
   somebody to add a server. It now waits for the element to be attached.
3. The notification history was renamed when a flat column of message strings became a real
   notification centre; the bell is now found by its class, because its label carries the
   unread count and changes with the corner.

### Verification, measured today

- `node scripts/build-changelog.mjs` — wrote both outputs; **49 versions, 134 entries (2
  unreleased), every SHA resolved**. `node scripts/build-changelog.mjs --check` then passes.
- `cd design && npx vitest run` — **276 files, 4457 passed, 3 skipped, 0 failed**, 30 s.
- `cd design && npx vitest run packages/ui/src/components/changelog` — **4 files, 68 passed,
  1 skipped**.

Per package, from the same run:

| Package | Tests | Package | Tests |
|---|---|---|---|
| `ui` | 1663 (1 skipped) | `engine` | 1150 (1 skipped) |
| `app` | 809 | `shared` | 196 |
| `config` | 190 (1 skipped) | `render-actions` | 147 |
| `site` | 127 | `viewer` | 57 |
| `nbt` | 56 | `worldgen` | 32 |
| `parts` | 25 | `server` | 5 |
| `cli` | none yet | | |

### CI, as it actually stands

These are read from the run list, not predicted. `success` and `failure` are recorded
verdicts; `in progress` means exactly that at the time of writing and nothing more.

| Commit | CI run | Verdict |
|---|---|---|
| `6b8ef7b` | 30923535221, 30924515607 | success |
| `1b77779` | 30924158389 | cancelled (superseded by a later push) |
| `157f4c3` | 30924276107, 30926223701 | success |
| `8cbac63` | 30926226591 | cancelled (superseded by a later push) |
| `5c810d0` | 30926891432 | **failure** — the `Screenshots` job, on the new gate |
| `5c810d0` | 30927851530 | **failure** — `Lint, build, test` |
| `8491f0d` | 30928687703 | in progress at the time of writing |
| `49af181` | 30929184907 | queued at the time of writing |

The two failures are different, and both matter:

- **30926891432** is the gate doing its job. The `captured every surface that needs nothing
  but the application` test failed with `Profile manager` and `Notification corner` in the
  skipped list, both `locator.click: Timeout 15000ms exceeded`. Those are the selectors
  `8491f0d` then fixed.
- **30927851530** is a different and still-open problem. `Lint, build, test` reported **1
  failed, 4435 passed, 24 skipped**, and the failure was
  `packages/app/src/main/backup/archive.test.ts > survives a file large enough to need more
  than one read chunk`, `Test timed out in 5000ms`. That file passes locally (11 tests). It
  is a timeout on a slower machine, not a wrong answer, and it needs an explicit timeout or a
  smaller fixture rather than a re-run.

### What remains

- **The archive-test timeout above.** Until it is fixed, `main` cannot go green, and so no
  release is published for this work.
- **No screenshots of the new surfaces yet.** The History tab and the Backups tab are not in
  `REQUIRED_SURFACES` and have no capture step, so the harness will not notice if either
  stops opening. Adding them is the obvious next step now that the gate exists.
- **Backup interoperability is format-proven, not round-trip-proven** — see the scoping in
  the `8cbac63` entry above.
- **The history covers config folders only.** Profiles, application settings and the
  maps-and-servers list are still not snapshotted, so a mistaken deletion there has no undo.
- The `154 settings` figure is the commit's own; no test asserts it, so it will drift
  silently if the schema changes.

### External-state dependency

Everything above about CI comes from the GitHub Actions run list for this repository and can
change after this was written. The two in-flight runs had no verdict when this section was
recorded, and nothing here should be read as predicting one.

## Pages continuation checkpoint (2026-08-04)

The `pages-material3-continuation` linked worktree carries the merged Pages contract work and
closes the next hosted-capture gap. The persisted shell language/tone settings now feed the
search package, so every regex field refreshes its visible label, placeholder, builder title and
results when the visitor changes mode or either funny slider. Search results carrying
`article#section` now land on the exact documentation heading rather than reopening the article
at its top. New Pages tabs and the command palette use live bilingual copy; the palette is also
registered as an appearance target and its command inventory is rebuilt from current settings.

The changelog date filter is now an anchored Material panel with month navigation, a 42-cell
keyboard calendar, range selection, typed ISO or slash dates, inline validation, named presets,
and copy/export status messages. The notification centre now has its own localized search,
explicit clear-history action, and Markdown export. The command palette now indexes every
documentation article and teleports to its exact disclosure. `decoratePage` registers the page's
semantic controls as instance appearance targets so the published Pages surface does not leave
its new cards, searches, dialogs or controls outside the editor.

The Pages tab strip now keeps its normal management menus while adding Edit tab appearance and
Edit group appearance, with Shift+right-click opening the same anchored editor directly. The
feature article is `docs/site/tab-appearance-editors.md`; the desktop application's equivalent
remains a separate cross-surface gap.

Verification in this linked worktree:

- `pnpm --filter @material-bluemap/site typecheck` — passed.
- Focused site tests — **127 passed** across 13 files, including localization, article-command,
  settings-tab search, content, date-range, changelog and search suites.
- `pnpm lint` — passed.
- `pnpm build` — passed for all workspace packages; the site production bundle transformed 205
  modules.
- `node scripts/build-changelog.mjs --check` — passed (44 versions, 123 entries).
- Hosted CI run [30890865475](https://github.com/Ding-Ding-Projects/material-bluemap/actions/runs/30890865475)
  passed workflow lint, **4,232 tests with 22 skipped**, all seven jars, Java test-world render,
  the Windows installer, and the full screenshot suite. The screenshot correction is therefore
  verified on the merged default branch, not merely on the continuation branch.
- Pages workflow [30892326119](https://github.com/Ding-Ding-Projects/material-bluemap/actions/runs/30892326119)
  passed both site build and deployment. The live bundle at
  `https://ding-ding-projects.github.io/material-bluemap/` contains the settings-tab search and
  article command palette strings from the merged build.

This is source, type, focused-unit, lint and production-bundle evidence. A cheap headless
Windows capture of the live GitHub Pages site remains a separate runtime/UI boundary.

The settings page now gives every schema tab its own scoped search field and adjacent full regex
builder. The page-level field remains the cross-tab index; local fields combine with it without
sharing query, matcher or invalid-state storage. See `docs/site/settings-tab-search.md`.

## Pages rewrite checkpoint (2026-08-04)

The linked Pages worktree `pages-material3-rewrite` rewired the site entry point so the existing
Material 3 modules are reachable from the published shell instead of sitting as unmounted
contracts. The new `Search` tab mounts documentation, settings, current-strip, every-group,
group-name, master-tab, and both bulk-close searches; each field keeps its own anchored full
regex builder. `Ctrl+Shift+F` opens a persisted bounded/full-window command palette whose rows
can reveal pages, settings and appearance actions. `Changelog` parses the committed
`CHANGELOG.md`, offers date presets and typed date bounds, and exports/copies the filtered view.
`Notification centre` exposes the existing toast history. Settings search now attaches its own
builder, and the destructive settings reset uses two independent key challenges plus a full-range
authorization slider with Escape and reduced-motion handling.

Evidence from the clean linked worktree:

- `pnpm --filter @material-bluemap/site typecheck` — passed.
- `pnpm --filter @material-bluemap/site exec vitest run` — 119 tests passed across 9 files.
- `pnpm --filter @material-bluemap/site build` — Vite production build passed (140 modules).

This is source, type, unit, and production-bundle evidence. A cheap headless Windows capture of
the live GitHub Pages site remains a separate runtime/UI boundary and is not claimed by these checks.

## Plain-language summary (start here)

This section is written in short, plain sentences on purpose. It defines every term it
uses. Read it first. The rest of this document is a chronological log written for people
who were there; this section is for anyone who was not, including a small language model
with no other context.

### What this project is

Material BlueMap is a Windows desktop application. It shows 3D maps of Minecraft worlds.
It is a TypeScript rewrite ("port") of an existing Java program called BlueMap. The
original Java source code is kept in this repository at `vendor/BlueMap` as a git
submodule. The port must behave exactly like the original, down to the byte, where the
document says so.

### Glossary

| Term | Meaning |
|---|---|
| **The port** | Rewriting BlueMap's Java code as TypeScript, file by file |
| **`design/`** | The folder holding all the TypeScript code, as a pnpm monorepo of 12 packages |
| **The app** | The Electron desktop application (`design/packages/app` is the main process, `design/packages/ui` is the interface) |
| **The engine / the mesher** | `design/packages/engine`. Turns Minecraft world files into 3D map tiles. This is the largest and hardest part of the port |
| **Hires tile** | A 3D mesh file covering a small square of the world. Written in a binary format called **PRBM**, then gzipped. The file name looks like `tiles/0/x3/z7.prbm.gz` |
| **Lowres tile** | A PNG image used when the camera is far away. Lower level of detail |
| **`textures.json`** | A list of every block texture the map uses. Hires tiles refer to textures by their position (index) in this list |
| **Phase D** | The project phase that ports the mesher. Phases are named A through J; their status is in `ROADMAP.md` |
| **The gate** | Phase D's exit test: a whole world rendered by both engines must come out byte-identical (PRBM bytes equal, PNG pixels equal) |
| **The oracle** | `tools/oracle/compare.mjs`. Renders one generated world twice (Java engine, then TypeScript engine) and reports every byte that differs. This is how the gate is measured |
| **D17, D18** | Numbered project decisions, recorded in `design/docs/decisions.md`. D17: the app ships and uses the original Java engine until the TypeScript mesher passes the gate. D18: the six Minecraft server plugins are built and shipped too |
| **Squirrel** | The Windows installer technology the app ships with |
| **The contracts** | Product rules every user-facing surface must follow (regex builder on every search bar, browser-style tabs, appearance editors, language modes, super-confirmation for destructive actions). Tracked as GitHub issues #6 to #13 |
| **The recurring defect** | "Built, tested, unreachable": code that works and has green tests, but no user can reach it, because nothing mounts it or wires it. It has happened repeatedly. An audit on 2026-08-03 found nine more cases, and on 2026-08-04 the finished tab system, appearance editors and language section were all mounted after being built, tested and reachable by nobody |
| **The flattening** | A change Minecraft made in version 1.13. Before it, a block was a number plus four extra bits (stone was `1`, andesite was `1:5`). After it, a block is a name (`minecraft:andesite`). Worlds from 1.12.2 and older use the old numbers. Some names also changed meaning: `minecraft:grass` used to be the grass **block** and now means a small grass **plant** |
| **`worldgen`** | `design/packages/worldgen`. Makes a fake Minecraft world from a number (a "seed"), so tests have a real world to read without downloading one. It can write the modern format or the 1.12.2 one |

### What works right now

- The app installs from a real Windows installer and opens with a working interface.
- It can browse an existing BlueMap server and show its maps in 3D.
- It can render a world locally by driving the original Java engine (per decision D17).
- **The shell is a tabbed one.** Four pages behind a persistent strip: the map, making a
  map, the maps-and-servers list, and backups. Two mounting details are load-bearing rather
  than tidy: `MapView` stays at shell level rather than in its page's slot, because only the
  active page's slot renders and putting the renderer there would dispose it on every tab
  switch; and the map page is a transparent click-through frame over a canvas that lives
  outside the Vue tree entirely.
- The interface includes: a world wizard (make a map in steps), a settings surface, an
  eight-tab options editor for BlueMap config files, GitHub sign-in, release downloads,
  a Java runtime settings row, a notification centre, a command palette, a changelog
  viewer covering every released version, per-element appearance editors with a continuous
  colour picker, the language-and-tone settings, and a custom window title bar. All of
  these are reachable by clicking, and all have tests.
- **The options editor opens on settings you can read, not on an empty screen.** It opens
  on the BlueMap config folder this computer already uses when one is really on disk, and
  otherwise on BlueMap's own default values, labelled as not yet saved. Until 2026-08-04 it
  opened on "Nothing is open yet" with no tabs at all, and people reasonably concluded the
  settings were missing. Its eight tabs are the seven config screens (Core, Maps, Storages,
  Web app, Web server, Server plugin, Run) plus **History**.
- **Every config folder has a local version history**, so a save can be undone. The history
  is a real git repository kept beside the app's own data folder — never a `.git` inside the
  user's folder. It only ever adds: restoring old files is itself recorded as a new
  revision, so an undo can be undone in turn. If the history cannot be written, the save
  still succeeds and the app says what was lost. See `docs/config-history.md`.
- **A world or a rendered map can be backed up to GitHub**, from the Backups tab. The folder
  is packed into one archive, cut into parts small enough to be release assets, and
  published as a new release, with a pointer file naming every part and its SHA-256.
  Restoring downloads the parts, checks each digest, rejoins them and verifies the whole
  file. See `docs/backup.md`.
- **The first step of the wizard finds the worlds already on this computer**, from the
  default Minecraft installation and from any number of folders the user mounts. See
  `docs/finding-worlds.md`. Typing a path, browsing and dropping a folder all still work.
- **Every destructive action is behind the two-key gate**, and a guard test inventories the
  package so a new delete cannot arrive undeclared.
- **Every search bar carries the anchored regex builder**, kept true by
  `components/config/regexPolicy.test.ts` rather than by remembering.
- CI builds an installer, renders a test world, takes screenshots of the real app, and
  publishes a GitHub release on every green push to `main`.
- **The engine can read a Minecraft 1.12.2 world and render it.** This was checked for the
  first time on 2026-08-04. `worldgen` can now write a 1.12.2 world, and a test reads back
  every single one of a million blocks in it and checks that the engine understood each
  one. It got all of them right. A rendered 1.12.2 map comes out as a real 3D map with 23
  different block textures in it, and no block falls back to the pink-and-black "missing
  texture" placeholder.

### What does not work yet

- **The TypeScript mesher matches the Java engine, and the Phase D gate passes.** On
  2026-08-04 the oracle rendered a 1000x1000 generated world with both engines and
  reported **identical**: 995 files matched, **961 of 961 hires tiles byte for byte after
  decompression**, all 24 lowres tiles pixel for pixel, all six render-state files
  agreeing on every decision, and neither side holding a file the other lacked. The
  200x200 fixture on a different seed reports the same.

  The first comparison had 49 of 57 files differing, and every cause turned out to be
  *outside* the mesher. That is the finding worth keeping:

  1. **The harness was feeding the two engines different resources.** BlueMap bundles its
     own resource pack, `resourceExtensions.zip`, and upstream loads it alongside the
     vanilla jar; the harness loaded only the jar, so the gallery was 839 textures short
     and every texture index after the first gap pointed at the wrong picture. The pack
     version was read from a file neither pack has, so it silently fell back to a number
     that selects different models.
  2. **The port had no per-tile update task.** `WorldRegionUpdateTask` is what decides a
     tile should be deleted rather than rendered, and what records the render state.
     Without it the port rendered and kept 253 tiles upstream deletes.
  3. **The comparison itself was grading the wrong things.** Render state was compared as
     raw bytes, so the first difference it ever found was a gzip header field; the gallery
     was compared as bytes, so two correct PNG encoders looked like a divergence.
  4. **A region-boundary defect only a large world could reach.** A tile at the edge of a
     region reads chunks belonging to the *next* region, and the port's synchronous
     `getChunk` answers a cache miss with an empty chunk, which reports itself as
     ungenerated - so 23 tiles were erased rather than rendered. Every tile the port did
     write was byte-identical even in that failing run. A mesher can be right about
     everything it emits and wrong about what to emit, and only a world with a second
     region asks that question.

  **What passing the gate does and does not mean.** It means the ported engine produces
  the same bytes as the engine it replaces, on these worlds, measured rather than argued.
  It does not by itself switch the product over: decision D17 says the app renders with
  upstream's Java engine until the mesher takes over, and making that switch is its own
  change with its own verification. Local rendering still uses the Java engine today.

- **A warning for anyone measuring the gate: build first.** `tools/oracle` runs the
  *compiled* engine, so a run measures the last build rather than the current source. It
  now compiles automatically, but a report older than 2026-08-03 late-evening may have been
  grading a stale build.
- **Four kinds of block from a 1.12.2 world are drawn wrongly.** Reading the world is
  right; drawing it is not, and the reason is not in the world reader. The reader gives back
  the *old* block name (`minecraft:grass` for a grass block). Nothing then turns that old
  name into the new one before the pictures are looked up. So the modern picture list is
  asked for `minecraft:grass`, and modern Minecraft uses that name for a small grass plant.
  Every grass block in the map is drawn as a see-through plant instead of a solid cube, and
  you can see the dirt through the ground. Snow blocks, snow layers and podzol are drawn as
  nothing at all. The full list, the numbers behind it, and the two possible fixes are in
  the 2026-08-04 section at the bottom of this file.
- Phases E, G, H, I are not started. Phase C has three unfinished exit checks.
- **The contract issues #6 to #13 are all closed**, each with its evidence on the issue.
  What remains inside them is named there rather than hidden: the appearance wrapper is
  proven end to end on the shell chrome and each further surface is a one-line wrap; about
  895 of the 959 i18n keys still render their English fallback, and each starts varying the
  moment a catalogue entry is added; mount reordering is not built, because the world list
  sorts by last played across every mount, which is what people scan by; and GitHub
  sign-out is the one destructive action still behind an inline two-step confirm rather
  than the two-key gate, listed in that guard's own `KNOWN_GAPS` so it is a stated fact.
- One latent bug worth fixing next: `stores/profiles.ts` writes `localStorage` unguarded
  while `load()` wraps `getItem` in try/catch, so where storage is full or unavailable the
  first profile mutation throws inside a Vue watcher.
- **The version history covers config folders only.** Profiles, application settings and the
  maps-and-servers list are not snapshotted yet, so deleting one of those still cannot be
  undone.
- **One test is slower on the CI machine than on a developer machine and fails there.**
  `packages/app/src/main/backup/archive.test.ts`, the case named "survives a file large
  enough to need more than one read chunk", passes locally and timed out after 5 seconds on
  the hosted Linux runner in CI run 30927851530. It is a timeout, not a wrong answer, but a
  test that only passes on some machines is a test nobody can trust.
- **Backup interoperability is proven against a copy of the other application's rules, not
  against that application.** The pointer files this app writes are checked with the
  patterns Desktop Material uses to read them. Nobody has yet made a backup here and
  restored it there.

### How to verify things yourself

Run these from the repository root. All should succeed today.

```bash
cd design && npx vitest run          # every unit test (4457 on 2026-08-04, about 30 seconds)
cd design && pnpm typecheck          # type-checks all 13 packages (vue-tsc for the ui one)
cd design && pnpm lint
node tools/oracle/selftest.mjs       # proves the byte-comparison gate can detect planted differences
node tools/oracle/compare.mjs --seed 7 --size 200   # the gate on a small world; identical, exit 0
node tools/oracle/compare.mjs --seed 1 --size 1000  # the gate at full scale; identical, exit 0
node tools/oracle/render-1-12.mjs    # renders a Minecraft 1.12.2 world; 14 checks, exit 0
```

The gate compiles the engine itself before rendering, so it always grades the current
source. That takes a few extra seconds and is deliberate — see the 2026-08-03 late section
at the bottom for the wrong conclusion its absence produced.

### If you are picking this up

1. Read this section, then `ROADMAP.md`, then the dated sections. **The newest dated
   sections are at the top of this file, above this summary; the older ones are below it.**
   The file grew from the bottom up until 2026-08-04 and from the top down after that, so
   the two ends are both worth a look and only the dates tell you which is which.
2. The active work is making the oracle comparison come out identical. Start from the
   report at `tools/oracle/out/gate/report.json` and fix causes in
   `design/packages/engine/src`, comparing against the Java source in
   `vendor/BlueMap/core/src/main/java/de/bluecolored/bluemap/core/`.
3. Never weaken a comparison to make it pass. If something cannot be verified, write that
   it was not verified.
4. Every change: run the tests, run the linter, commit with a message that says what
   actually changed, push, and check CI.

---

## State (2026-08-03, after decisions D17 and D18)

Read in this order: `docs/decisions.md` (D17 and D18 changed which engine renders),
`ROADMAP.md` (phase status, including the out-of-alphabet Phase J), then `../plan.md` and
its Amendment 1 at the end. The plan's original text is intact; the statements D17 and D18
falsified are marked in place rather than deleted, so anything unmarked in the plan is still
current.

Everything lives under `design/` (pnpm monorepo, 12 packages) except `plan.md`, the
top-level repository metadata, `scripts/`, `tools/` and the `vendor/BlueMap` reference
submodule. Reference sources: `vendor/BlueMap` @ `e664c1a` + nested `api/` submodule +
fetched tag `v0.10.3-mc1.12` (legacy 1.12 reference; re-extract single files with
`git show v0.10.3-mc1.12:<path>`).

### The one thing that changed everything

Local rendering runs **upstream BlueMap's Java engine**, built from the vendored source and
driven by the app. The TypeScript mesher in `packages/engine` keeps being written and takes
over when it passes the Phase D gate: decompressed PRBM bytes identical to Java's, lowres
PNGs identical pixel for pixel, on every fixture. Nothing switches silently; every render
writes `render.json` naming the engine that produced it.

`vendor/BlueMap` is therefore a **build input** now, not only a reading reference.

## What is proven

### The Java render path, by hand, on one Windows machine

| Step | Result |
|---|---|
| `./gradlew :cli:shadowJar` | `implementations/cli/build/libs/cli-5.22-27-shadow.jar`, 6.4 MB, 34s warm |
| Gradle project paths | bare: `:cli`, `:fabric`, `:forge`, `:neoforge`, `:paper`, `:spigot`, `:sponge`. **Not** `:implementations:cli` |
| Toolchain | host Temurin 25.0.3; upstream pins `JavaLanguageVersion.of(25)` |
| Gradle home | `GRADLE_USER_HOME` points at `tools/oracle/.gradle`, gitignored, already over a gigabyte. Nothing machine-wide is touched |
| `java -jar <jar> -c <configDir>` | writes `core.conf`, `webapp.conf`, `webserver.conf`, `maps/{overworld,nether,end}.conf`, `storages/{file,sql}.conf` |
| `java -jar <jar> -c <configDir> -r -g` | a generated 1000x1000 world rendered to **961 hires PRBM tiles** plus lowres PNGs and `textures.json.gz`, in 80 seconds |
| Progress format | `[11:28:40 INFO] updating map 'overworld': 25.663% (ETA: 47 seconds)`, ending `Your maps are now all up-to-date!` |

**Two sharp edges, both found the expensive way.** The CLI resolves its storage root and
data folder relative to the **working directory**, not the config folder: running it from
the repository root dumped 47 MB of tiles into `/web` and a 38 MB Mojang client jar into
`/data` at the top of the tree. Always pass absolute paths and set the working directory
deliberately; `render/config.ts` and `render/workspace.ts` both do, independently. And
rendering requires `accept-download: true` in `core.conf`, which is Mojang EULA acceptance,
which is why consent is a persisted first-class decision rather than a config default.

### The test suite

`npx vitest run` from `design/`, run 2026-08-03: **143 files, 2157 passed, 2 skipped**.

| Package | Tests | Package | Tests |
|---|---|---|---|
| `engine` | 882 (1 skipped) | `app` | 286 |
| `ui` | 311 | `shared` | 187 |
| `config` | 175 (1 skipped) | `site` | 107 |
| `render-actions` | 79 | `nbt` | 56 |
| `viewer` | 52 | `worldgen` | 19 |
| `server` | 5 | `cli` | none yet |

Green means the ported code does what its own tests say. It is not parity with upstream;
that is what the phase exit criteria in `ROADMAP.md` are for.

### Earlier phases, unchanged by D17

- **Phase 0** — scaffold, CI (`.github/workflows/ci.yml`), LICENSE/NOTICE, porting
  conventions (`docs/porting-conventions.md`), deviations log (`docs/deviations.md`).
- **Phase A** — `viewer`: all 65 upstream webapp JS files in strict TS (DOMPurify'd markers,
  CSP-safe popups, gated remote injection, `dataRoot` + `dispose()` port additions).
  `server`: token-gated localhost HTTP server + static handler + remote reverse proxy,
  live-verified against `https://bluecolored.de/bluemap`. `ui`: Vuetify MD3 shell, profile
  manager, 30 upstream locales. `app`: hardened Electron (sandbox/CSP/nav-lock), embedded
  server, typed preload bridge.
- **Phase B** — `shared` and `nbt` complete; `engine` compression registry
  (none/gzip/deflate/zstd/lz4-java block framing), full world model, MCA layer with decoders
  `Chunk_1_12/1_13/1_15/1_16/1_18` by DataVersion, legacy `BlockIdMapper` + 15 neighbour
  extensions from `v0.10.3-mc1.12`, MCAWorld/ChunkGrid/chokidar watch.
  **`packages/engine/test/world-e2e.test.ts` is the proof**: it builds synthetic 1.18 and
  1.12.2 worlds byte by byte and asserts exact decoding, including legacy fence-connection
  reconstruction.
- **Phase C** — every file in upstream's `resources` package ported and unit tested. The
  three exit criteria have **not** run, so "ported" is the honest word and "done" is not.
  The list is in `ROADMAP.md`.

## What is built but not proven

Say this plainly to whoever asks; none of it has a green check yet.

- **The Java render path has only ever been driven by hand, on Windows.** Not in CI, not on
  macOS, not on Linux. The 961-tile render came from invoking the jar directly, not from the
  app's orchestrator. Reproducing it end to end through `startRender` and opening the result
  in the viewer is the obvious next piece of evidence, and it does not exist yet.
- **JDK provisioning is unit tested against fakes only.** No real Temurin archive has been
  resolved, downloaded, verified and extracted by this code on a machine with no JDK.
- **Only `:cli:shadowJar` has been built by hand.** A reusable CI workflow that builds all
  seven and attaches them to the release is on the branch
  (`.github/workflows/build-jars.yml`, called from `ci.yml`), but this entry cannot vouch
  for a green run of it, and no adapter jar has been loaded by a real Minecraft server.
- **Phase C's three exit criteria.** `textures.json` semantic equality against Java's, a
  1.12.2 jar through the legacy compat path, and the live `minecraft:grass_block`
  resolution.
- **The mesher's parity gate.** Phase D is in flight; nothing about it is verified.

## In flight

Concurrent workflows are writing in these areas. Do not edit another workflow's files;
report the markup or the seam you need and let the orchestrator apply it.

| Area | Files | State |
|---|---|---|
| Phase D mesher | `packages/engine/src/map/hires/{block,entity}/`, `TileModelView.ts`, `map/mask/`, `map/TextureGallery.ts` | Being written. Expect these to move under you |
| Viewer UI | `packages/ui/src/components/{controlbar,controls,menu,markers}/`, `ui/src/App.vue`, `components/MapView.vue`, `styles/global.scss` | Owned by a separate workflow |
| Options GUI | `packages/ui/src/components/config/`, backed by `packages/config` | Landed and tested; Phase F continues |
| First-run and consent surfaces | `packages/ui/src/components/setup/` | Landed and tested |
| Java toolchain + render path | `packages/app/src/main/java/`, `packages/app/src/main/render/`, `consent.ts` | Landed and tested |
| Documentation site | `packages/site/` | Landed; articles updated per surface |

## Wave discipline (this is process, and it is load-bearing)

- **Session limits kill big fan-outs.** An eight-agent workflow died mid-run. The pattern
  that works is **waves of three or four agents, commit and push after every wave**, and a
  WIP commit to salvage partial files if a wave dies.
- **Install dependencies before launching a wave**, from the orchestrator, never from the
  agents. Concurrent `pnpm install` races the lockfile.
- **Give every agent a written ownership list, and name what it must not touch.** Two agents
  editing one file is how a wave's output is lost.
- **Agents do not commit, push or check out.** They create and edit files and report the
  verification output they actually ran. The orchestrator commits.
- **Every agent verifies its own package before reporting**, and pastes the output:

  ```sh
  cd design && npx tsc -p packages/<pkg>/tsconfig.json --noEmit
  cd design && npx eslint packages/<pkg>
  cd design && npx vitest run packages/<pkg>
  ```

- **Deviations discipline**: every intentional difference from upstream goes in
  `docs/deviations.md`.

## Scope beyond the port (user-confirmed, do not drop)

Full options GUI (every BlueMap setting, no config files) · Docker hosting GUI (dockerode) ·
standalone server CLI + Dockerfile · MC 1.12.2 to 26.x · local live players (playerdata NBT +
RCON/Query) · desktop QoL (measurement, waypoints, screenshot gallery, scheduled renders,
multi-server dashboard, update checker) · nothing deferred (JS addon system, marker editor,
static export, three.js upgrade all in scope) · the five global product contracts in
`docs/contracts/` (regex builder on every search bar, full browser-style tabs, per-element
appearance editors + infinite colour picker, EN/HK-Cantonese/bilingual + funny-level,
super-confirmation for destructive actions) · copy rules (no em-dashes in UI strings, local
fonts, no AI-tell styling).

Since D18, add: the six Minecraft-server platform adapters and the Java addon loader ship as
release artifacts. Plan exclusions S2 and S4 are withdrawn; S1 and S3 stand.

## Verify from clean

```sh
cd design && pnpm install && pnpm build && pnpm lint && pnpm test
npx vitest run packages/engine/test/world-e2e.test.ts   # the Phase B acceptance proof
npx vitest run packages/worldgen                        # generates a world and reads it back
npx vitest run packages/app/src/main/consent.test.ts    # the consent record's failure modes
```

Building the Java engine, which is what local rendering needs:

```sh
cd vendor/BlueMap
GRADLE_USER_HOME=../../tools/oracle/.gradle ./gradlew :cli:shadowJar
# -> implementations/cli/build/libs/cli-<version>-shadow.jar
```

Rendering with it by hand, which is how the 961-tile figure above was obtained. Note the
working directory: it is the sharp edge described earlier, not a stylistic preference.

```sh
cd <an empty scratch directory>
java -jar <absolute path to cli-shadow.jar> -c <absolute config dir>   # writes the config set
# set accept-download: true in core.conf, and absolute paths everywhere
java -jar <absolute path to cli-shadow.jar> -c <absolute config dir> -r -g
```

---

## Update, later on 2026-08-03

Everything above still holds. What follows is what changed after it was written.

### The packaged app never launched, and nothing said so

The installer shipped **without the renderer**. `electron-builder` packaged only the app
package's own `dist/` and `package.json`; the UI is a separate workspace package, so `files`
could not reach it and the bundle was never in the installer. `resolveUiRoot` checked both
candidates, found no `index.html`, and threw.

That throw happened inside `createWindow`, invoked as `void createWindow()`. The rejection
went nowhere: no log, no dialog, exit code 0. A process with no window, indistinguishable
from the app failing to start.

Fixed by shipping the bundle through `extraResources` into `resources/ui`, which is exactly
where the second candidate already looked, and by giving startup failures an error dialog and
a non-zero exit. **Verified by installing the real Squirrel installer**, not by reasoning: it
lands in `%LOCALAPPDATA%\MaterialBlueMap` and opens a window titled
`BlueMap - Overworld (Default Settings)`. The capture is `docs/screenshots/installed-app-1920x1200.png`.

**Every release from `build.22` to `build.63` predates that fix and installs a non-launching
app.** Do not treat any of them as a working artifact.

The lesson worth keeping: the app was fine from source the whole time, which is why nothing
caught it. Tests, the screenshot harness and every manual launch all used the dev tree, where
the UI resolves through a relative path. Only the installer was broken, and only the installer
is what a user runs.

### The interface is now a real port rather than a shell

All 24 upstream webapp components are ported to Material Design 3: compass, position input,
controls switch, day/night, zoom buttons, mobile free-flight, the maps menu, the settings
menu and the whole marker tree. `packages/ui` went from 3 components and 682 lines to 55 files
and 8,111. Upstream's i18n keys are kept, so the 30 bundled locales work.

The map used to be painted over the app bar and drawer, so every control was in the DOM and
none was visible. Fixed in the same pass.

### Rendering somebody else's world is no longer how screenshots are taken

CI generates a 1000x1000 world with a different seed each push, renders it with the Java
engine built in the same run, and serves that to the harness. The harness fails the job if the
app reaches the public internet during capture. Closes the issue about leaning on
`bluecolored.de`, whose bandwidth every push was consuming.

### Rendering in GitHub Actions, including worlds too big for one job

`.github/workflows/render-world.yml` plus `packages/render-actions`. Two traps were found by
measuring rather than reasoning, and both would have shipped silently wrong maps:

- **Shard cuts must land on block 32k+2, not on region boundaries**, because the hires grid is
  `Grid(32, 2)`. Cutting at 512 lands inside tile 15; a two-shard render produced 31 tiles
  twice, in differing versions, with nothing to indicate it.
- **Shards erase each other.** `unrender` does not skip out-of-mask tiles; it deletes them and
  writes transparent black at height zero with the same alpha as real terrain. 509,409 lod-1
  pixels in a two-shard render were terrain in one shard and erasure in the other, so
  first-writer-wins would have kept the erasures. The merge ranks terrain above erasure above
  untouched, and lod 2 upward are rebuilt rather than unioned.

Proven: 961 of 961 hires tiles byte-identical to an unsharded reference, zero differences
across 6,024,024 lowres pixels, for two-shard and four-shard splits.

### Two tests that only passed on the author's machine

Both cost a red build and both are the same shape.

- The HOCON locale baseline encoded the line endings of the machine that recorded it. The repo
  checks out `text=auto`, so `.conf` files are CRLF on Windows and LF on Linux, and the parser
  preserves line endings inside multi-line strings, correctly. 27 of 30 locales failed in CI.
- `jars.test.ts` built its fixture root with `join("C:", "repo")`, which looks absolute and is
  not on POSIX, so `resolve()` prefixed the runner's working directory and the upward walk
  never found its anchor.

CI running on a platform nobody develops on is the only reason either surfaced. When adding a
test that touches paths or file contents, assume it will run somewhere else.

### Dependencies install themselves

`node scripts/bootstrap.mjs` installs and **verifies** node dependencies, the Electron binary,
a JDK matching upstream's toolchain, Gradle, the seven BlueMap jars and the Playwright
browsers. It verifies rather than checks for presence, which is not pedantry: Electron here
had a `dist/` holding only `locales/`, and its own installer kept exiting 0 because the folder
existed. The archive was fine and verified against Electron's published checksum; the
*extractor* was silently dying partway through, so bootstrap extracts it another way.

### In flight at the time of writing

- **Phase D**, four agents: the tile model and byte-exact PRBM writer, the block renderers,
  entity plus lowres plus renderstate plus masks, and `BmMap` plus file storage plus the
  oracle harness. The gate is unchanged and now has a real oracle, because D17 made upstream's
  engine a build input: `tools/oracle/` renders the same generated world both ways and
  compares tiles byte for byte.
- **Split release archives**: a GitHub release asset is capped at 2 GB, so large worlds and
  rendered maps ship as 1.7 GB parts with per-part and whole-file SHA-256, and the GUI
  downloads and rejoins them with resume.

### Still not done

The two agents killed by session limits in the mega wave left the planning-document refresh
(landed later) and the test-world CI job (landed later). What genuinely remains: Phases E
through I, the Phase C exit criteria, and the Phase J items listed above as unproven. See
`ROADMAP.md`, which is the source of truth for status.

---

## Update, end of 2026-08-03

### The options GUI was built and unreachable

`App.vue` mounted neither the config screens nor the first-run setup. `ConfigScreen`,
`MapsScreen`, `StoragesScreen`, `RunScreen` and `FirstRunSetup` all existed, all had tests, and
nothing routed to them. A fresh install showed a centred grey line reading "No map loaded." and
one floating button, with no way to create a map, render one, or reach any setting.

The backend was complete the whole time: `startRender`, live progress, cancel, resume, storage
directory, downloads, sign-in. None of it was wired to a button.

This is the same failure as the installer that shipped without its renderer, and worth stating
as a pattern rather than an incident: **green tests over something no user can reach**. Both
passed everything and neither worked. A test suite proves a unit behaves; it does not prove the
product has a door.

### Three silent failures, all found by using the app rather than testing it

- **The installer did nothing.** electron-builder took its version from `package.json`, which
  never changed, so every release produced `app-0.1.0` and Squirrel correctly declined to install
  a version already present. No error. Each build is now stamped `0.1.<run number>`.
- **Copying from the map did nothing.** The viewer uses `navigator.clipboard`, and the permission
  handler allowed only pointer lock and fullscreen. Inconsistent as well as broken: the app
  already grants clipboard writes through IPC, so only the web API was shut.
- **A fresh install contacted a third party.** The public BlueMap demo was the *active* profile,
  so every launch of every copy fetched from a machine somebody else pays for before being asked.
  The offline guard in the capture harness caught it. It is still listed, one click away, no
  longer opened for you.

### The viewer still looked like upstream from the inside

`packages/ui/src/styles/markers.scss` is 179 lines with zero uses of `--md-sys-color-*`. The
chrome around the map was ported to Material Design; the POI labels, popups and player name tags
rendered inside it were not. Being rebuilt, keeping every `bm-*` class name exactly, because the
viewer's TypeScript queries that DOM and a tidier name would break markers silently.

### Delivery infrastructure the plan never described

Sign-in (OAuth device flow), private-world rendering on public runners, rendering in GitHub
Actions with sequential waves past the 256-job matrix cap, resumable renders, 1.7 GB split
release archives with in-app download and rejoin, and a test-world generator. See `ROADMAP.md`.

### Where Phase D actually stands

The mesher is ported and PRBM output is byte-identical to the Java writer **at the unit level**,
proven by building models with both out of the same jar. That is not the gate. The gate is a
fully rendered world compared end to end, and `tools/oracle/` exists to run it. Until it runs
green, Phase D is ported and not done, and no test here is named after a comparison it did not
make.

Four numeric findings from that work are worth keeping, because each was a byte:

- `Math.toRadians` is not `angdeg / 180.0 * PI`. JDK 9 made it a single multiply, and the two
  differ by an ulp at ordinary model rotations.
- Float intermediates round per operator. Accumulating in double and narrowing once is a
  different number.
- A cast to int saturates where a bitwise or wraps: a degenerate face writes `0xFF`, not `0x00`.
- `MatrixM3f` and `MatrixM4f` used `Math.sin`/`Math.cos` and double arithmetic where upstream
  uses flow-math's quantized table in float. `rotateYXZ` bakes every rotated model, so this was
  wrong for every rotated block; 30 of 52 liquid uv values differed.

### Tests that only pass where they were written

Three red builds came from this shape: a locale baseline that captured one machine's line
endings, a repository root built with `join("C:", "repo")` which is not absolute on POSIX, and
JDK discovery fixtures built with the native `join` while passing `"win32"`. The last one was a
real implementation bug as well: functions that take a `platform` argument were using node's
native `join` and `delimiter`, so a Windows PATH split through its drive letters.

CI running on a platform nobody develops on is the only reason any of them surfaced.

---

## Update, later still on 2026-08-03 — the shell, and three things that were dead

### Scope: this product is Windows only

Stated by the user. There is no macOS or Linux desktop target: Squirrel.Windows is the
installer and the only packaged artifact. CI already reflected this — the installer job is the
sole `windows-latest` runner and everything else is `ubuntu-latest` — so nothing had to be
removed.

**Cross-platform correctness still matters, for a different reason.** Lint, build and test run
on `ubuntu-latest`, so pure modules must behave on Linux even though the product never ships
there. That is what caught the `platform`-argument path bug recorded above, and it is worth not
"simplifying" away on the grounds that the app is Windows-only.

### The door was still missing

The previous entry named the pattern — *green tests over something no user can reach* — and
then the fix for it did not land: the wizard was written, tested at 87 tests, and `App.vue` was
never touched. A workflow reported success with one of its two agents having returned nothing.
**A partially-failed fan-out reads exactly like a completed one unless the output is checked
against the file system**, which is now the second time that has cost a session.

`App.vue` now mounts, in this order: the Material title bar, the map view, the viewer chrome
*only when there is a map*, the world wizard when there is not, first-run setup, and the
settings surface. What was one grey line reading "No map loaded." is the screen that makes a
map.

### Locally rendered maps are profiles

Rather than a second code path, a finished render becomes an entry in the same list a remote
server uses: `ServerProfile` grew an optional `dataRoot`, which `LocalMapHandler` already serves
at `/local/{renderId}`. The viewer needs no idea which kind it is looking at, and switching,
persistence and the map list are reused rather than reimplemented.

Two details that are load-bearing rather than cosmetic:

- **Local profiles are excluded from `syncProfiles`.** That call registers a *remote proxy*
  target; registering a local map would hand it an empty base URL to forward to.
- **The list shows which kind each entry is.** A local map has no URL, so it would have rendered
  a blank subtitle — and two entries whose only visible difference is that one has an empty
  second row read as one of them being broken.

### The preload was the missing half of three finished features

Each of these had a complete main-process implementation and no way for the renderer to reach
it. This is the same shape as the unreachable options GUI, one layer lower down:

| Feature | Main process | Preload | Consequence |
|---|---|---|---|
| Window buttons | four `window:*` handlers + a `maximizedChanged` push | *nothing* | frameless window with no minimise or close — <kbd>Alt</kbd>+<kbd>F4</kbd> was the only exit |
| World folder check | — | *nothing* | wizard could not tell a world from any other folder |
| The map's 92 settings | `mapConf()` wrote 6 keys | no field to carry the rest | 86 settings collected by the wizard and silently discarded |

The third is the worst of the three, because the interface *said* it had applied them. The
request type now carries the whole `maps/<id>.conf` body as text, and the main process overrides
only the structural keys (`world`, `dimension`, `storage`) — a render whose storage points
somewhere the app does not serve produces tiles nobody can see.

### `Render world` was undispatchable, and had been all along

The workflow never appeared in the Actions list and `gh workflow run` reported it as not found.
Its only symptom was a zero-second "workflow file issue" failure hung on unrelated pushes. The
whole Actions rendering path — sequential waves, resumable shards, tree merges, everything in
`docs/render-in-actions.md` — was unreachable, and had never worked once.

**The cause was a single expression:** `${{ fromJSON(needs.plan.outputs.group-count) - 1 }}`.
GitHub's expression language has **no arithmetic operators** — only comparison and logic — so
`- 1` is a parse error, and a parse error anywhere in the file stops the *whole workflow* from
being registered. The value now crosses into the step as an env var and bash does the
subtraction.

> **I got this wrong first, and the wrong answer was plausible.** I saw the file had twelve
> `workflow_dispatch` inputs against a documented cap of ten, concluded that was the cause,
> merged the three location fields into one, committed it, pushed — and the run failed in zero
> seconds exactly as before. The input count was over the documented limit and reducing it was
> defensible, but it was **not** what broke the file, and I had asserted that it was.
>
> What found the real cause was `actionlint`, in one line, immediately. `yaml.safe_load()` had
> said the file was fine, because it *was* fine as YAML — the error was one level up, in the
> expression language embedded inside a string. **A YAML file that parses is not a workflow that
> registers**, and neither is one that a careful reading makes sense of.

`actionlint` now runs in CI over every workflow, because this class of error is invisible
locally and its only production symptom is a feature that quietly does not exist.

The `world` field consolidation is kept: for `release-asset` it accepts `tag/glob`, split on the
**last** slash, because a release asset's file name cannot contain one and a tag like
`release/1.4` can.

### `registerIpc()` could crash the app on reopen

`ipcMain.handle` throws on a channel that already has a handler, and `registerIpc()` is called
from `createWindow()`, which the `activate` path calls again when no windows are left. The three
stateful subsystems each guard against this; this function did not. Unreachable on Windows, and
fixed anyway — a function whose safety depends on a platform detail held nowhere near it is a
trap for whoever reads it next.

Found by a subagent reporting it as out-of-scope rather than fixing it silently, which is the
behaviour worth keeping.

### The viewer's own surfaces, and the landing page

`markers.scss` went from 179 lines with zero `--md-sys-color-*` uses to ~470 with no literal
colour but M3's own shadow token. POI labels, popups and player name tags are now opaque MD3
cards; the copy-to-clipboard groups became real `<button>`s with screen-reader text, reachable
by keyboard, and popups no longer dismiss on <kbd>Tab</kbd>. Verified against the **built**
artifact in headless Chromium across 36 viewport/theme/motion combinations: zero page errors,
worst-case text contrast 8.06:1.

The landing page had **no stylesheet at all** — every `mb-*` class landed on an unstyled
element, which is most of why it read as a stub. It now has one, plus honesty guards in the
content tests: no feature card may claim more than the article behind it, and exactly one engine
may be marked as running.

### The settings surface, and an honest empty state that is about to become real

`AppSettings` is mounted and carries the four anchors a failed render points at. Three notes on
what is real in it and what is not, because the distinction is the point:

- **Mojang consent** mounts the *existing* `ConsentSettingsRow` rather than a copy of it.
- **The storage folder** validates and writes, asking the bridge *before* the local store so a
  refusal leaves neither side changed.
- **The Java runtime** says plainly that this build cannot read it. `discoverJava()` exists and
  is tested; there was simply no IPC handler and no preload method. The honest empty state was
  the right answer over a fabricated version number — and `settingsBridge.ts` already mirrors the
  exact shape (`javaRuntime(): Promise<JavaDiscovery>`, feature-detected, rendering written and
  tested), so closing it is one handler plus one preload line. That wire has since landed;
  see "Landed since the sections above were written" at the end of this document.
- **The world folder** is per-map, not global. The section says so instead of rendering a control
  that would change nothing.

### 69 messages were rendering with the value missing

Found while building the settings surface, and it is worth stating carefully because **every
test passed the whole time**.

This codebase's fallback idiom is `t("some.key", "Rendered on: {engine}.")`, used because the
locale files are upstream's and a shell-only key often has no entry. Interpolation was then done
with `.replace("{engine}", value)`. That does not work:

```
broken idiom -> "The most recent render ran on: ."      // the value is gone
named-args   -> "The most recent render ran on: BlueMap 5.22."
```

vue-i18n compiles the **default message** as a message format too, so it consumes `{engine}`
before `.replace` ever runs. The correct call is the three-argument form,
`t(key, { engine: value }, fallback)`.

**69 call sites across 22 files** — 12 files in `components/config`, 7 in `components/world`,
3 in `components/menu`. These are validation errors, render failure reasons, chunk counts,
durations and file paths: the messages where a missing value turns *"Storage 'sql' is already
defined"* into *"Storage '' is already defined"*, and a render failure into one that names
nothing.

Nothing caught it because **nothing ever asserted the rendered text of a fallback message**. A
suite that mounts no component and reads no rendered string cannot see this class of bug at all;
this repository had 187 test files and not one of them mounted a component until now. A guard
landed with the fix and was proven to fail against a deliberate reintroduction of the
broken idiom before the tree was restored byte-identically; the proof is recorded in the
closing section of this document.

### Still not done

- **Phase D's gate.** Unchanged: unit-level PRBM byte-identity is not a rendered world compared
  end to end. `tools/oracle/` exists to run it and has not been run green.
- **Phase C exit criteria**, and Phases E, G, H, I.
- **The remaining product contracts** — issues #6 through #13: the regex builder wired to every
  search bar, tabs, per-element appearance editors, the super-confirmation gate, language modes
  and funny-level sliders, the command palette, the changelog viewer, the notification centre.
- **A day/night toggle logo and settings logos**, asked for and never started.
- **No screenshot of the running window.** Issue #5 stays open for exactly this: the title bar
  has lint, types, 13 unit tests and a clean build behind it, and no capture of the real
  artifact. Claiming a visible fix without showing it is the gap this repository keeps finding.

### Landed since the sections above were written

The workflow described above as in flight completed, and its result is in the tree:

- **All 69 broken fallback call sites are fixed** across 22 files in `packages/ui` (12 in
  `components/config`, 7 in `components/world`, 3 in `components/menu`). The broken idiom
  `t(key, "fallback with {arg}").replace("{arg}", v)` is replaced everywhere by the
  three-argument form `t(key, { arg: v }, "fallback with {arg}")`. Adversarial verification
  checked every site: no message changed wording, key, or meaning, and a whole-tree sweep
  found zero residual sites outside the guard's own deliberate fixtures.
- **The Java runtime wire is closed end to end.** `packages/app/src/main/java/ipc.ts` (with
  `ipc.test.ts`) registers `java:runtime` in `main/index.ts`, the preload exposes it, and
  `settingsBridge.ts` and `JavaRuntimeRow.vue` consume it. The settings row now shows the
  measured runtime instead of the honest empty state.
- **The regression guard exists and was proven the hard way.** `i18nFallback.test.ts`,
  `configMessages.test.ts` and `RenderRunPanel.test.ts` mount components and assert the
  rendered text of fallback messages — the assertion class this repository previously had
  none of. Reintroducing the broken idiom at one covered site (`StoragesScreen.vue`) made
  three guard tests fail, each naming that exact site; the file was then restored
  byte-identically (hash-checked) and the guard went green again.
- **Adversarial review then made the wire honest about paths.** Three real defects were
  found and fixed before this ever shipped: the reason sanitizer stopped each match at
  whitespace, so `C:\Program Files\…` leaked everything after the first space — including
  half a username from a profile path; the drive pattern matched the `s://` inside
  `https://`, mangling URLs that named no local path; and the 240-unit truncation could cut
  a surrogate pair in half and render mojibake. The sanitizer now anchors path starts,
  sweeps leftover backslash fragments, collapses repeated placeholders, and truncates on
  code points — each behaviour pinned by its own test. On the UI side, Electron's
  `Error invoking remote method 'java:runtime':` plumbing is stripped before a failure
  renders, and discovery no longer queues behind the unrelated render-list read: the row
  says `loading` from the first synchronous moment, so the button's guard actually guards.

The suite at this commit: **198 files, 2968 passed, 2 skipped**, from `npx vitest run` in
`design/`. The per-package table in `ROADMAP.md` is updated to match.

---

## Update, 2026-08-03, night — the audit, and the doors it found missing

A 12-agent reachability audit (mount graph from `App.vue`, three-way IPC parity over all 35
invoke channels, asset wiring) confirmed the recurring pattern at three layers at once:
**9 of 72 components were orphans** (the whole `ConfigScreen` subtree, `ConfigNotifications`,
`MenuChoice`), the **GitHub sign-in and release-download features were complete in main and
preload with zero renderer lines**, the `window.materialBluemap.config` bridge the options
GUI probes for **had never existed at all**, and the typefaces every stylesheet names —
Roboto and Roboto Mono — were bundled nowhere, so the whole chrome rendered in Arial.

Landed since, each verified and pushed separately:

- **Roboto ships** (32 woff2 subsets via @fontsource, `@font-face` verified in dist,
  Apache-2.0 in NOTICE). Roboto Mono is queued with the next wave.
- **The `config:*` bridge exists end to end**: `main/config/ipc.ts` (seven channels,
  75 tests, path-traversal/device-name/symlink refusals checked name-by-name before any
  write, all-or-nothing batches), preload namespace with `pathSeparator`, `bridge.d.ts`
  declaration. `testSqlConnection` is an honest feature-detected refusal: this build
  carries no SQL client and says so; it never fakes `ok: true`.
- **ConfigScreen has a door**: a third shell FAB opens it full-bleed over the shell, Escape
  closes and returns focus, the wizard stays mounted behind it (`inert`), viewer chrome
  yields while it is up. Its `consent` emit reuses the existing settings anchor; `saved`
  raises a shell notice.
- **Notices are shell-owned**: `stores/notices.ts` singleton, one `ConfigNotifications`
  corner mounted at `v-app` level, ConfigScreen injects the shared state rather than
  carrying a second corner.
- **MenuChoice is real**: MarkerMenu's hand-rolled sort row became the shared control, and
  MenuChoice itself gained `role="group"` + per-button `aria-pressed` (Vuetify marks
  selection with a class only, which a screen reader cannot hear).
- **The dead render wires are closed**: `firstRunFlow` now calls `mapStorageDirectory()`
  (the method that exists) and prefills with `current`; every ended render names the engine
  that produced it, preferring `render.json` as evidence over the event stream's
  expectation; `activeRenders()` is wrapped and in-flight renders are surfaced beside the
  interrupted ones without conflating the two.

CI note for whoever reads a red X: the first run that ever reached the rewritten publish
job died on `installer-out/Squirrel.exe`, a file electron-builder has never emitted, and
the workflow lint died on its own step's comment — `# shellcheck is present…` parses as a
malformed shellcheck *directive*. Both fixed; `.nupkg` + `RELEASES` stay hard requirements
and the comment no longer opens with the magic word.

### The second wave: the two renderer-less features, and what the captures showed

- **GitHub sign-in has a surface** (`components/github/`, a fifth settings section):
  device-flow panel driven entirely by `onGitHubAuthEvent` (code shown large with a
  spelled-out `aria-label`, countdown from events with no local clock, every terminal
  state distinct), a personal-access-token path whose token goes from the field to the
  bridge and is held nowhere, sign-out that says both what is deleted and what revocation
  was attempted, and an honest no-bridge state with no controls at all. 47 tests.
- **Release downloads have a surface** (`components/downloads/`, entered from the world
  wizard's folder step): discovery of an asset's split parts, live rows from
  `onDownloadEvent` with real byte counts, reconciliation with `activeDownloads()` on
  open so a download started elsewhere is not invisible, cancel, and the honest
  unsupported state. `githubCheckRepository` stays deliberately unused here — it belongs
  to the private-render path when that is wired.
- **The version reaches the Info page** (feature-detected, Electron plumbing stripped),
  and **Roboto Mono ships** (400 + 500, the two weights the surfaces actually inherit).
  The NOTICE entries for both faces were corrected to **OFL-1.1** — Roboto was relicensed,
  and the earlier Apache-2.0 line described a version this repository does not bundle.
- **The green run's own captures caught a real overlap**: the viewer's floating control
  bar anchored at `top: 0` sat on the custom title bar — the menu button covered the logo
  and title, and the top-right cluster covered minimize/maximize/close. It now reads
  `--mb-titlebar-height`, the same property `#map-container` already consumes.

Merged-tree verification for the wave: **app + ui 1245 tests green**, `vue-tsc`, `tsc`
and `eslint` clean, both bundles built (12 Roboto Mono woff2 subsets in dist).

---

## Update, 2026-08-03, late — the gate was grading a stale build

The headline is a process defect, not a code one, and it invalidates two previously
recorded gate measurements.

**`tools/oracle/render-ts.mjs` imports the engine's built `dist/`**, because it runs as its
own node process and node does not read TypeScript. Nothing built it first. So a gate run
measured whatever was last compiled rather than what was in `src/` — and those differ for
exactly as long as somebody is editing the mesher, which is the whole time the harness is
useful.

This had already produced a wrong conclusion. The working tree carried two real fixes (the
textures-file number spelling, and the missing-chunk preload). A run after them returned a
report byte-identical to the one from before them: same first-differing offset (55), same
file sizes, same 48-of-57. The natural reading is "the fixes did nothing". The fixes were
fine; `dist/` was three hours old.

`lib/tsEngine.mjs` now compiles the engine before every render, and a compile failure is
thrown rather than reported as `unavailable` — "the engine cannot render yet" is an honest
statement about Phase D's progress, and source that does not compile is a different thing
that must not hide behind it. (`lib/util.mjs`'s `run` gained an opt-in `shell`, because
`pnpm` on Windows is a `.cmd` shim that `CreateProcess` will not execute directly.)

### What the gate actually says now, measured against a fresh build

| | before | after |
|---|---|---|
| `textures.json.gz` first differing byte | 55 | **499** |
| hires `tiles/0/x0/z0.prbm.gz` (ts bytes) | 193 116 | **232 740** |
| compared / differing | 57 / 48 | 57 / 49 |

The differing count went *up* by one because a lowres tile that previously matched by
accident now does not; the two headline numbers are real movement.

### textures.json: the writer is now gson-exact, and what remains is a png encoder

Two spelling divergences were closed, both in `map/TextureGallery.ts`, both pinned by new
tests (`javaDoubleToString`, `writeGsonString`; 36 tests in that file now):

- **numbers** — java writes a `double` as `1.0`/`0.0` and switches to `4.985044943168759E-4`
  outside `10^-3 <= |d| < 10^7`. Of the reference document's 8368 numeric tokens, 713 were
  spelled differently and **none** differed in the digits, so the port borrows javascript's
  shortest-round-trip digits and rebuilds only java's shell around them.
- **strings** — gson's default `htmlSafe` escapes `<`, `>`, `&`, `=` and `'`. The `=` is
  the one that mattered: every texture is a base64 data-url, and the reference document
  spells that padding `\u003d` 2074 times.

The divergence that remains at offset 499 was decoded from the base64 and is **not a
texture-data problem at all**. Both sides carry the same 16x16 image; their `IHDR` chunks
differ:

```
java (ImageIO)  : bitDepth 4, colourType 3   (palette)
port (pngjs)    : bitDepth 8, colourType 6   (truecolour + alpha)
```

Upstream's `Texture.from` encodes with `ImageIO.write(image, "png", os)`
(`resourcepack/texture/Texture.java:151`); the port uses `PNG.sync.write(image)`. Both
decode to identical pixels and `getTextureImage()` reads either back correctly, so nothing
in the renderer can tell them apart — but the gate compares bytes. Closing it means
reproducing `ImageIO`'s encoder (palette-vs-truecolour decision, filter choice, zlib
settings). Recorded in `docs/deviations.md`; it is its own piece of work, not a tweak.

The element-count gap is unrelated and still open: java 2092 entries, port 1253.

### The 253 extra tiles and the six missing `rstate/` files have one shared cause

Diagnosed and adversarially verified: **`WorldRegionUpdateTask` is not ported.**

- The tile-path codec is correct. `FileGridStorage.getItemPath` matches upstream exactly;
  the odd-looking `tiles/0/x1/0/z1.prbm.gz` is upstream's own digit-folder encoding.
- The port renders every tile in the region's bounds — 17x17 = **289**. Java renders the
  **36** fully backed by generated chunks. 289 − 36 = **253**, the exact `onlyInPorted`
  count. Upstream's gate is `checkTileRenderPreconditions`
  (`common/.../rendermanager/WorldRegionUpdateTask.java:341-384`), whose non-null return
  means `unrenderTile`, never `renderTile`.
- The `rstate/` files are empty for the same reason. The renderstate layer *is* ported and
  correctly wired into `BmMap` (constructed at `BmMap.ts:154-156`, saved at `:322-324`,
  paths and `SHIFT` values byte-matching upstream). But `CellStorage.saveCell` early-returns
  on an unmodified cell, and the only production callers of `set(...)` live in that same
  unported task (`:226-229`, `:239-244`, `:249-253`).

Everything the port needs already exists: `TileState`, `TileActionResolver`,
`RenderSettings.isInsideRenderBoundariesOfCell`, `Chunk.isGenerated`/`hasLightData`/
`getInhabitedTime`, `Region.iterateAllChunks`. The precondition checks have to become
`async` (the ported `getChunk` is sync-with-empty-fallback), exactly as the new
`HiresModelManager` preload already does. Note for whoever ports it: `renderTime` is
`System.currentTimeMillis()/1000`, so the comparator will need to normalise it or the three
`.tiles.dat` files will read as `differing` rather than `onlyInReference`.

### Two smaller things, both of the "built, tested, unreachable" family

- **`download/token.ts` existed and nothing called it.** It resolves a token from the
  sign-in first and `GH_TOKEN` second — written precisely so that signing in inside the
  application makes a private release fetchable — and `startDownloads` never used it, so
  the behaviour it was written for did not exist. Now wired through `main/index.ts`, with
  10 tests it did not have (`ipc.ts`'s `token` option widened to allow a promise).
- **The `ui` package was not type-checked by anything.** `pnpm build` runs it through Vite,
  which transpiles per file and never checks a template, and plain `tsc` cannot read a
  `.vue` import at all. A `vue-shim.d.ts` was briefly added to silence that and was
  **removed instead**: it typed every component as `any`, which is worse than the gap, and
  `vue-tsc` — already a devDependency — reads `.vue` natively and passes clean. Every
  package now has a `typecheck` script (`vue-tsc` for `ui`, `tsc` elsewhere), a root
  `pnpm typecheck` runs all 13, and CI runs it between `lint` and `build`.

Verification for this section: **209 files, 3204 passed, 2 skipped**; `pnpm typecheck`
clean across all 13 packages; `pnpm lint` clean.

---

## Update, 2026-08-04 — Minecraft 1.12.2 read end to end, and where it stops being right

The project claims support for "MC 1.12.2 to 26.x". The modern half of that is measured by
the Phase D gate. The 1.12.2 half had never been exercised past a single hand-built
two-chunk fixture, so this session built a real 1.12.2 world and rendered it.

**Read this part first if you read nothing else:** the chunk reader is correct and is now
proved exhaustively; the *render* of a 1.12.2 world against a modern resource pack is not,
and four block-states come out wrong. Neither statement is a guess — both are measured, and
the second names the exact blocks.

### Why there is no oracle for this, and what was used instead

Upstream BlueMap 5.22 has no pre-flattening chunk loader.
`vendor/BlueMap/core/src/main/java/de/bluecolored/bluemap/core/world/mca/chunk/` holds
`Chunk_1_13`, `Chunk_1_15`, `Chunk_1_16` and `Chunk_1_18` and nothing older, so **there is
no Java render of a 1.12.2 world to compare bytes against, and there cannot be one** without
reviving `v0.10.3-mc1.12`, whose output format predates everything this engine writes. The
byte-exact gate `compare.mjs` runs for modern worlds is impossible here. Two substitutes
were used instead, and both are weaker claims than byte equality:

1. **The generator as ground truth.** `worldgen` is a pure function of its seed, so the
   test regenerates the same chunks in memory and compares the reader's answer against what
   the writer was handed, block by block.
2. **A control render of the same terrain.** Both formats are written from the same
   `TerrainGenerator`, so seed N produces literally the same blocks in a 1.12.2 world and a
   1.20.4 world. Rendering both and diffing the material tables isolates the format:
   anything in one and not the other is a difference in how the world was *read and
   resolved*, not in what was generated.

### What was added

- **`worldgen --format 1.12.2`** (equivalently `--data-version 1343`). Writes the
  pre-flattening chunk layout: `Level.Sections[].Blocks` as a `byte[4096]` of numeric ids,
  `Data` as a `byte[2048]` nibble array of 4-bit metadata, the optional `Add` nibbles for
  ids above 255, `BlockLight`/`SkyLight`, biomes as a flat `byte[256]` on the `Level`
  compound, `HeightMap` as an `int[256]` of absolute y, and a 1.12.2 `level.dat`
  (`RandomSeed`, `generatorName`, `MapFeatures`, and deliberately **no**
  `WorldGenSettings` — a real 1.12.2 world has none, so the reader falls back to the modern
  overworld box exactly as it would in the wild). New files: `legacyVersion.ts`,
  `legacyMappings.ts`, `legacyChunkNbt.ts`, `legacyLevelDat.ts`.
- **`design/packages/worldgen/test/legacy-worldgen.test.ts`** — 13 tests, about 1.3 s.
- **`tools/oracle/render-1-12.mjs`** — generates both worlds, renders both with the same
  `render-ts.mjs` driver `compare.mjs` uses, parses the PRBM tiles, and runs 14 assertions.
  It is a script rather than a unit test because it needs a client jar, BlueMap's
  `resourceExtensions.zip`, a 2,100-texture resource-pack load and two full renders. Nothing
  is softened by that: every check is an assertion and a failure exits non-zero.

The generator reports every block 1.12.2 cannot express instead of dropping it silently
(`substitutions` in the JSON summary, and on stderr). At seed 22 that is copper ore
(1.17, becomes gold ore) and `grass_block[snowy=true]` (1.12.2 had no `snowy` property;
the reader's `SnowyExtension` derives it back, and the test asserts it does). Deepslate and
its ores would be substituted too but live below y=0, which this era's world box does not
have, so they are never written.

### What is now proven about reading a 1.12.2 world

`npx vitest run packages/worldgen` — 13 legacy tests green. The strongest of them walks
**every one of 1,048,576 block positions** of a 64x64 world and asserts the reader returns
exactly the block-state that position's numeric id and metadata nibble mean. The expected
value is resolved the long way round — writer's id/meta, then the same
`assets/legacy/blockIds.json` the reader consults — so an id both sides agree on but that
is *wrong* cannot pass. Also asserted: `DataVersion` 1343 dispatches to `Chunk_1_12`; the
metadata nibbles survive (granite and andesite are not stone, spruce and birch logs are not
oak); bedrock sits at y=0 and every y below reads back as air; every biome byte resolves
through the bundled legacy table; `HeightMap` comes back as an absolute y with no
world-floor offset; sky-light is 15 above the terrain and 0 at the surface; and
`SnowyExtension` restores `snowy` on grass blocks — false where plain grass was written,
true where the snowy variant was and a snow layer sits above — while the raw chunk carries
no properties at all.

### What is now proven about rendering one

`node tools/oracle/render-1-12.mjs` — 14 checks, all passing, on a 128x128 world at seed 22
(8x8 chunks, five biomes). The 1.12.2 world renders: **9 hires tiles, 306,252 vertices, 23
distinct materials**, and

- every tile parses as valid PRBM with a generic reader that arrives *exactly* at the end
  of the file, so no tile is truncated, mis-padded or inconsistent with its own vertex
  count;
- every tile carries the seven vertex attributes the viewer reads, in order;
- every material index resolves to a `textures.json` entry with a real embedded PNG;
- **no part of the map is the missing-texture placeholder** — `bluemap:block/missing` is 0
  vertices;
- the legacy render wrote a hires tile at every coordinate the modern control did, and drew
  nothing the control does not.

That is a real map, not a tile count.

### Where it stops being right — the finding

Rendered against the modern (26.2) client jar plus `resourceExtensions.zip`, **four
block-states come out wrong**, and the cause is not in the chunk reader. The reader hands
back precisely the pre-flattening block name the numeric id means; nothing then translates
that name into a modern one before the resource pack is asked for a model. Three
qualitatively different failures follow:

| Block-state | What the generator wrote | What happens | Why |
|---|---|---|---|
| `minecraft:grass` | the grass **block** (id 2) | renders as a grass **tuft** | `resourceExtensions.zip`'s `mc1_20_3` overlay defines `minecraft:grass` as the modern tuft (1.20.3 renamed the tuft to `short_grass`). The two names swapped meaning at the flattening |
| `minecraft:snow` | the snow **block** (id 80) | renders as nothing | mirror image: in a modern pack `minecraft:snow` is the snow **layer**, whose variants are keyed on `layers`, which the legacy state has no way to carry |
| `minecraft:snow_layer` | a snow layer (id 78) | renders as nothing | the name was removed by the flattening; no blockstate answers to it |
| `minecraft:podzol` | podzol (id 3, meta 2) | renders as nothing | survived the flattening but gained a `snowy` property, and 26.2 keys its variants on it, so no variant matches |

The most damaging is `minecraft:grass`, because it fails *confidently*: roughly eleven and a
half thousand grass cubes became that many cross-shaped plants (a cross is 12 vertices, so
the arithmetic is visible in the numbers below). `short_grass` carries **139,728 vertices
against the control's 1,944 (71.9x)** — the control's figure being the world's *actual*
grass tufts — and with the ground no longer occluding, `dirt` (10.0x) and
`stone` (10.4x) become visible through it. A set difference alone would have missed this
entirely — the texture is present in both renders — which is why the harness also compares
quantities and pins the ratios.

`grass_path`, `stonebrick`, `fence`, `melon_block` and 92 other pre-flattening names are in
the same position; they simply do not occur in this seed's terrain. Of the 417 distinct
block names `blockIds.json` can produce, **96 have no blockstate in a 26.2 resource pack**.

**This is a resource-resolution gap, not a world-reading one.** Two fixes are possible and
neither is in scope here: give the render an era-matched 1.12.2 resource pack, which is
exactly what `LegacyResourcePackExtension` and `LegacyResourceNames` were written for and
what upstream v0.10.3 shipped; or add a flattening rename table between `BlockIdMapper` and
the resource lookup. The first could not be tested this session because it needs a 1.12.2
client jar and this work downloads nothing.

### How to re-run it

```bash
cd design && npx vitest run packages/worldgen          # the exhaustive decode proof, ~1.3 s
node tools/oracle/render-1-12.mjs                      # the render proof, ~1 min, 14 checks
node tools/oracle/render-1-12.mjs --seed 9 --size 256 --keep
```

`render-1-12.mjs` compiles the engine and the generator first (same reason the gate does),
and reuses the client jar and `resourceExtensions.zip` that `compare.mjs` already put in
`tools/oracle/out/gate/bluemap-data/`. **It downloads nothing**; if those files are absent
it says so and stops rather than fetching. Output goes to `tools/oracle/out/legacy/`,
including `render-1-12-report.json` with both material tables in full.

`KNOWN_LEGACY_RENDER_GAPS` and `KNOWN_DIVERGENT_MATERIALS` at the top of that script are the
finding written as a regression gate: the divergence must be **exactly** those sets. A new
entry appearing is a new bug; an entry disappearing means somebody fixed it and the list is
stale. Either way the run fails and says which.

### What remains unproven

- **There is no byte-exact oracle for 1.12.2 and there cannot be one with upstream 5.22.**
  Everything above is an internal consistency proof plus a same-terrain control. It says the
  reader agrees with the writer and that the legacy render agrees with the modern one except
  where documented. It does not say either matches what BlueMap v0.10.3 would have drawn.
- **Rendering with an era-matched 1.12.2 resource pack is untested.** The four gaps above
  are expected to disappear under one, since that is what `LegacyResourcePackExtension`
  exists for, but expected is not measured.
- **Only one of the twelve registered legacy block-state extensions is reachable from this
  terrain.** `BlockStateExtensions.ts` registers twelve, and the generator's blocks trigger
  exactly one of them — `SnowyExtension`, which is asserted. It places no stairs, fire,
  redstone, doors, nether fences, tripwire, walls, wooden fences, glass panes, double plants
  or chests, so the other eleven are still covered only by their own unit tests and the
  two-chunk fixture in `packages/engine/test/world-e2e.test.ts` (which reaches
  `WoodenFenceConnectExtension`). Teaching the generator to place a few of those structures
  would close it, and would be the highest-value next step for this area.
- **Forge block-id mappings are untested end to end.** `Chunk_1_12` duck-types a
  `getForgeBlockIdMapping` off the world and the modern `MCAWorld` does not provide one, so
  that whole branch is dead in practice and no generated world exercises it.
- **Nether and End dimensions in the legacy folder layout** (`DIM-1`, `DIM1`) are resolved
  by `MCAWorld.legacyDimensionFolder` but no generated world has them.

Verification for this section: `npx tsc -p packages/worldgen/tsconfig.json --noEmit` clean;
`npx eslint packages/worldgen packages/engine` clean; `npx vitest run packages/worldgen
packages/engine` — **88 files, 1182 passed, 1 skipped**; `node tools/oracle/render-1-12.mjs`
— **14 checks passed, 0 failed**. (`npx prettier --check packages/worldgen` reports style
issues, but it reports them for untouched files too — `chunkNbt.ts`, `packing.test.ts`,
`package.json`, `README.md` — so that is a pre-existing repository state, not something this
work introduced.)
