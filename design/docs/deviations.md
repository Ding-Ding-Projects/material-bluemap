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

### resources/pack foundations (`Pack`, `PackMeta`, `PackExtension`, `ResourcePool`)

- **`Pack` browses the `vfs` instead of `java.nio`.** Upstream mounts a zip/jar with
  `FileSystems.newFileSystem(root, null)` and walks it as `Path`s; the port uses
  `resources/pack/vfs` (`PackPath` / `ZipFileSystem` / `DirFileSystem`, already recorded
  as a port-addition), so `loadResourcePath`, `loadResources`, `Pack.list` and
  `Pack.walk` are `async` and take/return `PackPath`. `Pack.list`/`Pack.walk` return
  arrays instead of a `Stream<Path>`; `Pack.walk` reproduces `FileHelper.walk`'s
  depth-first pre-order (start-path included, vanished entries ignored).
- **No `Thread.interrupted()` poll.** `loadResourcePath` opens upstream with
  `if (Thread.interrupted()) throw new InterruptedException();`. There is no thread to
  interrupt here, so the check is dropped (the call-site comment marks the spot) and
  `loadResources`/`loadResourcePath` declare no `InterruptedException` equivalent.
- **`Pack#enabledFeatures` containment is by `Key#getFormatted()`.** Upstream's
  `Set<Key>#containsAll` compares with `Key#equals`; a js `Set` compares by identity, so
  the constructor additionally keeps the formatted strings of the enabled features and
  the feature-gate tests against those. The `Set<Key>` itself is returned unchanged by
  `getEnabledFeatures()`.
- **`PackMeta.Pack` is named `PackMetaPack`.** Java nests it inside `PackMeta`, where it
  does not collide with the `Pack` base-class of the same package; TypeScript has no
  nested classes, so the class is declared top-level under a non-colliding name and
  re-exposed as `PackMeta.Pack` (as are `PackMeta.Overlay(s)`, `PackMeta.Features` and
  `PackMeta.VersionRange`), matching the `BlockRendererType.Impl` precedent.
- **`PackMeta` deserialization is explicit, and an explicit `null` member keeps the
  default.** Upstream is a reflective-gson POJO
  (`FieldNamingPolicy.LOWER_CASE_WITH_UNDERSCORES`); each ported class carries a
  `fromJson` reading the same member names. Gson's reflective adapter *assigns* `null`
  to a field whose json member is explicitly `null`; the port treats explicit `null`
  like an absent member and keeps the field-initializer default, so no `@Getter`-typed
  member can come back null where upstream's type says it cannot.
- **`ResourcePool` is a plain `Map`, like upstream's plain `HashMap`.** Upstream uses a
  non-concurrent `HashMap` even though `ResourcePack` loads its packs in parallel; that
  is a real (if benign in practice) race in Java, and it cannot occur here because
  javascript has no preemption — the map is only ever mutated between `await` points, so
  no synchronization is added. The map is keyed by `Key#getFormatted()` (the same
  value-equality trick `Registry` uses) with the `Key` kept alongside, and `values()`,
  `keySet()` and `entrySet()` return snapshot arrays rather than upstream's live views
  (`entrySet()` yields `[Key, T]` tuples). `ResourcePool.Loader#load` may return a
  promise, so both `load` overloads are `async`.
- **`PackExtension`'s two interface-defaults become optional members plus invoker
  statics.** Both upstream members are `default … {}`, so an implementation may override
  none, some or all of them. A TS interface carries no implementation, so
  `loadResources`/`bake` are declared optional and the no-op default is applied by
  `PackExtension.loadResources(extension, roots)` / `PackExtension.bake(extension)` —
  the same const-object-static shape used for `BlockColorCalculator`'s 2-arg
  interface-default. Call-sites go through the statics so the default always applies.

### resources: minecraft-version acquisition and the datapack (`MinecraftVersion`, `util/FileHelper`, `DataPack`, `DatapackBiome`, `DimensionTypeData`)

- **`MinecraftVersion.load`'s download-consent flag is a required parameter with no
  default, anywhere.** Upstream's `allowDownload` comes from the `accept-download`
  core-config option (default `false`), whose configuration comment states that setting
  it true indicates acceptance of Mojang's EULA and of downloading a Minecraft client
  file. The port therefore refuses to give it a default value — including in tests,
  which pass it explicitly and stub the network. Only the jar download is gated;
  fetching the public version-manifest is not gated upstream and is not gated here.
