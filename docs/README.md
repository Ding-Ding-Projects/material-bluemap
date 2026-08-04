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
| [The regex builder and the search bars it reaches](./regex-builder.md) | The guided builder, its bounded engine, and the guard that keeps every search bar attached to one. |

## Rendering

| Document | What it covers |
|---|---|
| [Rendering a world in GitHub Actions](./render-in-actions.md) | Sharding a render across a matrix, merging it back, and verifying the result. |
| [Renders that survive being interrupted](./resumable-renders.md) | Render-state caches, completion markers, and resuming rather than restarting. |
| [Large worlds and rendered maps](./large-worlds.md) | Splitting anything past a release asset's ceiling into checksummed parts, and rejoining it. |
| [Rendering a world that lives in a private repository](./private-world-rendering.md) | Encrypted worlds rendered on public runners, and what that does and does not protect. |
| [1.12.2 worlds](./legacy-1-12-worlds.md) | Writing pre-flattening worlds from the generator, and the render harness that checks one reads back as a map. |

## Captures

`screenshots/` holds the images committed to this repository, which the site and several of these
documents refer to. They are taken from the packaged application by the project's own harness;
nothing there is a mockup or a hand-edited picture.
