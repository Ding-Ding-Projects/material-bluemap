# `@worldlens/engine`

The render engine: world parsing, resource packs, tile rendering and storage — a
fidelity-first TypeScript port of BlueMap's `core` module.

Ported files carry an `upstream: <File>.java` header naming the java file they came from,
and any place the port deliberately behaves differently is recorded in
[`design/docs/deviations.md`](../../docs/deviations.md).

## Running the tests

```sh
# from design/
pnpm test                                    # the whole monorepo
npx vitest run packages/engine               # this package only
npx vitest run packages/engine/test/resourcepack-e2e.test.ts --reporter=verbose
```

Unit tests sit beside the code as `src/**/*.test.ts`. Cross-cutting, multi-subsystem
tests live in `test/` — currently `world-e2e.test.ts` and `resourcepack-e2e.test.ts`.

## The resource-pack end-to-end proofs

`test/resourcepack-e2e.test.ts` holds the three proofs that close Phase C. **Two of the
three run by default; the third never does unless you explicitly ask for it.**

| #   | Proof                                          | Runs by default? | Needs the network?         |
| --- | ---------------------------------------------- | ---------------- | -------------------------- |
| 1   | Offline resolution chain + `TextureGallery`    | **yes**          | no                         |
| 2   | Live check against a real Minecraft client-jar | **no — opt-in**  | yes, downloads from Mojang |
| 3   | `textures.json` shape parity                   | **yes**          | no                         |

<details>
<summary><b>Proof 1 — offline resolution chain (runs by default)</b></summary>

Builds a synthetic, _vanilla-shaped_ resource-pack jar in memory and resolves a block all
the way down it:

```
blockstate json  ->  Variants condition match      (lit=false / lit=true, no default)
                 ->  VariantSet weighted selection (weights 1 and 3, picked by position)
                 ->  Variant model ResourcePath
                 ->  Model parent chain            (e2e_block -> cube_all -> block)
                 ->  TextureVariable indirection   (#all -> all -> #tinted -> tinted)
                 ->  Texture, and its actual pixels
```

The parent chain is two levels deep on purpose, so `Model#applyParent` has to recurse: the
element comes from the middle model and the `fallback_only` texture-variable plus
`ambientocclusion` come from the grandparent. The `#reference` hop is proven by object
identity — the face's resolved `ResourcePath` is the very instance the leaf model declared
under `tinted`, which it could only reach through the reference.

It then builds a `TextureGallery` over the loaded pack and asserts that ordinal 0 is
`bluemap:block/missing`, that the rest are opaque-first then formatted-key-sorted (the
fixture writes its texture entries scrambled, so pool order cannot produce that by
accident), and that a write → read round trip lands every key back on the same ordinal.

**Fixtures are generated, never committed.** Everything the proof reads is produced by
`test/fixtures/vanillaShapedPack.ts` at test time — the PNGs, the JSON, the zip container.
Nothing pre-baked lives under `test/fixtures/`.

Run it:

```sh
npx vitest run packages/engine/test/resourcepack-e2e.test.ts -t "Proof 1"
```

</details>

<details>
<summary><b>Proof 2 — live Minecraft client-jar (OPT-IN, skipped by default, downloads from Mojang)</b></summary>

This proof downloads the real **Minecraft 1.21 client jar** from Mojang's servers through
`MinecraftVersion#load`, loads it as a resource pack, and resolves `minecraft:grass_block`
end to end onto real texture pixels.

It is gated behind **two** environment variables and runs only when both are set:

| Variable                    | Meaning                                 |
| --------------------------- | --------------------------------------- |
| `BLUEMAP_E2E_DOWNLOAD=1`    | run the live proof at all               |
| `BLUEMAP_ACCEPT_DOWNLOAD=1` | the accept-download consent (see below) |

```sh
# from design/ — POSIX shells
BLUEMAP_E2E_DOWNLOAD=1 BLUEMAP_ACCEPT_DOWNLOAD=1 \
  npx vitest run packages/engine/test/resourcepack-e2e.test.ts -t "Proof 2"

# PowerShell
$env:BLUEMAP_E2E_DOWNLOAD = "1"; $env:BLUEMAP_ACCEPT_DOWNLOAD = "1"
npx vitest run packages/engine/test/resourcepack-e2e.test.ts -t "Proof 2"
```

> **Setting `BLUEMAP_ACCEPT_DOWNLOAD=1` is a legal statement, not a convenience flag.**
> It mirrors BlueMap's own `accept-download` core-config option, which defaults to false
> and whose configuration comment reads: by changing it to TRUE you indicate that you have
> accepted [Mojang's EULA](https://account.mojang.com/documents/minecraft_eula), you
> confirm that you own a licence to Minecraft (Java Edition), and you agree that BlueMap
> will download and use a Minecraft client file from Mojang's servers. **Running this proof
> constitutes accepting those terms.** `MinecraftVersion#load` documents why the flag has
> no default and must never be defaulted to true anywhere, tests included.

**What it downloads.** One file: the official `1.21` client jar (a few hundred MB),
fetched from the URL Mojang's own version manifest gives, and verified against the SHA-1
that manifest declares before it is moved into place.

**Where it caches it.** `packages/engine/test/.minecraft-client-cache/`, which is listed in
[`design/.gitignore`](../../.gitignore). A rerun re-uses the cached jar instead of
downloading again. Delete the directory to force a fresh download.

**Never commit a Mojang jar, or anything extracted from one.** That is a hard licensing
line, not a preference. The gitignore also blocks `minecraft-client-*.jar` by name wherever
it lands, as a second guard.

**In CI.** Neither variable is set by default, so the proof does not run and nothing is
downloaded. Enable it only in a job that deliberately opts in.

**When it is skipped**, the run says so out loud — once on stdout at collection time, and
again in the skipped test's own title, which names both variables and their current values.
A proof that never ran must never be mistakable for a proof that passed.

</details>

<details>
<summary><b>Proof 3 — <code>textures.json</code> shape parity (runs by default)</b></summary>

Asserts that the document `TextureGallery#writeTexturesFile` produces has the shape
upstream's gson would emit: a bare array indexed by ordinal, each element carrying
`resourcePath` (**not** `key` — upstream's field is `key` with
`@SerializedName("resourcePath")`), `color` as a four-number array, `halfTransparent` as a
boolean, `texture` as a `data:image/png;base64,…` URI that really decodes to PNG bytes, and
`animation` omitted entirely when the texture has none.

That contract is read from the vendored java source — `map/TextureGallery.java`,
`resources/pack/resourcepack/texture/Texture.java` and
`resources/adapter/ColorAdapter.java` — and the exact lines are cited in a comment above
the test.

> **This is a shape assertion, not a diff against Java.** No java output has been generated
> or compared. There is no oracle yet (that is issue #3), so a passing run here does **not**
> mean "matches BlueMap" — only that the document has the members upstream's gson would
> emit, with the types it would emit them as. The test comment says what to add once the
> oracle lands, and why the PNG has to be compared pixel-for-pixel rather than by base64
> string.

</details>