- **The network is the injectable `FetchFunction` `VersionManifest` already defines.**
  `MinecraftVersion.load(id, dataRoot, allowDownload, fetchFunction?)` gains a fourth
  parameter that defaults to the global `fetch` and is threaded into
  `VersionManifest.getOrFetch`, `Version#fetchDetail` and `Download#createInputStream`,
  so no test ever touches the real Mojang servers.
- **`java.nio.Path` becomes an OS path-string** for `dataRoot`, `resourcePack` and
  `dataPack`, and the client-jar is mounted through the pack-vfs `ZipFileSystem`
  (`openFile` + `getRootDirectories`) instead of `FileSystems.newFileSystem`. Everything
  the jar-reading path does is consequently `async`.
- **`download()` streams through node's `crypto` SHA-1 instead of a
  `DigestInputStream`.** The body is read chunk-by-chunk from the fetch-response,
  each chunk updating the digest and being written to `<file>.unverified` through a
  `FileHandle`, so memory stays bounded. The upstream control flow is kept exactly: a
  failed or mismatching download is only *logged* (the `catch` returns rather than
  rethrowing), the `finally` deletes the unverified file, and it is the later
  `"Resource-File missing"` check that actually fails the call.
- **`FileHelper` ports only `walk`, `createDirectories` and `atomicMove`** — the members
  the resources layer needs. `createFilepartOutputStream`, `extractZipFile`, `copy` and
  `awaitExistence` belong to the storage/webapp layers and arrive with them.
  `atomicMove` is a single `fs.rename` (node has no separate non-atomic `Files.move` to
  fall back to, and a copy+delete fallback would not be a move); a missing source is
  swallowed exactly as upstream swallows `NoSuchFileException`, but a cross-device
  rename now surfaces as an error instead of silently degrading to a copy.
  `FileHelper.walk` returns a `Promise<string[]>` rather than a lazy `Stream<Path>` —
  every upstream consumer drains the stream immediately — and keeps the
  ignore-vanished-entries behaviour.
- **`MinecraftVersion`'s nested `VersionInfo`/`PackVersions` read json explicitly.**
  Without gson's reflective adapter and `FieldNamingPolicy`, `PackVersions.Adapter.read`
  reads the `resource_major`/`resource_minor`/`data_major`/`data_minor` members, the
  legacy `resource`/`data` aliases (upstream `@SerializedName(alternate = …)`) and the
  bare-int form, and leaves everything absent at the `(4, 0)` field-initializer defaults
  a jar without a `version.json` also yields.
- **`DataPack` exports the lookup-surface as an `interface` plus the concrete
  `Pack`-subclass as the value of the same name.** Upstream `DataPack` is one class, but
  the `world/mca` layer (and its tests) was already written against the Phase C
  placeholder's *structural* `DataPack` type and passes object-literal stand-ins for it.
  Making the type nominal would break those call-sites, so the module keeps
  `export interface DataPack { getDimensionType, getBiome ×2 }` and exports the class
  `DataPackImpl` as `export const DataPack = DataPackImpl` — `new DataPack(version)`,
  `DataPack.DIMENSION_OVERWORLD` and `dataPack: DataPack` all keep meaning exactly what
  they meant, and everything upstream `DataPack` does is on the class. The private
  `loadResources(Path)` overload is named `loadResourcesFromRoot` because TS cannot
  overload a public and a private method under one name.
- **`DatapackBiome.Data` and `Effects` are top-level exported classes** (`Data`,
  `Effects`) rather than nested static ones, each with an explicit `fromJson` replacing
  gson's reflective adapter; `Effects.fromJson` applies the `@PostDeserialize` hook
  through the established `postDeserialize()` helper. The upstream aliasing is kept
  bug-for-bug: an `Effects` that declares no colors hands out the *same* mutable `Color`
  instances as `Biome.DEFAULT` (no copy), so the hook's `waterColor.a = 1` is a write to
  the shared default — a no-op there, because that color's alpha is already 1.
