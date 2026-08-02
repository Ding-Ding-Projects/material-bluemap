# Intentional deviations from upstream

Per porting-conventions rule 5, this file records every place the TypeScript port
deliberately differs from upstream `vendor/BlueMap` (`e664c1a`) in behavior or API.
Bug-for-bug-preserved oddities are NOT listed here — only actual changes.

## Viewer package (`packages/viewer`)

### Mandated security deviations (porting-conventions rule 6)

- **Marker/popup HTML sanitization** — server-provided HTML is passed through
  `sanitizeHtml()` (DOMPurify, `src/util/sanitize.ts`) before `innerHTML` assignment:
  - `markers/HtmlMarker.ts` — `set html()` and `updateFromData()` (upstream
    `HtmlMarker.js:75,135`). Uses `markerData.html || ""` because DOMPurify throws on
    `undefined` where upstream would have rendered the literal string `"undefined"`.
  - `markers/PoiMarker.ts` — detail assignment into `labelElement.innerHTML`
    (upstream `PoiMarker.js:134`).
  - `markers/ObjectMarker.ts` — `LabelPopup` constructor sanitizes label/detail HTML
    (upstream `ObjectMarker.js:115`).
  - `markers/PlayerMarker.ts` — player-name `innerHTML` assignment (upstream
    `PlayerMarker.js:154`); not in the mandate's example list but covered by its
    "wherever server-provided HTML reaches innerHTML" clause.
- **`PopupMarker.ts`** — popup content is built as DOM elements with
  `addEventListener("click", ...)` calling `PopupMarker.copyToClipboard` directly instead
  of upstream's inline `onclick="BlueMap...."` attribute strings; no `window.BlueMap`
  global is required. Visible DOM structure and class names are unchanged.
- **`BlueMapApp.ts`** — upstream injects `settings.json` `scripts`/`styles` URLs into the
  document unconditionally (`BlueMapApp.js` `initGeneralEvents`/load path). The port keeps
  the mechanism but gates it behind the constructor option
  `{ allowRemoteInjection?: (kind: "script" | "style", url: string) => boolean }`
  (exported as `BlueMapAppOptions`), default `() => false`, logging a `console.warn` per
  blocked URL.

### Framework seams (no upstream equivalent)

- **Vue reactivity** — upstream wraps data objects with Vue's `reactive()` (9 call sites:
  `BlueMapApp`, `MapViewer`, `map/Map`, `controls/ControlsManager`,
  `controls/map/MapControls`, `controls/freeflight/FreeFlightControls`,
  `markers/Marker`, `markers/MarkerSet`, `util/CombinedCamera`). The port calls
  `makeReactive()` from `src/util/reactivity.ts`; the UI installs Vue's `reactive` via
  `setReactiveFactory()` at startup, default is identity. No `vue` imports remain.
- **i18n** — upstream `BlueMapApp.js`/`MainMenu.js`/`PopupMarker.js` import the vue-i18n
  global from `webapp/src/i18n.js` (out of scope for this package). Ported as an
  installable adapter seam `src/util/i18n.ts` (`i18n`, `setLanguage`, `setI18nAdapter`);
  the default adapter returns keys untranslated. The UI package must call
  `setI18nAdapter` at startup.

### Bug fixes / API-visible changes

- **`map/hires/PRBMLoader.ts`** — upstream `PRBMLoader.js:265` calls
  `new FileLoader(...)` without importing `FileLoader`, so upstream `load()` throws a
  `ReferenceError` at runtime (only `parse()` is ever used via `TileLoader`). TypeScript
  cannot compile an undeclared identifier, so the port imports `FileLoader` from
  `"three"`, making `load()` actually work. This is the only intentional runtime fix.
- **`BlueMap.ts` barrel** — TS-only type names collide across upstream's `export *`
  graph (`FollowingPlayerData` in map vs freeflight controls, `ColorLike` across marker
  modules). Resolved with explicit `export type` re-exports at the top of `BlueMap.ts`;
  these types do not exist upstream, so there is no JS-visible change.
- **`Utils.ts` (package root)** — `fetchHocon` pulls in `hocon-parser@^1.0.1` as a direct
  dependency of the viewer package (upstream declares it in the webapp `package.json`);
  typed via the local ambient declaration `src/hocon-parser.d.ts` since the package ships
  no types.

### Lint-driven, behavior-identical mechanical changes

Applied across the package to satisfy the repo eslint config; none change runtime
behavior:

- never-reassigned `let`/`var` bindings converted to `const` (including splitting
  upstream multi-declarator statements in `PRBMLoader.ts`, `Stats.ts`, and converting the
  hoisted `var getDistanceToSquared` in `CSS2DRenderer.ts`, which is only called after
  the constructor has run);
- unused function parameters kept from upstream are `_`-prefixed (e.g. `update(_delta,
  _map)` in controls, empty setter params in `CombinedCamera.ts`);
- unused `catch` bindings dropped (`catch (e)` → `catch`) in `BlueMapApp.ts`,
  `Utils.ts`, `map/Map.ts`;
- upstream-kept unused imports (`alert` in `MapViewer.ts`/`map/TileManager.ts`,
  `Vector2` in `controls/map/MapHeightControls.ts`, `animate`/`EasingFunctions` in
  `controls/freeflight/FreeFlightControls.ts`) retained under targeted
  `eslint-disable-next-line` comments;
- faithful `const self = this` / `const _this = this` aliases in `PRBMLoader.ts` and
  `CSS2DRenderer.ts` retained under targeted `eslint-disable-next-line` comments.
