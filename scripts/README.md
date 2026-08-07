# scripts

Release-time scripts. `count-lines.mjs` and `pick-dim-sum.mjs` are plain Node with no dependencies
beyond the standard library and `git`, so they run identically on a developer machine and on a CI
runner. `split-parts.mjs` and `join-parts.mjs` are thin command lines over the workspace package
`@worldlens/parts`, which has to be built first; they say so and exit 2 when it is not.

## `count-lines.mjs`

Prints the line-count table that every release publishes. CI runs it at the tagged commit, so
the number is produced by the same run that built the artifacts and cannot drift from a
hand-typed figure.

```bash
node scripts/count-lines.mjs                    # human-readable table
node scripts/count-lines.mjs --format=markdown  # the form CI pastes into release notes
```

It reports source, tests, styles and markup, config, and docs **separately**, each with both
total and non-blank lines, and it splits per workspace package. A single grand number on its own
is the least informative version of this and the easiest to inflate, so there isn't one.

**Authorship** is attributed per *surviving* line via `git blame --line-porcelain`, never by
summing added lines from the log, because churn is not authorship and a line that was written
and later deleted belongs to nobody. A commit counts as agent-written when its author is an
automation identity or its message carries a `Co-Authored-By` trailer naming an agent; the
script prints which rule matched how many lines so the figure can be checked. The number is
reported plainly in either direction: a high agent share is not a boast and not an apology.

**Two totals, both labelled.** The project total covers hand-written rows. The grand total
covers everything counted, with the held-out rows still visible in the same table, so a reader
can see both what the project is and what the repository holds.

**Exclusions are stated, never silent:**

| Excluded | Why |
|---|---|
| `vendor/` | the vendored upstream BlueMap Java sources, read as reference, not this project's code |
| `node_modules/` | installed third-party dependencies |
| `dist/`, `out/`, `release/`, `.vite/` | build output, regenerated from the sources that are counted |
| `coverage/` | test coverage output |
| lockfiles | a resolver's output, not code anyone wrote |

Held out of the project total but present in the grand total: `design/packages/engine/assets/`
(bundled resource-pack and legacy mapping JSON), `design/packages/ui/public/` (upstream web
assets and translation tables), and recorded test fixtures. Binary files count as zero lines.

The script **self-checks**: if the attribution total and the line total disagree it exits
non-zero rather than publishing two numbers that contradict each other in the same table.

If the breakdown is ever wrong or misses an area, fix the script and re-run it. Do not count by
hand — an ad-hoc `wc -l` sweep silently drops every file that matches no path prefix, and a
total that quietly loses whole directories is exactly the misrepresentation this is meant to
prevent.

## `pick-dim-sum.mjs`

Resolves the dim sum code name for a release, downloads its photo, and verifies it.

```bash
node scripts/pick-dim-sum.mjs --ordinal 1 --out dist/dim-sum
node scripts/pick-dim-sum.mjs --ordinal 1 --out dist/dim-sum --json
```

The photos are **not stored in this repository**. They live in the public
`Ding-Ding-Projects/dim-sum-photos` repository, published as GitHub Release assets in capped
volumes because one release cannot hold the full 4,000-image set. This script fetches the single
image a release needs, at release time.

The volumes are not evenly sized, so the script resolves which one holds a given asset by asking
the releases API rather than by dividing an ordinal by a page size.

Dish selection is derived from the release ordinal rather than a ledger file. A ledger would
have to be committed back by CI, and a workflow that pushes to its own repository is the
automation loop the project rules forbid. The ordinal is monotonic, so a dish is never silently
reused, and the published releases are themselves the auditable mapping.

Downloaded bytes are verified before anything ships them: PNG signature, terminating `IEND`
chunk, and a byte length matching the catalog manifest. **Nothing is generated.** On any
failure the script exits non-zero with the exact URL and status, and the release job reports
that in the notes rather than substituting an image.

## `split-parts.mjs` and `join-parts.mjs`

A GitHub release asset is capped at **2 GB per file**, and a rendered world is tens of gigabytes of
tiles. These two split an oversized asset into 1.7 GB parts beside a manifest, and put it back
together again.

```bash
node scripts/split-parts.mjs big-world.zip                 # 1.7 GB parts, beside the source
node scripts/split-parts.mjs big-world.zip --out release/  # parts somewhere else
node scripts/split-parts.mjs --check big-world.zip         # would this be split? exits 0 either way

node scripts/join-parts.mjs big-world.zip.parts.json       # rejoin, verifying as it goes
node scripts/join-parts.mjs big-world.zip.parts.json --out ./worlds
```

Both are **thin**: every byte of the logic lives in `design/packages/parts`, is unit tested there,
and is the same code the desktop application runs when it downloads what CI published. Build it
first:

```bash
cd design && pnpm install && pnpm --filter @worldlens/parts run build
```

A file no larger than the part size is **passed through untouched** - nothing is written, and the
report says so. Producing a one-part manifest for a 40 MB installer would make every consumer of
every release learn the join format to open an asset that was never split.

Rejoining verifies **each part** as it appends it and then the **whole file**, and names the exact
part that is wrong rather than only reporting that the result is. A rejoin that skipped that check
would produce a corrupt world which unzips cleanly and then surfaces as a rendering bug three layers
away. An interrupted rejoin picks up from the last complete part, re-verifying the prefix it found
rather than trusting it, and exits 1 with the part named if anything disagrees.

Full documentation: [`docs/large-worlds.md`](../docs/large-worlds.md).