- **`DimensionTypeData` now exists at its upstream path, and temporarily twice.**
  `resources/pack/datapack/dimension/DimensionTypeData.ts` is the real port and carries
  the gson-side `fromJson` the datapack loader needs; the NBT-side copy and its
  `ObjectSchema` still live in `world/mca/data/DimensionTypeDeserializer.ts` (see the
  Phase C placeholder note above) until the wave that consolidates them lands. Both
  spell the `@Accessors(fluent = true)` fields `skylight`/`ceiling`, because a TS class
  cannot have a field and a method of the same name. Lombok `@Data`'s
  `equals`/`hashCode`/`toString` are not ported — nothing in the port compares or prints
  a `DimensionTypeData`.

### resources/pack/resourcepack/blockstate (`BlockState`, `Variants`, `VariantSet`, `Variant`, `Multipart`, `BlockStateCondition`)

- **`VariantSet.hashToFloat` is exported (upstream: `private static`)** so the port's test
  can pin its arithmetic directly against values produced by running the upstream method
  verbatim on a JDK. It is the position-based PRNG that decides which variant every block
  in the world renders, so a silent divergence would mis-pick variants everywhere with no
  visible failure. The implementation is a literal transcription of the java expression on
  `BigInt` with `BigInt.asIntN(64, …)` at each step java wraps: the `int` operands widen
  to `long` *before* the multiply, and `hash * (hash + 456149)` is a wrapping 64-bit
  multiply. A `number` implementation is wrong twice over (the products are already
  rounded doubles when `^` coerces them, and the square is far above 2^53). An
  all-`Math.imul` implementation would in fact be exact — only the low 24 bits survive and
  both operations are congruent mod 2^24 — but it stops looking like the java it ports;
  the equivalence is pinned by a test so a later performance pass can rely on it.
- **`VariantSet.totalWeight` is a plain left-to-right sum.** Upstream sums with
  `DoubleStream#sum()`, which uses Kahan compensated summation. The two agree exactly for
  the small integer weights resource packs actually use, and differ by at most an ulp
  otherwise.
- **`Variant.Adapter` and `blockstate/BlockState.Adapter` are port additions.** Neither
  upstream class carries a `@JsonAdapter`; both are read by gson's reflective adapter
  driven by `FieldNamingPolicy.LOWER_CASE_WITH_UNDERSCORES` plus the type-adapters on
  `ResourcesGson`. Each ported adapter reads the same member-names with the same per-type
  adapters (`ResourcesGson.blockRendererType`, `ResourcePath.Adapter`, `Variants.Adapter`,
  `Multipart.Adapter`), keeps the field-defaults for absent members and ignores unknown
  ones — including `__comment`, which the reflective adapter also just skips.
  `Variant.Adapter` applies the `@PostDeserialize` hook through the established
  `postDeserialize()` helper; because the ported constructor already runs `init()`, the
  hook recomputes an identical transform rather than being the first to compute it.
- **`MISSING_BLOCK_MODEL` is declared in `Variant.ts`** (upstream:
  `ResourcePack.MISSING_BLOCK_MODEL`, `new ResourcePath<>("bluemap", "block/missing")`),
  the same way `model/Face.ts` declares `MISSING_TEXTURE`, until the full `ResourcePack`
  port can carry the statics. It is a module-level singleton exactly like upstream's
  `static final`: `ResourcePath` caches its resolved resource on the instance, so every
  defaulted `Variant` has to share the one path-object.
- **Constructor overloads collapse into defaulted/discriminated signatures.** `Variant`'s
  three public constructors become one signature whose parameter-defaults *are* the
  upstream field-initializers (so `new Variant(model)` and `new Variant(model, x, y, z)`
  leave exactly the fields untouched they leave untouched upstream), plus a no-argument
  form standing in for the private `@NoArgsConstructor`. `VariantSet`'s
  `VariantSet(Variant...)` / `VariantSet(BlockStateCondition, Variant...)` pair becomes
  one signature discriminated by `instanceof Variant`. `blockstate/BlockState` keeps its
  `Variants`-or-`Multipart` forms and gains a documented two-argument form for the gson
  field-assignment path, since upstream's reflective adapter writes both private fields
  independently and a json carrying both members produces an object neither public
  constructor can build.
