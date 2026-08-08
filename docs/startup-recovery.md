# Startup recovery and the Worldlens identity mark

## Behaviour

Worldlens creates a usable window before it initializes optional features. Each startup feature
runs behind its own failure boundary: configuration, dependency discovery, update setup, network
features and ordinary initialization may disable themselves without removing the rest of the app.
The shell shows a persistent, non-modal recovery banner, and the same error enters notification
history so navigating away does not erase it.

Failures that make the ordinary renderer unsafe use a smaller recovery shell instead. Profile
migration collisions or verification failures, preload failures, main-frame load failures,
renderer-process loss, an app-ready rejection and an uncaught startup exception all take this
route. The recovery shell has no preload, no JavaScript and no Node integration. It still provides
working window controls plus **Restart and retry**, **Copy details**, **Export JSON**, and **Export
Markdown** actions.

Startup diagnostics are appended to `startup-diagnostics.jsonl` below the separate `Worldlens
Recovery` application-data folder, not inside the profile being migrated. The current launch and
the bounded recent history are readable through the startup bridge. Copy and export include the
complete cached record, not only the last line.

The Worldlens identity mark is built from `design/brand/worldlens-logo-source.png`. A committed
Sharp-based builder derives the app title-bar and About images, the documentation-site mark and
favicon, a README-sized image, and a Windows ICO containing 16, 20, 24, 32, 40, 48, 64, 128 and
256 pixel entries. Packaging checks that every derivative is current before it runs.

## Configuration

There is no switch that disables recovery. The diagnostic files contain startup facts only and
remain local until a person explicitly copies or exports them. Export offers UTF-8 JSON or
Markdown and opens the operating system's Save dialog.

`--worldlens-startup-probe=<phase>` is a diagnostic smoke-test seam. It can only make the named
phase fail; it never enables a capability, relaxes isolation, skips migration verification, or
changes a security decision. The packaged proof uses
`--worldlens-startup-probe=profile-migration`, which stops before any profile is read or written.

Regenerate brand assets with:

```powershell
corepack pnpm --dir design --filter @worldlens/app brand:build
```

Verify that tracked assets match the source without changing them:

```powershell
corepack pnpm --dir design --filter @worldlens/app brand:build -- --check
```

## Failure modes

- A profile migration collision or verification failure is a hard data-integrity boundary. The
  ordinary shell is not allowed to open writable profile features; the recovery shell opens
  instead and the legacy profile stays unchanged.
- A preload failure never falls back to `nodeIntegration`, disabled isolation, or an un-sandboxed
  renderer. The ordinary window is destroyed and the no-preload recovery shell replaces it.
- A configuration, dependency, update or network feature that throws is recorded and disabled.
  Other independent features continue initializing.
- A main-frame load failure or renderer crash retires the failed window and opens recovery. It is
  not reported as a successful launch.
- A diagnostic write failure cannot hide the original startup error or prevent recovery from
  opening. The in-memory record remains available and the recovery surface reports that durable
  storage failed.
- Restart, export and shell launch actions use single-flight guards. Repeated keyboard submits or
  clicks share the in-progress operation rather than launching or exporting twice.

## Security considerations

The profile recovery directory is separate from both the legacy and current profile roots. Secret
shapes such as GitHub tokens, bearer authorization, token query values, passwords and generic
secret fields are redacted before they reach memory, disk, the renderer, clipboard, or an export.
No diagnostic is transmitted automatically.

The minimal recovery renderer uses `sandbox: true`, `contextIsolation: true`,
`nodeIntegration: false`, and `javascript: false`. Its Content Security Policy denies everything
except its bundled data-image and inline styling. Buttons are ordinary keyboard-operable links to
a private `worldlens-recovery://` action namespace intercepted by the main process; no privileged
object enters the page.

Worldlens remains permanently unsigned. Electron Builder edits Windows resources to apply the
logo and version metadata, while `forceCodeSigning` and `signExecutable` remain disabled. Resource
editing is not signing and makes no publisher-authenticity claim.

## Verification

The focused suite covers all eight startup categories, secret redaction, success isolation,
single-flight launch/retry/export behavior, JSONL persistence, complete JSON and Markdown export,
bridge registration, migration ordering, the no-exit policy, every inventoried startup phase,
renderer/preload/exception signals, recovery CSP and sandbox settings, recovery actions, the
packaged probe, the mounted banner, persistent notification history, and the About logo's semantic
alternative text.

Packaging must additionally prove that:

1. `brand:build -- --check`, app/UI/site typecheck, lint, build and the full test suite pass;
2. the unpacked Windows executable contains the edited Worldlens icon while Authenticode remains
   `NotSigned`;
3. a cheap Lowlevel off-screen launch with the profile-migration probe opens the recovery shell;
4. the capture clearly shows the unique logo, truthful failure, working actions and a usable
   window rather than an exit-only native error; and
5. exact branch CI passes before the phase is merged.

## Suggested reading

- [Migrating to Worldlens](worldlens-migration.md)
- [Automatic dependency provisioning](dependency-provisioning.md)
- [Automatic updates](automatic-updates.md)
- [Notification centre](notification-centre.md)
- [Release workflow security](release-workflow-security.md)
