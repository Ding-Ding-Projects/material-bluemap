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

### world/mca (MCAWorld / ChunkGrid / MCAWorldRegionWatchService)

- **Chunk-io is async** — upstream's caffeine `LoadingCache`s load synchronously on a
  cache-miss (blocking the render-thread); js cannot block, so `ChunkGrid.getChunk`
  returns a `Promise` (with explicit in-flight dedup so concurrent gets share one load,
  like caffeine's per-key computation; invalidation drops in-flight loads, so their
  results are not published — like caffeine discarding in-flight computations). The
  synchronous `World` interface (`MCAWorld.getChunk`, cursor-based block access) is
  served by `ChunkGrid.getCachedChunk`, which returns the cached chunk or — on a miss —
  schedules the async load and returns the loader's *empty* chunk for now. Renderers
  must therefore preload (`preloadRegionChunks`) the chunks they read; a miss shows up
  as an empty chunk instead of upstream's on-demand load.
- **Cache semantics approximated** — upstream: caffeine with `softValues` +
  `maximumSize(32 regions / 10240 chunks)` + `expireAfterWrite(10min)` +
  `expireAfterAccess(1min)`. Port: `lru-cache` with the same maximum sizes and
  `ttl = 10min` (write-anchored, lazily evicted on access). The additional 1-minute
  access-expiry is dropped (lru-cache has one ttl clock), and soft-references have no
  js equivalent — the size-bound alone limits memory.
- **Cache keys** — upstream interns `Vector2i` instances (`Vector2iCache`) to key the
  caches by `equals`/`hashCode`; js maps key by SameValueZero, so packed `"x,z"`
  strings replace the interned vectors.
- **Region watch-service on chokidar** (upstream: `java.nio.file.WatchService`) —
  (1) upstream's deferred registration (`ensureInitialization` +
  `FileHelper.awaitExistence` watching the parent-folder) becomes a 1s existence-poll
  that starts the chokidar watch once the region-folder exists (chokidar's own
  not-yet-existing-path handling silently loses folders created during its initial
  scan); (2) the blocking `poll(timeout, TimeUnit)`/`take()` become promises, with the
  timeout in milliseconds; (3) java coalesces repeated watch-events per file into one
  keyed event with a count — the port coalesces pending events per region-position and
  drains all pending positions as one batch per poll/take; (4) watcher failures are
  logged (debug) instead of surfacing as `IOException`s from poll/take.
- **`Logger.global`** — the logger-package is not ported (yet); `logError`/`logDebug`/
  `logWarning` calls in the mca-orchestration go to the console (see MCAUtil.ts).
- **Errors** — `ChunkGrid.loadChunk`'s retry-loop cannot chain earlier attempts via
  `addSuppressed` (js errors have no suppressed-list); only the last failure is logged.
  The loop retries *all* thrown errors where upstream retries
  `IOException | RuntimeException` (js cannot distinguish `Error` subtypes it doesn't
  own).
- **Legacy 1.12 extension-hook (not in upstream e664c1a)** — the modern upstream has no
  `getExtendedBlockState`; it is resurrected from legacy `v0.10.3-mc1.12` for the
  ported pre-1.13 chunk-format: `MCAWorld.getChunk` wraps `Chunk_1_12` instances in a
  cached view that applies `applyLegacyExtensions` on `getBlockState`, with a
  neighbor-callback resolving *raw* (unextended) block-states through the chunk-grid —
  matching the legacy call-graph where extensions read neighbors via the legacy
  `World#getBlockState` (which did not extend).

## Phase B consolidation (world model + MCA decoder integration)

Deviations the Phase B waves left as in-code notes, consolidated (the compression,
NBT-model and mca-orchestration deviations above are Phase B work too and are not
repeated here):

### world model (`packages/engine/src/world`)

- **Interface-defaults → abstract classes / helpers** — `Chunk` and `Region` (upstream:
  interfaces where every method has a default) are abstract classes so implementations
  inherit the defaults; `WorldLoader`'s `worldDataPacks` interface-default is the
  exported `worldDataPacks(loader, path, dimension)` helper (js interfaces cannot carry
  implementations).