- **`BlockStateCondition` splits into an interface and a same-named const.** Upstream is a
  `@FunctionalInterface` holding its implementations as nested classes and its factories
  as interface-statics; TypeScript needs the type in the type-space and the classes and
  factories in the value-space. The nested classes' constructors are consequently public
  rather than private (the factories no longer live inside the class bodies), and the
  `and`/`or`/`property` varargs become rest parameters — `property(key, ...values)` covers
  both upstream `property` overloads, since java resolves a single string to the 2-arg
  form and the varargs form delegates to it for a 1-element array. `MATCH_ALL`/`MATCH_NONE`
  are module-level singletons so `Variants.Adapter`'s reference-identity comparisons
  (upstream `==`, here `===`) against `all()`/`none()` keep working.
- **`Preconditions.checkArgument` is a local helper** throwing a plain `Error` with the
  upstream message instead of `IllegalArgumentException`.
- **`Logger.global.logDebug`** for an unparseable variant-key uses the mca package's
  `logDebug` console helper, as the other ported resources modules do.
- **Rotation angles are read as doubles.** Upstream `Variant.x/y/z` are `float`; the port
  reads them with `nextDouble` and keeps them as `number`, consistent with the already-
  ported `MatrixM4f` (double throughout) and the `Vector*Adapter`s. Every rotation a
  resource pack actually stores is an exact small multiple of 22.5, so no narrowing step
  is observable.
- **Member order comes from `Object.entries`.** `Variants` picks the *first* matching
  condition and returns, so the order of the members in a blockstate-json is behaviour,
  not decoration. The ported adapters iterate the parsed object with `Object.entries`,
  which preserves insertion order for ordinary string keys but hoists integer-like keys
  (`"0"`, `"12"`) to the front, ahead of gson's strict document order. No variant-key can
  be integer-like — `Variants` keys either are empty/`default`/`normal` or contain an
  `=`, and multipart `when` keys are minecraft property names — so the two orders agree
  for every real resource pack.

### resources/pack/resourcepack model, texture and entitystate packages (Wave C2b-2)

- **Explicit `Adapter`s where upstream used gson's reflective adapter.** `Element`,
  `Face`, `Rotation`, `Model`, `Part`, `EntityState` and `Texture` carry no gson
  `@JsonAdapter` upstream — gson deserializes them reflectively. Without a reflective
  gson each ported class exposes a `static readonly Adapter: JsonAdapter<T>` that reads
  exactly the members gson's field-naming policy would map: the resource-pipeline types
  under `FieldNamingPolicy.LOWER_CASE_WITH_UNDERSCORES` (so `Element.lightEmission` reads
  `light_emission`), and `Texture` under `FieldNamingPolicy.IDENTITY`, which is what
  `map/TextureGallery`'s own gson instance uses (`key` still serializes as
  `resourcePath`, per its `@SerializedName`). A json `null` member keeps the field
  default, matching gson's reflective adapter for primitive fields. `TextureVariable`'s
  and `AnimationMeta`'s hand-written upstream adapters are ported as-is, including
  upstream's "Failed ot parse" message typo.
- **`ResourcePool<T>` is a one-member placeholder interface** declared in
  `model/Model.ts` (`get(key): T | null`), since `resources/pack/ResourcePool.java` is
  not ported yet and every consumer in this wave — `TextureVariable.optimize`,
  `Face.optimize`, `Element.optimize`, `Model.optimize/applyParent/calculateProperties` —
  only performs that lookup. The full pool arrives with the `ResourcePack` port.
- **`ResourcePack.MISSING_TEXTURE` and `MISSING_ENTITY_MODEL` are declared locally** in
  `model/Face.ts` and `entitystate/Part.ts` respectively (same values as upstream:
  `bluemap:block/missing` and `bluemap:entity/missing`), because the ported
  `ResourcePack` is still a Phase C placeholder interface without the key-constants.
- **`synchronized` is a no-op.** Every `synchronized` method/block of `Model`
  (`optimize`, `applyParent`, `applyTextureVariable`, `calculateProperties`) and every
  `synchronized (TextureVariable.class)` block (a *global* lock, shared by all
  TextureVariable instances) is single-threaded in TS and survives only as a comment.
