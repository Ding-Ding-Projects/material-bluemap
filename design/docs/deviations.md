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

## NBT package (`packages/nbt`)

Ported from the BlueNBT library (as vendored by upstream) plus BlueMap's
`core/.../util/nbt` adapters. Runtime-model deviations forced by TypeScript's
erased types / missing reflection:

- **Buffer-based IO** — `NBTReader` reads from an in-memory `Uint8Array` instead of a
  streaming `InputStream` (chunk payloads are decompressed into memory anyway);
  `NBTReader.raw()` reconstructs the tag-id + name header instead of upstream's
  `DataLogInputStream` tap — byte-identical output. `NBTWriter` writes into a growable
  buffer exposed via `toUint8Array()` instead of an `OutputStream`.
- **Writer method names** — Java's overloaded `value(...)` becomes `valueByte`,
  `valueShort`, `valueInt`, `valueLong`, `valueFloat`, `valueDouble`, `valueString`,
  `valueByteArray`, `valueIntArray`, `valueLongArray` (JS cannot overload on numeric
  types). The `value(byte[], off, len)`-style partial-array overloads are not ported.
- **64-bit values** — LONG tags surface as `bigint`, LONG_ARRAY as `BigInt64Array`;
  `nextLongArrayAsBytes()` added for the packed-block-state hot path (zero-copy view,
  no per-element BigInt — see decisions D1); `LONG_AS_NUMBER` adapter added as a
  convenience for timestamp-like longs.
- **Schema model** — upstream's reflection-driven `DefaultDeserializerFactory` /
  `DefaultSerializerFactory` / `InstanceCreator` / `@NBTName` / `@NBTPostDeserialize`
  become explicit `ObjectSchema` objects (`create()` supplies the field-defaults,
  `FieldSpec.names` replaces `@NBTName`, `postDeserialize` replaces the annotation);
  `TypeToken` is an interned string-identified token instead of a captured
  `java.lang.reflect.Type`. Object-schema serialization writes fields in schema order
  (upstream: `HashMap` order — unspecified).
- **`nextArrayAs*Array`** — the generic `nextArray(Object|IntFunction)` reflection
  entry-points are not ported; the three `nextArrayAs*Array` conversions implement the
  same observable behavior (widening converts, narrowing throws an
  `IllegalArgumentException` like `java.lang.reflect.Array.setInt/setLong` would).
- **`RegistryAdapter`** — the package must stay dependency-free, so shared's
  `Key.parse` is injected as a `keyParser` constructor-argument and Key/Keyed/Registry
  are structural interfaces; `Logger.global.noFloodWarning` becomes an optional
  warning-callback (deduplicated per adapter instance, default `console.warn`).
- **`PalettedArrayAdapter.write`** — palette dedupe is keyed by SameValueZero equality
  (upstream: `equals`/`hashCode`); exact for strings/primitives, identity for objects.
- **Element-type resolution** — `CollectionAdapter`/`MapAdapter`/`LenientListAdapter`
  resolve their element-(de)serializer lazily per direction (upstream resolves both in
  the constructor), so deserialize-only registrations (e.g. `BlockStateDeserializer`)
  remain usable inside lists/maps.
- **`TypeResolver.onException`** — upstream's two default-method overloads are
  flattened into one optional method receiving `base?`; error classes
  (`IOException`, `EOFException`, `IllegalStateException`, ...) are ported so
  catch-semantics (e.g. `LenientListAdapter` only recovering from `IOException`s)
  stay intact.
- **`char` primitives** — `readChar`/char-adapters are not ported (unused by the
  engine schemas).

## Engine package (`packages/engine`)

### storage/compression

- **IO shape** — the `java.io` wrapper API (`OutputStream compress(OutputStream)`,
  `InputStream decompress(InputStream)`) is ported as overloads on the same method
  names: node-stream wrapping (`compress(Writable): Writable`,
  `decompress(Readable): Readable`) plus whole-buffer async
  (`compress(Uint8Array): Promise<Buffer>` etc.). The `Buffered(In|Out)putStream`
  wrappers are dropped — node streams buffer internally. `Compression`'s static
  interface fields become the merged `const Compression` object;
  `BufferedCompression` takes a `{stream, buffer}` pair where upstream takes a single
  `StreamTransformer` constructor-ref. `CompressedInputStream` is a
  (Buffer, Compression) pair (`getBuffer()` replaces reading the delegate stream);
  errors are `IOException`/`EOFException` from `@material-bluemap/nbt`.
- **ZSTD** — upstream's `io.airlift` `ZstdOutputStream`/`ZstdInputStream` stream
  incrementally; the port uses `@bokuweb/zstd-wasm`'s one-shot codecs (compression
  level 3 = airlift's/zstd's default), so the zstd node-stream API collects the whole
  payload in memory before coding. Frames are standard zstd (interop verified against
  node's native zstd codec in tests); one-shot compression additionally records the
  content size in the frame header, which airlift's streaming writer omits —
  decompression is unaffected.
- **LZ4** — `net.jpountz.lz4.LZ4BlockOutputStream`/`LZ4BlockInputStream` (lz4-java's
  own container, also used by MC 1.20.5+ region chunks) are reimplemented in
  `Lz4Block.ts` on lz4js' raw-block codec + xxhash-wasm; framing is byte-compatible,
  with every constant verified against lz4-java master sources — including the
  checksum being `xxhash32(decompressedBytes, seed 0x9747b28c) & 0x0FFFFFFF`
  (`StreamingXXHash32#asChecksum()`'s 28-bit `0xFFFFFFFL` mask,
  `StreamingXXHash32.java:106`). Decoder matches the default reader
  (`stopOnEmptyBlock = true`): stops at the terminating empty block, ignores trailing
  bytes, and rejects streams that end without it. One internal check differs:
  lz4-java verifies "compressed bytes consumed == compressedLength" while lz4js'
  block decoder consumes exactly compressedLength and reports the produced size, so
  the port verifies "produced == originalLength" (plus the checksum) — same
  corruption-rejection outcomes. Compressed block _content_ may differ from
  lz4-java's output for compressible data (different match search), which is fine —
  any spec-legal LZ4 block round-trips; RAW blocks and all framing are byte-identical.