- **Field/method name collisions** — Java allows a field and a method of the same name
  on one class, js does not; upstream fields are renamed where they collide with their
  accessor: `BlockState` `isAir/isWater/isWaterlogged` → `air/water/waterlogged`,
  `Chunk_1_13/1_16/1_18` `hasWorldSurfaceHeights/hasOceanFloorHeights` →
  `…HeightsPresent` (Chunk_1_12: `hasWorldSurface`), `BlockNeighborhood.thisIndex`
  (field) → `thisIndexCache`. Method APIs are unchanged.
- **`BlockProperties.Builder`** — a Java inner class mutating its outer instance;
  ported as the separate `BlockPropertiesBuilder` class holding that instance and
  reaching its private fields via element access.
- **Anvil loader-registration site** — upstream defines
  `WorldLoaderType.ANVIL = new Impl(Key.bluemap("anvil"), MCAWorld::load)` as a static
  on the interface; the port defines `ANVIL` in `world/mca/MCAWorld.ts` and
  self-registers it into `WorldLoaderType.REGISTRY` on module-load, so the
  world-package carries no runtime-dependency on the mca-package. Key, lookup and
  loader behavior are identical.

### world/mca decoders

- **Chunk_1_12 (not in upstream e664c1a)** — the pre-flattening chunk-format is
  combined back from the legacy `ChunkAnvil112` (`v0.10.3-mc1.12`) into the modern
  chunk-architecture (Chunk_1_13-style section array instead of the legacy fixed
  `Section[32]`); legacy semantics kept (`LightPopulated`/`TerrainPopulated`,
  `Level.HeightMap` as world-surface, no ocean-floor heights). In
  `MCAChunkLoader`'s sorted loader-list the Chunk_1_13 floor is raised from upstream's
  0 to 1344 and a Chunk_1_12 entry with floor 0 is appended, so DataVersions <= 1343
  (or absent) dispatch to the legacy decoder instead of upstream's (1.13-assuming)
  Chunk_1_13.
- **Legacy mappings from bundled assets** — the legacy `BlockIdConfig`,
  `BlockPropertiesConfig` and biome-table (upstream v0.10.3: user-editable configurate
  nodes with optional "autopopulation" writing resolved fallbacks back to disk) are
  backed by the bundled `assets/legacy/*.json` (extracted from the v0.10.3 default
  configs); autopopulation is not ported, the in-memory fallback-caching is kept.
- **Forge id-mappings are duck-typed** — the legacy `MCAWorld#getForgeBlockIdMapping`
  (read from level.dat `FML/Registries`) does not exist on the modern `MCAWorld`;
  `Chunk_1_12` consults it only if the world instance offers the method
  (`ForgeBlockIdMappings` duck-type), otherwise numeral-id mapping alone is used.
- **Explicit nbt-schemas** — upstream lets BlueNBT reflection derive the chunk/level
  Data classes from `@NBTName` annotations; the port registers explicit `ObjectSchema`s
  for every nbt-mapped mca-type in `MCAUtil.addCommonNbtSettings` (see the NBT-package
  schema-model deviation above). `MCAUtil.BLUENBT` is initialized lazily to keep the
  module-graph cycle (chunk-schemas register from `MCAUtil` while chunk-modules import
  its helpers) initialization-order safe.
- **`getValueFromLongStream` returns an int** — upstream returns a `long` that every
  call-site `(int)`-casts; the port returns the value's low 32 bits directly, extracted
  via an `Int32Array` view over the long-array's 32-bit halves (no per-element BigInt —
  decisions D1). Same applies to `PackedIntArrayAccess.get`.

### Phase C/D contract placeholders (replaced by the full ports)

- `resources/pack/datapack/DataPack.ts`, `resources/pack/resourcepack/ResourcePack.ts`,
  `map/hires/RenderSettings.ts` and `map/mask/Mask.ts` are minimal typed placeholders
  declaring only the surface the world/mca layer consumes (dimension-type/biome
  lookups, `getBlockProperties`, the ExtendedBlock render-settings subset, mask
  `test`/`isEdge`/`submask` + `NONE`/`ALL`); the upstream key-constants on `DataPack`
  are real. `util/Tristate.ts` and `util/WatchService.ts` are full ports (WatchService
  with the promise-shape noted in its header: `poll(timeoutMs)`/`take()` return
  promises, timeout in milliseconds instead of a `(timeout, TimeUnit)` pair).