- **`TextureVariable`'s `isReference`/`isResolving` fields are renamed** `reference` /
  `resolving`: upstream has both a field `isReference` and a method `isReference()`,
  which one TS class cannot carry (same situation as `Color.isPremultiplied`).
- **Private constructors become callable overloads.** Upstream's gson-only
  `@NoArgsConstructor(access = PRIVATE)` and the private copy-constructors of `Element`,
  `Face` and `TextureVariable` are not expressible as private TS constructor overloads;
  the no-args form is a public overload (the Adapters construct through it) and each
  `copy()` builds a fresh instance and copies the fields, which is what the upstream
  copy-constructor does. `Texture`'s three constructors stay `private` (its statics and
  its Adapter are inside the class body).
- **`Model`'s varargs constructors take an array.** `Model(Element @Nullable ...)` and
  `Model(Map, Element @Nullable ...)` become `(elements: (Element | null)[])` /
  `(textures, elements)`, because TS cannot overload a rest parameter against the
  fixed-arity `(textures, elements, ambientocclusion)` forms. Upstream's bug of never
  assigning the `ambientocclusion` constructor argument is kept bug-for-bug.
- **`AnimationMeta.FrameMeta` is a sibling class** of the same module rather than a
  static nested class, and gains a `setTime(int)` because upstream's adapter writes the
  package-private `time` field directly when back-filling the default frame-time. The
  `(int) in.nextDouble()` casts (`frametime` and a frame's `time`) go through a local
  `javaIntCast` reproducing java's saturating narrowing cast.
- **`Texture`'s decoded-image cache is a `WeakRef`**, standing in for upstream's
  `SoftReference<BufferedImage>`; JS has no soft reference. The base64 string is always
  retained, so a collected image is simply decoded again by the next `getTextureImage()`
  call — upstream's exact behaviour with a more eager collector. `BufferedImage` itself
  becomes pngjs' `PNG` (see `util/BufferedImageUtil`), so `getTextureImage()` and
  `Texture.from` are synchronous and throw plain `Error`s instead of `IOException`.
- **`Texture`'s animation does not survive a textures.json round-trip.** Upstream's
  `AnimationMeta.Adapter` writes through gson's delegate (the bare AnimationMeta fields)
  but reads the `<texture>.png.mcmeta` shape, which only looks at an `"animation"`
  member — so a written animation reads back as the AnimationMeta defaults. Kept
  bug-for-bug and covered by a test.
- **`Rotation.getMatrix()` and `Part.getTransformMatrix()` return `MatrixM4f | null`**,
  matching the upstream transient fields, which are null until `init()` runs. Every
  construction path in this port runs `init()` (public constructors call it directly,
  the Adapters apply the post-deserialize hook), so the null only appears for a bare
  no-args construction — exactly as upstream.
- **`Element`'s `EnumMap<Direction, Face>` is a plain Map filled in `Direction.values()`
  order**, so it iterates like the upstream EnumMap (see the
  `EnumMapInstanceCreator` note above). The package-private `Element.isFullCube()` and
  `Face.init(...)` become public, as TS has no package-private visibility.
- **`map/hires/entity/EntityRenderer.ts` still declares its own `Part` placeholder.**
  The real `entitystate/Part` now exists, but `EntityRenderer.ts` belongs to the Phase D
  renderer-type layer and is left untouched by this wave; the mesher wave replaces the
  placeholder with an import of the real Part.
- **`TextureGallery`'s textures-file I/O is string-based.** Upstream's
  `writeTexturesFile(OutputStream)` / `readTexturesFile(InputStream)` become a
  `writeTexturesFile(): string` and a `static readTexturesFile(json: string)`; the utf-8
  encoding and the gzip wrapping are the (not-yet-ported) map-storage layer's job, so the
  two names it stores under are exposed as `TextureGallery.TEXTURES_FILE_NAME`
  (`textures.json`) and `TextureGallery.TEXTURES_FILE_NAME_GZIP` (`textures.json.gz`),
  standing in for upstream's `"textures.json" + Compression#getFileSuffix()` in
  `storage/file/FileMapStorage`.
- **`TextureGallery`'s json is written by `JSON.stringify`.** gson html-escapes `=`, `<`,
  `>`, `&` and `'` inside string values by default, so upstream writes a texture's base64
  `=` padding as `\u003d`; `JSON.stringify` emits those characters literally. The parsed
  json value is identical, only its spelling differs. Reading goes through the strict
  `JSON.parse` rather than `adapter/JsonMapper`'s lenient parser, because the gallery's
  gson instance is `ResourcesGson.addAdapter(new GsonBuilder())` *without* the
  `setLenient()` that `ResourcesGson.INSTANCE` adds.
- **`TextureGallery` declares `ResourcePack.MISSING_TEXTURE` locally**, the same way
  `model/Face.ts` and `entitystate/Part.ts` do, instead of importing it from
  `ResourcePack` — that import would pull the whole pack-loader into the gallery for one
  constant. Nothing upstream ever calls `setResource` on that path, so its
  `getResource()` is always null and a separate instance behaves identically: the gallery
  keys by `Key#getFormatted()`, which is value-equal across instances.
- **`TextureGallery`'s `Map<Key, TextureMapping>` is keyed by `Key#getFormatted()`** with
  the `Key` kept alongside the mapping (a js `Map` keys objects by identity), the same
  shape `resources/pack/ResourcePool` uses. `TextureMapping` is a module-local class
  rather than a package-private static nested one, and the `synchronized` on both `put`
  overloads survives only as a comment (js has no preemption).
- **The engine barrel aliases three Phase-C exports** whose plain names were already
  taken by earlier waves, since `index.ts` is one flat namespace where upstream has
  packages: `resources/BlockPropertiesConfig` is exported as
  `ResourcesBlockPropertiesConfig` (the legacy v0.10.3 config from
  `world/mca/legacy/BlockPropertiesMapper` keeps `BlockPropertiesConfig`),
  `resources/pack/datapack/dimension/DimensionTypeData` as `DatapackDimensionTypeData`
  (the NBT-side copy in `world/mca/data/DimensionTypeDeserializer` keeps
  `DimensionTypeData`), and `resources/pack/resourcepack/blockstate/BlockState` as
  `ResourcePackBlockState` (the in-world `world/BlockState` keeps `BlockState`).
  `Pack.Loader` and `ResourcePool.Loader` — nested interfaces upstream — become
  `PackLoader` and `ResourcePoolLoader`, and `DatapackBiome`'s nested `Data`/`Effects`
  become `DatapackBiomeData`/`DatapackBiomeEffects`.
- **`ResourcePack#loadResources` takes an optional `AbortSignal`.** Upstream polls
  `Thread.interrupted()` between every one of its five phases (and between the four steps
  of `bake`) and throws `InterruptedException`; javascript has no thread-interruption to
  poll, so the method accepts an `AbortSignal` and checks it at exactly those points,
  throwing the signal's reason (a `DOMException` named `AbortError` when the caller aborted
  without one). Passing no signal is the "never interrupted" case. The `synchronized` on
  the method is a no-op in single-threaded js and is kept only as a comment.
