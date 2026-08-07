# Action-specific artwork

## Behaviour

Selected high-impact actions include realistic artwork that explains the operation before a
person acts. The artwork is part of the owning surface, not a reusable hero with a different
caption. Five actions currently have five different bundled images:

| Action                                            | Owning surface          | Bundled image                    |
| ------------------------------------------------- | ----------------------- | -------------------------------- |
| Set up a repository and start a cloud render      | `CiRenderScreen.vue`    | `cloud-render-setup.png`         |
| Choose local render intensity                     | `SpeedControl.vue`      | `local-render-speed.png`         |
| Restart to install a ready update                 | `UpdateBanner.vue`      | `restart-to-install.png`         |
| Pack and publish a repository backup              | `BackupScreen.vue`      | `repository-publication.png`     |
| Review config writes and permanent file deletions | `ConfigApplyDialog.vue` | `config-delete-confirmation.png` |

The config deletion image appears only when the save plan really deletes files. A write-only
save does not borrow destructive imagery. The restart image stays in the non-blocking update
banner, and does not turn that banner into a dialog. Every action button, consent, progress
state, and destructive gate remains a real control owned by the existing feature.

Each image has semantic alternative text in the active language catalogue. English remains the
component-level fallback if a translated value is ever unavailable. The common renderer uses a
wide aspect ratio at ordinary widths and a taller crop below 560 CSS pixels. The image fills its
bounded card with `object-fit: cover`, keeps the subject centred, and adds no animation.

## Configuration

There is no artwork setting. The files ship with the application under
`packages/ui/src/assets/action-artwork/`, work offline, and make no network request. An owner
selects its image with an explicit `ActionArtwork` inventory key. New entries must name:

- the precise action;
- the exact owning component;
- a unique local filename;
- a semantic English fallback for `alt`; and
- the imported asset source.

Localized surfaces pass their translated alternative text into the shared renderer. Loading is
lazy by default. Above-the-fold cloud setup and the blocking deletion review opt into eager
loading so the relevant image does not arrive after the decision it explains.

## Failure modes

- A missing file fails the hand-written inventory test before Vite can publish a broken URL.
- Reusing one filename for two actions fails the uniqueness assertion.
- Moving an image to the wrong component, removing it, or renaming its inventory key fails the
  owner-wiring assertion.
- Empty or token alternative text fails the inventory length checks; mounted tests also prove
  the translated override and English fallback reach the real `<img>`.
- An unsupported narrow layout is caught by the component contract for the 560-pixel breakpoint,
  the 4:3 compact frame, and the owner suites that already exercise bilingual controls.

## Security considerations

All five files are local application assets. They contain no links, scripts, metadata-driven
actions, remote requests, analytics, or controls. The images deliberately contain no legible
buttons or product UI that could be mistaken for something clickable. The existing upload
consents, repository permission checks, update restart guard, and two-key deletion confirmation
remain authoritative; artwork never authorizes or performs an operation.

## Verification

`ActionArtwork.test.ts` is the explicit completeness boundary. It maps each action to one owner,
filename, and alternative text; checks that every file exists; rejects filename reuse; reads each
owner to prove the declared artwork is rendered there; mounts the shared component; and pins the
responsive and reduced-motion CSS. The focused owner suites cover the existing interactions, and
the production workspace build proves Vite fingerprints and emits all five PNG files.

Verified in the implementation phase:

- 5 inventory/component tests passed;
- 143 focused tests passed across 7 files, including every owning surface and the bilingual copy
  catalogue; and
- the full 13-package production build completed and emitted five distinct hashed artwork files.

## Suggested articles

- [Rendering a world in GitHub Actions](./render-in-actions.md)
- [Backing up a world or a rendered map](./backup.md)
- [Automatic updates](./automatic-updates.md)
- [Super confirmation](./super-confirmation.md)
- [Language modes and funny levels](./language-and-tone.md)
