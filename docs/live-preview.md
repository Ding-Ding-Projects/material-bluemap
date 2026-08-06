# Watching a render live, in a real browser tab

A render that runs for hours gives you a log. This feature gives you the map: a real
`http://` address, opened in an ordinary browser, that shows exactly the tiles this
computer has written so far — and keeps showing more of them as the render keeps going.

The screen is the **Watch it live** tab. Its main-process half is
`design/packages/app/src/main/preview/`, and its renderer half is
`design/packages/ui/src/components/preview/`.

## Why this is a new server rather than reusing the one already running

Every launch of this application already starts an embedded HTTP server
(`main/index.ts`'s `startEmbeddedServer`) that serves the app's own UI bundle and, via
`LocalMapHandler`, the two subtrees a **local render's** own viewer needs
(`settings.json` and `maps/`). That server is intentionally private: it binds to
loopback, and every request has to carry a random per-launch bearer token the renderer
injects on its own requests. It was never meant to be handed to somebody else, and
`main/pages/hosting.ts`'s own doc comment says as much — a finished render served that
way is "a URL nobody else can open." That gap is what Pages hosting was built to close by
publishing to somebody else's server; this feature closes the other half, hosting it
*from* this computer instead.

So `main/preview/server.ts` stands up a second, separate `HttpServer` — the same
chain-of-responsibility class the embedded server and the CLI's own `-w` webserver both
use — with no token, no session coupling, and no dependency on the Electron window. It
serves exactly one render's output directory (`renderWorkspace(storageDir,
renderId).webRoot`), and because a render's `webapp.enabled` setting defaults to `true`,
that directory already contains upstream's own generated `index.html` and viewer bundle.
Serving it as-is means a real, standalone map viewer answers on the address, with nothing
of this application's own UI in the way.

## Live, because it reads the workspace directly rather than waiting for a mount

`RenderOrchestrator.mount()` — the call that lets the embedded server's `LocalMapHandler`
serve a render at all — only runs once a render **finishes**. This feature does not go
through that mount at all: it points `RenderPreviewHandler` straight at the render's
workspace directory, which exists on disk from the moment the render starts. Requesting a
tile that has not been written yet answers `204`, exactly as it does for genuinely empty
terrain; requesting one that has lands the real bytes the instant the engine has written
them, container or no container, because a Docker render's `webRoot` mount is a real bind
mount to this same host path (`runtime/plan.ts`'s `hostWebRoot`), not a named volume
hidden inside the daemon.

## The one thing this cannot make un-stale on its own

The viewer keeps every tile it has already fetched in an in-memory cache
(`viewer/src/util/RevalidatingFileLoader.ts`) for the life of the browser tab, and only
re-fetches a URL once something explicitly marks it for revalidation. So a spot already
looked at will not pick up newer detail on its own — the HTTP layer here answers with a
fresh `ETag` and `Cache-Control: no-cache` on every request, which is necessary and not
sufficient, because the browser never asks again for a URL it is already holding in
memory. A silently stale "live" view would be worse than no live view at all, so the page
served at `index.html` carries a small injected banner (`injectLiveBanner` in
`server.ts`) that polls the server's own `/__material-bluemap-preview/status` endpoint,
names this plainly while the render is active, and offers a one-click reload. It never
force-reloads without saying so.

## Security

- **Binds to loopback (`127.0.0.1`) by default, always.** The network-exposure checkbox
  on the screen starts unticked on every open, regardless of what was saved last time;
  the full consequence sentence — every other device on this network, no sign-in — sits
  beside it every time, at every language mode and funny level.
- **Serves only the render's own output directory.** `RenderPreviewHandler` resolves
  every request against that one root and refuses anything that normalises outside its
  prefix — path traversal, encoded dot-dot segments, embedded null bytes — the same
  defence `LocalMapHandler` uses, tested with real traversal requests against a real
  temporary directory in `server.test.ts`.
- **No authentication, and no claim of any.** A loopback server needs none; when the
  network checkbox is on, anyone who can reach this computer on that network can open the
  map with no sign-in, which is exactly what the on-screen warning states.
- **Read-only.** Every response is an ordinary `createReadStream`/`readFile` open, which
  takes no exclusive lock on Windows or anywhere else — the same access `LocalMapHandler`
  already makes in production against files the engine is concurrently writing.

## The three render routes

- **Local** and **Docker/container**: both hostable, during the render and after it,
  because both write straight onto this machine's disk (see above).
- **GitHub's own runners**: nothing is on this computer while that render is in flight —
  the whole point of `cirender/`. `preview:availability` reports that honestly, by name,
  and the screen disables the control with the reason rather than showing one that could
  never work. Once that render's output has been downloaded here, it is an ordinary local
  workspace and hosts exactly like one.

## Ports

`startPreviewServer` tries a fixed, memorable default port first
(`DEFAULT_PREVIEW_PORT`, `48100`) so the address tends to stay the same across a session.
If that port is already taken — by an earlier run of this app, or by anything else on the
machine — it falls back to a port the operating system assigns, and reports which port it
actually landed on rather than failing with a raw `EADDRINUSE`.

## Stopping

One render is hosted at a time. Stopping releases the port immediately; quitting the
application does the same automatically (`main/index.ts` wires `PreviewIpc.dispose()`
into `app.on("will-quit", ...)`), so no listener is ever left orphaned holding a port
after the app has closed.

## What is deliberately not here

There is no authentication story to build out, because the one this feature offers —
"nobody outside this loopback address, or a warned network" — is the whole story. There
is no separate viewer to maintain: the page served is upstream BlueMap's own generated
webapp, unmodified except for the small injected status banner, which never touches the
file on disk.

## Suggested articles

- [Publishing a rendered map to GitHub Pages](./pages-hosting.md) — the address that
  keeps working after this computer is switched off.
- [Hosting a rendered map on your own server](./remote-hosting.md) — the same
  loopback-by-default, warned-public-choice shape, for a render kept running on a Linux
  server you own rather than on this desktop.
- [Running the engine on this computer, or in a container](./docker-and-local.md) — why a
  Docker render's output is exactly as reachable from this feature as a local render's.
- [Renders that survive being interrupted](./resumable-renders.md) — what "still writing
  to this workspace" actually means, which is the same fact this feature's live status
  reads.