- **`ResourcePack`'s seven parallel loaders are `await Promise.all`.** Upstream fans
  atlases, blockstates, entitystates, models, colormaps, `blockColors.json` and
  `blockProperties.json` out as `CompletableFuture.runAsync(..., BlueMap.THREAD_POOL)` and
  `join()`s them; here they are seven async functions awaited together. No two of them
  write the same pool or config, and javascript has no preemption, so `ResourcePool`'s
  plain (non-concurrent) Map is exactly as safe here as upstream's `HashMap` is there —
  and the sequential loop inside each loader keeps the "don't load already present
  resources" first-wins ordering. Upstream's `catch (RuntimeException) -> IOException`
  rewrap around the `join()` has no analogue: the port has one exception type, and every
  throw inside the loaders is already caught by `ResourcePool#load` or by the config
  loaders' own try/catch.
- **`ResourcePack` reads `blockColors.json` / `blockProperties.json` through
  `loadFromString`.** Upstream passes the `Path` to `BlockColorsConfig#load(Path)` /
  `BlockPropertiesConfig#load(Path)`, which open it with `Files.newBufferedReader`; a
  `PackPath` may live inside a zip, so the pack-loader reads the text through the vfs and
  hands it to the `loadFromString` split-out those two configs already provide.
- **`ResourcePack`'s two caffeine `LoadingCache`s become `lru-cache` instances keyed by a
  canonical string.** Upstream keys `blockStateCache` / `blockPropertiesCache` on the world
  `BlockState` itself, which hashes and compares by its id plus its *sorted* property
  array; a js Map compares by identity, so the key is the equivalent
  `namespace:value[k=v,…]` serialization with the properties sorted. `maximumSize(10000)`
  becomes `max: 10000` and `expireAfterAccess(1, MINUTES)` becomes `ttl: 60_000` with
  `updateAgeOnGet`. Like caffeine, a null loader-result is returned but not recorded, so
  `getBlockState` keeps returning `null` for a blockstate the pack has no resources for.
