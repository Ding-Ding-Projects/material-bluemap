# Security policy

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Report it privately through GitHub's private vulnerability reporting: go to the
[Security tab](https://github.com/Ding-Ding-Projects/material-bluemap/security) of this
repository and use **Report a vulnerability**. That opens a draft advisory visible only to the
maintainers. If private reporting is not available to you, open a normal issue that says only
that you have a security report and asks for a private channel, with no details in it.

Useful in a report, roughly in order of value:

- The commit SHA you tested, and how you built it.
- What an attacker controls: a world file, a resource pack, a remote BlueMap server the app is
  pointed at, marker data served by such a server, or a local file path.
- The smallest reproduction you have. A minimal region file or a marker payload beats a
  description.
- What you got: code execution, file read or write outside the expected root, a bypassed
  Content-Security-Policy, a leaked token, or something else.

Please give us a reasonable window to fix an issue before publishing it. We will confirm receipt,
tell you what we found, and credit you in the advisory unless you would rather we did not.

## What is in scope

This project is **pre-release**. There are no releases, no installers, and no supported version
line: the only thing to report against is the current default branch. Nothing here has had a
formal security audit.

In scope: the Electron desktop app, the embedded and standalone HTTP server, the viewer library,
and the world and resource-pack parsers. Out of scope: upstream
[BlueMap](https://github.com/BlueMap-Minecraft/BlueMap) itself (report those to upstream), the
vendored reference sources under `vendor/`, and issues that require an attacker who already has
code execution on the user's machine.

## Current security posture

This section describes what the code actually does today, so a reader can check it rather than
take our word for it. It is a description, not a guarantee.

### Electron main process

`design/packages/app/src/main/index.ts`:

- **Renderer sandbox on.** The `BrowserWindow` sets `sandbox: true`, `contextIsolation: true`,
  and `nodeIntegration: false`. The renderer reaches the main process only through a typed
  preload bridge, not through Node.
- **Permissions denied by default.** The session's permission request handler grants exactly two
  permissions, `pointerLock` (needed by the free-flight camera controls) and `fullscreen`.
  Everything else is refused.
- **Strict Content-Security-Policy.** Main-frame responses from the embedded server get:
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:
  blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none';
  base-uri 'none'; frame-ancestors 'none'`. The `'unsafe-inline'` in `style-src` is a known
  loosening: Vuetify injects style tags at runtime. Scripts have no such exception.
- **Navigation lock.** `will-navigate` is cancelled for any URL outside the embedded server's
  base URL, and `setWindowOpenHandler` denies every window open. An `https://` link is handed to
  the operating system browser instead; anything else is dropped.

### Embedded HTTP server

`design/packages/server/src/http/HttpServer.ts` and the app's startup path:

- The server binds **127.0.0.1 on an ephemeral port**, never a routable interface.
- It is **token-gated**. The app generates 24 random bytes from `node:crypto` per launch and the
  server rejects any request that does not carry it, either as an `Authorization: Bearer` header
  or as a `token` query parameter. The query-parameter form exists because `EventSource` cannot
  set headers, and it means the token appears in the URL the app loads. That is an accepted
  trade-off for a loopback-only server with a per-launch token, not a claim that the token is
  secret from anything running as the same user.

### Viewer

`design/packages/viewer/src/util/sanitize.ts`:

- Server-provided HTML (marker labels and detail, HTML markers, popups) is passed through
  **DOMPurify** before it is assigned to `innerHTML`, with the `html` and `svg` profiles and
  `style` tags forbidden. Upstream BlueMap injects this HTML raw; sanitizing it is a deliberate
  deviation of this port, recorded in `design/docs/deviations.md` with the upstream file and line
  for each call site.
- `PopupMarker` binds event listeners instead of emitting inline `onclick` attributes, so the
  viewer runs under the CSP above rather than needing an inline-script exception.

Marker data is attacker-controlled whenever the app is pointed at a remote BlueMap server the
user does not run. Treat any bypass of the sanitizer as a real finding.

### Assets and network

- Minecraft assets are **not** distributed with this project. The Minecraft client jar is
  downloaded from Mojang's servers at runtime and only after explicit user consent, mirroring
  upstream BlueMap's accept-download flow. Checksum verification of that download is part of the
  in-progress Phase C work and is not something to rely on yet.
- BlueMap's own `resourceExtensions` JSONs are MIT licensed and are bundled in the repository.
- Remote BlueMap servers are reached through a reverse proxy in the server package, configured
  from user-managed profiles. The app makes no other outbound requests, and metrics are opt-in
  (upstream defaults to opt-out).

## Known limitations

Stated plainly so nobody reports them as discoveries, and so nobody mistakes the list above for a
finished job:

- No security audit, internal or external, has been performed.
- `style-src` permits `'unsafe-inline'` for Vuetify's runtime style injection.
- The loopback server's token travels in a query string on the initial load.
- The world, NBT and resource-pack parsers are ports of upstream Java code and inherit its
  handling of malformed input. Phase C and D are still in progress, so parser hardening against
  hostile world files is not complete.
- The oracle validation that would byte-check parts of the binary layer against the upstream Java
  implementation has not run yet. It is tracked in `design/docs/deviations.md`.
