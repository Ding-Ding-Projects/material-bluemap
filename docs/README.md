# Feature documentation

One document per feature. Each covers behaviour, configuration, failure modes, security
considerations and verification, in that order, so a reader who has read one knows where to look
in the next.

These documents describe what is on the default branch. Where something is built but has not been
checked against the thing it claims to match, the document says so in the section that would
otherwise be read as a guarantee. The site under `design/packages/site/` carries an article per
feature as well; the articles summarise and link back here rather than duplicating these files,
because two copies of one explanation drift apart and only one of them gets edited.

## The application

| Document | What it covers |
|---|---|
| [Command palette](./command-palette.md) | One shortcut over every command, setting and destination, with the live control on the row rather than a link to it. |
| [Notification centre](./notification-centre.md) | The bell, the reviewable history behind it, and its filters, search and export. |
| [Changelog and the in-app changelog viewer](./changelog-viewer.md) | The changelog generated from git history, and the viewer that searches and exports it. |
| [Tabbed navigation](./tabbed-navigation.md) | The browser-style tab strip: overflow, pinning, groups, four searches, five bulk closes and what survives a restart. |
| [Appearance editors](./appearance-editors.md) | Per-element appearance, the infinite colour picker and its translator, and the word-processor-depth typography editor. |
| [Super confirmation](./super-confirmation.md) | Two keys and a full-range slider in front of a destructive action, and the inventory that keeps new ones from slipping past. |
| [Language modes and funny levels](./language-and-tone.md) | English, playful Hong Kong Cantonese and bilingual, with an independent funny level per language, and the rule that voice moves while facts do not. |
| [Finding worlds](./finding-worlds.md) | The worlds already on this computer, the Minecraft folders a user can mount, and the manual routes that keep working beside them. |
| [The regex builder and the search bars it reaches](./regex-builder.md) | The guided builder, its bounded engine, and the guard that keeps every search bar attached to one. |
| [Local version history for config folders](./config-history.md) | An append-only git history per config folder, kept beside the app's data — restore is a new revision, and a failed history write never fails a save. |
| [The Minecraft licence and the consent that refers to it](./eula-and-consent.md) | The licence step at first run, the fetched-and-cached document in its tabbed viewer, the offsets that make categorising navigation rather than editing, and the placement every docked panel remembers. |
| [Automatic updates](./automatic-updates.md) | The Squirrel feed the installer always emitted and nothing consumed, the persistent restart banner, and the render in flight that holds it — plus opening a folder the app wrote, keeping tiles out of OneDrive, and a memory ceiling for the render JVM. |
| [Render console](./render-console.md) | The bounded, searchable render log: level text beside colour, detached-scroll state, advice links, copy/export, and an honest dropped-line count. |

## Rendering

| Document | What it covers |
|---|---|
| [Running the engine on this computer, or in a container](./docker-and-local.md) | Local by default and Docker by choice, with the same progress, logs and cancellation either way — and an honest account of what a container does and does not change. |
| [Automatic repair when a render or the web server fails to start](./automatic-repair.md) | Eight known failures diagnosed by code with no AI at all, a local coding agent for what is left, and the guardrails that keep it to config files it can undo. |
| [Rendering a world in GitHub Actions](./render-in-actions.md) | Rendering on GitHub's runners for computers that cannot do it themselves — the CI render sync loop, its trade-offs, sharding across a matrix, merging it back, and verifying the result. |
| [Renders that survive being interrupted](./resumable-renders.md) | Render-state caches, completion markers, and resuming rather than restarting. |
| [Large worlds and rendered maps](./large-worlds.md) | Splitting anything past a release asset's ceiling into checksummed parts, and rejoining it. |
| [Backing up a world or a rendered map](./backup.md) | Packing a folder, splitting it and publishing it as release assets with a Cheap LFS v1 pointer — and why Git LFS was rejected on cost. |
| [Worlds from somebody else's release](./world-sources.md) | Any public repository's release as a world source, including a split published as `SHA256SUMS` plus `.part.NNNN` rather than as a manifest. |
| [Rendering on a remote host](./remote-render.md) | Handing a render to a Linux machine over SSH and running it there in Docker — keys only, host keys checked, and the map brought home. |
| [Rendering a world that lives in a private repository](./private-world-rendering.md) | Encrypted worlds rendered on public runners, and what that does and does not protect. |
| [1.12.2 worlds](./legacy-1-12-worlds.md) | Writing pre-flattening worlds from the generator, and the render harness that checks one reads back as a map. |
| [Bedrock Edition worlds](./bedrock-worlds.md) | Recognising a Bedrock world and saying so, and converting one to Java with Chunker — its MIT licence, what conversion loses, and why exit code zero does not mean it worked. |

## Captures

`screenshots/` holds the images committed to this repository, which the site and several of these
documents refer to. They are taken from the packaged application by the project's own harness;
nothing there is a mockup or a hand-edited picture.