- **`ResourcePack.MISSING_BLOCK_MODEL` is the object `blockstate/Variant` already holds;
  `MISSING_TEXTURE` and `MISSING_ENTITY_MODEL` are not.** A `ResourcePath` caches its
  resolved resource per instance, so upstream's `static final`s have to stay single
  objects. `Variant` exports its `MISSING_BLOCK_MODEL` and `ResourcePack` re-exposes that
  very instance. `model/Face` and `entitystate/Part`, however, hold their own module-level
  `MISSING_TEXTURE` / `MISSING_ENTITY_MODEL`: importing them from `ResourcePack` would
  close an import cycle (`ResourcePack` -> `Model` -> `Element` -> `Face`) whose top-level
  `const` initializers would hit the temporal dead zone. Both are only ever used as *keys*
  on those two paths, so the duplicated resource-cache is unobservable.
- **`ResourcePack.Extension` is a module-level interface plus a same-named const.** A TS
  interface cannot be nested in a class, so the upstream nested
  `Extension<T extends ResourcePackExtension>` is exported from the module and its
  `Registry<Extension<?>>` lives on the const; `ResourcePack.Extension` is a static alias
  of that const, so upstream's `ResourcePack.Extension.REGISTRY` call-sites keep their
  spelling. `getExtension` returns `T | null` (upstream's `Map#get` result).
- **`ResourcePackExtension`'s interface-defaults become optional members plus
  invoker-statics**, exactly like `PackExtension` above it: `collectUsedTextureKeys`,
  `getBlockStateKey` and `getBlockProperties` are optional on the interface and the
  `ResourcePackExtension` const-object applies upstream's defaults (`Set.of()`, the key
  unchanged, and a no-op) at the call-sites.
- **`ResourcePack#collectUsedTextureKeys` de-duplicates by `Key#getFormatted()`** — a java
  `HashSet<Key>` compares by `Key#equals`, a js Set by identity — and the texture-filter
  predicate handed to the atlas compares the same way. Upstream adds
  `textureVariable.getTexturePath()` to the set even when it is null (a resolved reference
  that found nothing); a null entry can never match a lookup, so it is skipped here
  instead of keyed.

### resources/pack/resourcepack/atlas (`Atlas`, `Source`, `SourceType`, `SingleSource`, `DirectorySource`, `UnstitchSource`, `PalettedPermutationsSource`) — Wave C3-2

- **The file-system separator dance is dropped.** `Source#getFile` replaces every `/` of a
  key's value with `root.getFileSystem().getSeparator()`, and `DirectorySource#load`
  translates its `source` into that separator and the walked relative path back out of it,
  because a java zip-filesystem separates with `/` while the OS one may separate with `\`.
  `PackPath` is posix-style everywhere, so all three replacements are no-ops and are simply
  not ported.
- **The polymorphic source-adapter lives in `SourceType.ts`, not in `Source.ts`.** Upstream
  annotates `Source` with `@JsonAdapter(Source.Adapter.class)`, and that adapter references
  `SourceType.REGISTRY`, which references the concrete subclasses, which extend `Source`.
  As ES modules that is a cycle `Source → SourceType → SingleSource → Source`, and whenever
  `Source.ts` is evaluated first the subclass module runs its `extends` clause while the
  base class is still in its temporal dead zone. The two-pass reader is therefore
  `SourceType.Adapter`; what stays on the base class is upstream's *delegate* adapter
  (gson's reflective adapter for `Source.class`, which reads nothing but `type`), named
  `Source.DelegateAdapter` so a subclass' own `Adapter` does not shadow it as an inherited
  static.
- **`SourceType.Impl` carries the concrete adapter instead of a `Class<? extends Source>`.**
  Upstream's class-literal exists only to be handed to
  `gson.getDelegateAdapter(TypeToken.get(type))`; without gson's reflective registry the
  registry-entry holds that adapter directly, and `getType()` becomes `getAdapter()`. The
  five registered keys are unchanged, `minecraft:filter` included — it maps onto the plain
  `Source`, i.e. onto a deliberate no-op, and re-parses the element with
  `Source.DelegateAdapter`.
- **A source without a `type` throws a `JsonParseError`.** Upstream reaches
  `SourceType.REGISTRY.get(null)`, which is a `ConcurrentHashMap#get(null)` and therefore a
  `NullPointerException` out of the parse; the port throws its own error in the same place
  rather than dereferencing null.
