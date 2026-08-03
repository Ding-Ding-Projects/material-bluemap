# `tools/oracle/prbm` — unit-level PRBM reference capture

```
node tools/oracle/prbm/regenerate.mjs
```

Drives upstream BlueMap's own `ArrayTileModel` and `PRBMWriter` — out of the built
oracle jar — over a handful of small hand-built models, and writes what they emitted to
`design/packages/engine/src/map/hires/prbmOracleData.ts`.

`../compare.mjs` is the phase gate: a whole world, rendered twice, tile directories
diffed. This is its unit-level counterpart, and it exists for two reasons.

- **It runs in a plain `vitest run`.** No world, no resource pack, no 80-second render —
  so the TypeScript writer is pinned against the reference implementation on every test
  run rather than only when someone remembers to invoke the gate.
- **It localises a mismatch.** The gate says "tile 4,-7 differs at byte 91204". These
  cases say "the merge-sort reordered two faces with equal material indices" or "the
  transform chain rounded one intermediate in double precision", because each model is
  built to exercise exactly one thing.

> [!IMPORTANT]
> The same rule applies here as next door: never weaken a comparison to make it pass.
> If the port is not byte-identical, the failing assertion **is** the deliverable.

## Contents

| | |
| --- | --- |
| `de/bluecolored/bluemap/core/map/hires/PrbmOracle.java` | Builds the reference models and dumps `size`, `materialIndex`, `Float.floatToIntBits` of every position, and the writer's complete output. It sits in upstream's own package so it can read `ArrayTileModel`'s package-private arrays. |
| `TrigOracle.java` | flow-math's `TrigMath.sin`/`cos` for the half-angles the mesher asks for, beside `(float) Math.sin`/`Math.cos` of the same angles. Printed, not written — small enough to live in the test file, and a trig change should be reviewed by hand. |
| `genFixture.mjs` | Parses the dump into the generated TypeScript module. |
| `regenerate.mjs` | Compiles, runs, regenerates. Needs the shadow jar to exist. |

## The pairing that makes it mean anything

`PrbmOracle.java`'s model construction is mirrored line for line by
`design/packages/engine/src/map/hires/prbmOracleFixture.ts`. **Change one and you must
change the other**, then regenerate — otherwise the two sides are building different
models and the comparison silently stops testing anything.

The cases, and what each is for:

| case | exercises |
| --- | --- |
| `empty` | The header and the bare `-1` group terminator, with no attribute data at all. |
| `single` | The smallest non-empty file; every attribute's padding and encoding. |
| `threeFacesUnsorted` | Growth from an under-sized capacity, plus two material groups out of order. |
| `transformed` | `translate`/`scale`/`rotate`/`rotateXYZ`/`rotateZYX`/`rotateYXZ`/`transform`/`invertOrientation`, chained over overlapping face ranges — this is the case that catches a wrong `TrigMath`. |
| `floatIntermediates` | A transform whose result differs by one ulp between per-operator `float` rounding (Java) and double accumulation (a naive port). |
| `mergeSort40` | 40 faces over 5 materials, so the merge path runs rather than the insertion path, and stability is observable. |

## Prerequisites

The shadow jar, which the gate's README already describes building:

```bash
cd vendor/BlueMap
GRADLE_USER_HOME=<repo>/tools/oracle/.gradle ./gradlew :cli:shadowJar
```

`regenerate.mjs` finds it under `vendor/BlueMap/implementations/cli/build/libs`, and
tells you how to build it if it is missing. `javac` and `java` must be on `PATH`.
Build output lands in `tools/oracle/prbm/out/`.
