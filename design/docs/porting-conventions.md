# Porting conventions (Java/JS → TypeScript)

These rules apply to every ported file in `design/packages/*`.

1. **Fidelity first.** Port file-by-file; preserve class names, method names, field names,
   constants, and control flow. The upstream file is the spec — when in doubt, match it.
   Upstream reference: `vendor/BlueMap` (@ `e664c1a`; legacy 1.12 code from tag
   `v0.10.3-mc1.12`).
2. **File mapping.** Same relative path and file name as upstream, with `.ts` extension
   (e.g. `webapp/src/js/map/Map.js` → `packages/viewer/src/map/Map.ts`).
3. **TypeScript strict.** Add precise types; use `interface`/`type` for upstream POJOs.
   Avoid `any` — use `unknown` + narrowing where the upstream type is dynamic.
4. **Keep upstream logic comments**, drop upstream license headers (attribution is in
   `design/NOTICE`). Do not add commentary about the porting process itself.
5. **No behavioral "improvements"** during the port. Bug-for-bug compatibility unless the
   plan explicitly calls out a change (security fixes listed below). Note intentional
   deviations in `docs/deviations.md`.
6. **Viewer package specifics** (`packages/viewer`):
   - three.js pinned at `0.147.x`, `hammerjs` kept.
   - No `vue` imports. Upstream `reactive(...)` calls become
     `makeReactive(...)` from `src/util/reactivity.ts` (the UI installs Vue's `reactive`
     as the adapter at startup; default is identity).
   - Security deviations (mandated): marker/popup HTML goes through DOMPurify
     (`src/util/sanitize.ts`); `PopupMarker` uses event listeners, not inline `onclick`.
7. **Node packages** (`nbt`, `engine`, `server`, `cli`, `shared`): ESM with explicit `.js`
   extensions on relative imports (NodeNext resolution). Browser-bundled packages
   (`viewer`, `ui`, `app` renderer) use bundler resolution — no extensions required.
8. **Numeric/binary fidelity**: use typed arrays mirroring upstream primitive arrays;
   preserve integer semantics (`| 0`, `>>> 0`, `Math.trunc`) where Java int/long math
   matters; document any 64-bit handling (see D1 in `docs/decisions.md`).
9. **Tests**: every ported module with non-trivial logic gets a vitest colocated as
   `*.test.ts` or under `test/`, asserting behavior against upstream-derived fixtures.
10. **Formatting**: prettier config at `design/.prettierrc.json`; 4-space indent to stay
    visually close to upstream Java/JS.