- **`Atlas`' `LinkedHashSet<Source>` becomes a `Map` keyed by `Source#equalityKey()`,** since
  a js Set de-duplicates by identity. The key reproduces what upstream's equality actually
  amounts to, which is *not* structural: `Source#equals` returns false as soon as
  `getClass() != Source.class`, and every subclass guards its own comparison with
  `if (!super.equals(object)) return false`. So only a bare `Source` (an unknown or
  `minecraft:filter` source) ever de-duplicates — by its type — while two structurally
  identical `SingleSource`s are kept apart. Each subclass therefore overrides
  `equalityKey()` with a per-instance identity, and a test pins both halves of that
  behaviour. `getSources()` returns a snapshot array where upstream returns the live set.
- **`UnstitchSource#regions`, `PalettedPermutationsSource#textures` and
  `PalettedPermutationsSource#permutations` become ordered arrays / a `Map`.** They are
  gson-materialised `LinkedHashSet`s and a `LinkedHashMap` upstream, so the adapters
  de-duplicate on the way in (structurally for `Region`, by formatted key for the texture
  list) and keep the insertion order. `Region` is a sibling class of the same module rather
  than a static nested class, and — unlike the sources — it really does compare
  structurally, so its `equalityKey()` is the real thing.
- **A json-`null` region element is dropped at parse-time.** Upstream keeps it as a null
  entry of the `LinkedHashSet` and skips it again with `if (region == null) continue` in
  `bake`; the port drops it in the adapter, which is the same observable behaviour without
  a nullable element type.
- **`getSubimage` copies, and the awt exceptions get stand-ins.**
  `BufferedImage#getSubimage` returns a *view* onto the parent raster; pngjs has no such
  thing, so each unstitched region is copied out pixel-for-pixel (upstream materialises the
  copy immediately afterwards anyway, when `Texture.from` writes the base64 png). Its
  bounds-checks are reproduced explicitly and throw a `RasterFormatError` standing in for
  `RasterFormatException`, which is what `UnstitchSource#bake` catches to log and skip an
  out-of-bounds region; any other error is re-thrown. Likewise `PalettedPermutationsSource`
  checks the palette coordinates itself and throws an `ArrayIndexOutOfBoundsError` where
  `BufferedImage#getRGB` would throw `ArrayIndexOutOfBoundsException`, because pngjs would
  silently read `undefined` past the end of a too-small permutation palette instead of
  failing — that exception is precisely what upstream catches to log and skip the
  permutation.
- **`load` and `bake` are asynchronous** (upstream: `throws IOException`), because every
  `PackPath` operation is, and `Atlas#load`/`Atlas#bake` therefore await each source in
  turn. Upstream's `forEach` catches `IOException`; the port catches every error, since JS
  has no checked-exception distinction to make — the debug-log message is unchanged.
- **An undecodable image throws instead of reading as `null`.** `ImageIO.read` returns null
  when no reader recognises the bytes (and only throws for a corrupt but recognised image),
  so upstream skips such a file silently; pngjs' `PNG.sync.read` always throws. The texture
  is not loaded either way — the difference is one extra debug-log line, emitted by
  `ResourcePool#load` for a `DirectorySource` and by `Atlas#load` for a `SingleSource`.