- `DimensionTypeData` lives in `world/mca/data/DimensionTypeDeserializer.ts` until the
  resources-pack port lands (upstream:
  `resources/pack/datapack/dimension/DimensionTypeData`); its schema-registration
  yields to an already-registered `"DimensionTypeData"` token so the resources port
  can take the token over.
- **`ResourcePack.getColormaps()`** — the Phase C placeholder interface grew the one
  member `BlockColorCalculatorFactory.colorMap()` needs, typed as the structural
  `{ get(key: Key): ColorMap | null }` instead of upstream's
  `ResourcePool<ColorMap>` (lombok `@Getter`). The `ResourcePool` port arrives with the
  full `ResourcePack` port. Nothing else on the placeholder was expanded.

### map/hires renderer-type layer without the mesher (Phase D boundary)

- **`BlockRendererType` / `EntityRendererType` factories throw when called.** Upstream
  wires the concrete mesher renderers into the type constants
  (`BlockRendererType.DEFAULT/LIQUID/MISSING` → `ResourceModelRenderer::new`,
  `LiquidModelRenderer::new`, `MissingModelRenderer::new`;
  `EntityRendererType.DEFAULT/MISSING` → `ResourceModelRenderer::new`,
  `MissingModelRenderer::new`). Those renderers depend on `TileModelView`,
  `ArrayTileModel`, the real `RenderSettings`, `Variant` and `Part`, none of which are
  ported yet, so each `Impl` is constructed with a factory whose `create(...)` throws
  `"<key> renderer is not ported yet (Phase D)"`. Key identity, the `isFallbackFor`
  interface-default (`false`) and `REGISTRY` lookup — everything the Phase C
  `ResourcesGson` registry-adapters consume — are fully ported and behave as upstream.
  The mesher wave replaces the throwing factories with the real constructors.
- **Phase D type placeholders introduced by that layer** — `map/hires/TileModelView.ts`
  and `map/TextureGallery.ts` are one-member placeholder interfaces at their upstream
  paths (rather than duplicated per-file declarations, since both renderer packages
  need them), and `Variant` / `Part` are one-member placeholder interfaces declared in
  the single file that mentions each (`map/hires/block/BlockRenderer.ts` and
  `map/hires/entity/EntityRenderer.ts`). Each carries a `Phase D placeholder` banner
  naming the upstream file that replaces it. The single member exists only so the
  placeholder is not a structurally-empty (any-accepting) type.
- **`BlockColorCalculatorFactory` interface-defaults** — upstream is a functional
  interface, so java hands every lambda-implementation the combinators
  (`withBiomeOverlay`, `withBiomeColorModifier`, `blended`, `blended(h, v)`, `with`)
  for free. The port declares them on the interface and implements them once in
  `Impl`; every factory this module produces (including the `fixed` / `biome` /
  `colorMap` statics and the added `of(create)` lambda-form) is an `Impl`, so the
  fluent chaining upstream relies on is preserved. `BlockColorCalculatorType.Impl`
  spells out the lombok `@Delegate` forwarding of all six members explicitly.
- **`BlockColorCalculator`'s 2-arg interface-default** — `getBlockColor(block, target)`
  is exposed as `BlockColorCalculator.getBlockColor(calculator, block, target)` on the
  module's const-object, since a TS interface carries no implementation.
- **`ColorMap`'s image constructor** — upstream `ColorMap(BufferedImage)` builds the
  `int[65536]` then calls `this(colorMap)` *after* statements, which is not legal java
  and does not compile as written; the port implements the semantics (row-major
  `getRGB(0, 0, 256, 256, …)` of the 256×256 map into a flat `Int32Array(65536)`) via a
  constructor overload, packing pngjs' straight-alpha RGBA bytes into ARGB ints.
  `GenericMath.clamp` is a local helper; the array is an `Int32Array` rather than
  `number[]`.
