# Rendering a world that lives in a private repository

Rendering a large Minecraft world takes hours of CPU. GitHub gives public repositories
unlimited standard-runner minutes and charges private ones by the minute, so the obvious
thing to want is to run the work on the public side while the world itself stays private.

This is how that is done here, what it actually protects, and — the part worth reading
before you decide — what it does not.

The public render path is documented separately in
[render-in-actions.md](./render-in-actions.md). Everything there about *how a world is
split and put back together* applies here unchanged. This document is only about the
things that are different because the world is private.

---

## The short version

1. On the private side you tar the world, encrypt it, and attach the encrypted pieces to
   a release in your private repository.
2. You run **Encrypted render** on this public repository. It fetches those pieces with a
   token you gave it, verifies them, decrypts them onto the runner, renders, encrypts the
   result, and attaches it to a new release **on your private repository**.
3. Nothing rendered is kept here. No release is created here. No world or map data is
   ever uploaded as an Actions artifact.

Every name that appears in the public run — the payload files, the release tags — is a
keyed hash. Somebody reading the run learns that a render happened and roughly how large
the world was. They do not learn whose it is, what it is called, or where it lives.

---

## The trust boundary, stated honestly

This is the section to read twice.

### What the public runner can see while it works

**The decrypted world, in full, in memory and on its disk, for the duration of the job.**
There is no way around this. Rendering means reading every chunk and turning it into
tiles; a renderer cannot work on ciphertext. The encryption protects the world *in
transit* and *at rest on the public side's storage*. It does not protect it from the
machine doing the rendering, because that machine has to be handed the key.

Concretely, during a run the runner holds:

- the encryption key, in the process environment;
- the decrypted world, unpacked on disk;
- the token that can read from and write to your private repository;
- the name of your private repository.

### A public runner is still someone else's machine

GitHub-hosted runners are ephemeral virtual machines, destroyed after the job. That is a
real property and it is why this arrangement is reasonable. It is not the same as a
machine you control:

- GitHub operates it. Their platform, their hypervisor, their storage.
- Anyone who can cause a workflow to run on this repository can run code on a runner. On
  a public repository that is a larger set of people than you might expect, which is why
  this workflow is `workflow_dispatch` only and never `pull_request`. **Do not add a
  `pull_request` trigger to it**, and do not add one to any workflow that can read these
  secrets.
- A fork's pull request cannot read these secrets. That is GitHub's behaviour, not
  something this file arranges, and it is worth verifying rather than assuming if the
  world matters to you.
- The workflow's logs are public. This is why identifiers are hashed and why the map id
  is fixed rather than taken as an input: an input appears in the log verbatim.

### What is never written down publicly

- The world, in any readable form.
- The rendered map.
- The name of the private repository, the world, or the release tags — all hashed or held
  in secrets.
- The shard plan, which describes the world's extent in blocks.

### What the public side does reveal

Being precise about this is the point of the section:

- **That a run happened, and when.** Public workflow runs are public.
- **Roughly how large the world is.** The number of shards is a job matrix, and a matrix
  is visible. Sixty-four jobs means a big world; one job means a small one. The exact
  block extents are sealed, but the order of magnitude is not.
- **How long it took**, which is the same information again from a different angle.
- **That the person running it has a private repository**, though not which one.

If the *existence* of the world is itself the secret, this arrangement does not deliver
that, and no amount of encryption in it would.

### What would break it

- Putting a real name in a workflow input, a job name, or an `echo`. Inputs and job names
  are rendered into the public run's page.
- Adding an Actions artifact that carries world or map data. See below.
- A token with more access than it needs. Give the workflow a token scoped to the one
  private repository, with the minimum that lets it read a release and create one.
- Reusing the encryption key across worlds you would not want linked. Two payloads under
  one key are visibly related to anyone holding it.

---

## Why release assets and not Actions artifacts

The public path in `design/packages/render-actions/src/merge/` passes each shard's output
between jobs as an Actions artifact: the render jobs upload `shard-<n>`, and the merge job
downloads `shard-*` and combines them. That is the natural way to move data between jobs
and it is the right choice there, because a public world's tiles are not secret.

**Artifacts cannot be used here.** An artifact belongs to a workflow run, and on a public
repository a run's artifacts are downloadable by anyone who can see the repository — no
authentication, no permission. Uploading a private world's tiles as an artifact would
publish them as surely as committing them.

So the private path uses a different transport for the same data:

| | public path | private path |
| --- | --- | --- |
| world to render jobs | one artifact, downloaded by each shard | encrypted release assets on the private repository, downloaded and verified by each shard |
| shard output to merge | artifact per shard | encrypted release assets on a temporary staging release |
| shard plan | artifact | encrypted, staged with everything else |
| renderer jar | artifact | **artifact** — it is built from vendored public sources and holds no world data |
| final map | artifact on this repository, or Pages | encrypted release on the private repository |

The staging release is a prerelease created at the start of a run and deleted at the end,
including when the run fails. Its tag is derived from the run id as well as the label, so
two runs of the same world cannot collide and delete each other's assets halfway through.

This costs more than artifacts do: each shard downloads the world again from the private
repository rather than from GitHub's artifact store, so a thirty-way split fetches the
world thirty times. That is the price of the arrangement, and it is stated here rather
than hidden because on a very large world it is the dominant cost.

---

## The encryption

**AES-256-GCM.** The key is 32 bytes, lives only in an Actions secret, and is never
written into any file in either repository.

The authentication tag is the point rather than a detail. Unauthenticated encryption
would let a payload be altered in transit and still decrypt — into *different bytes*,
which would then be fed to a renderer as though they were a world. Every failure to
authenticate stops the run instead.

A payload is cut into parts of **50 MB**, each sealed on its own with:

- **its own random 96-bit IV**, never a counter derived from the index, because reusing an
  IV under one key is the single mistake that breaks GCM outright;
- **associated data binding it to its place** — the payload's opaque id, the part's index
  and its length — so swapping part 3 for part 7, or replaying part 3 of an older payload,
  breaks the tag rather than reassembling into something plausible;
- **its header stored alongside the ciphertext and authenticated**, so rewriting the
  header to match altered content fails too.

A sealed **manifest** accompanies the parts and records the count, each part's digest and
a digest of the whole. Per-part authentication proves each part is genuine; only the
manifest can prove that *all of them are here, in order, and belong to the same payload*.
That distinction is not academic — a dropped upload, a retry that leaves an older part
behind, and two runs writing to one place all produce sets of perfectly genuine parts that
do not belong together.

The manifest is written last, so a half-finished upload has no manifest and is refused
rather than mistaken for a complete payload.

> **50 MB is this transport's part size and nothing else.** It is not the release-asset
> size limit used when publishing a large *public* world, which is a different problem
> with a much larger number. Raising this one to match that one would put gigabyte
> buffers in every job on this path for no benefit.

### Everything fails closed

There is no path in this code that carries on with something unencrypted. Each of the
following stops the run with a message saying what happened:

| what went wrong | what happens |
| --- | --- |
| the key secret is not set | refused before anything is fetched, naming the variable |
| the key is not 32 bytes | refused, without printing the key or its length |
| a required secret is not set | refused in the first job, naming which |
| a part fails its authentication tag | refused; nothing is written |
| a part decrypts but is not the one the manifest describes | refused |
| a part is missing | refused, naming which of how many |
| the manifest is absent | refused as an incomplete payload |
| the reassembled payload's digest does not match | refused, and the partial output deleted |
| the input to seal is empty | refused, rather than producing a payload that renders nothing |

The partial-output deletion matters more than it looks. A three-quarters-written world
tar looks exactly like a world tar to every later step.

---

## Setting it up

### 1. Generate a key

```sh
openssl rand -hex 32
```

Keep it somewhere you will still have it in six months: it is the only thing that can open
the rendered map that comes back.

### 2. Add the secrets to this repository

| secret | what it is |
| --- | --- |
| `PRIVATE_WORLD_KEY` | the 32-byte key, as 64 hex characters or base64 |
| `PRIVATE_WORLD_REPO` | `owner/name` of the private repository |
| `PRIVATE_WORLD_TOKEN` | a token that can read releases from and create releases on that repository, and nothing else |
| `PRIVATE_WORLD_LABEL` | any string. Every opaque identifier is derived from it. It never appears in a log |
| `PRIVATE_WORLD_SOURCE_TAG` | the release tag in the private repository holding the sealed world |

Secrets are masked in logs, but do not rely on masking for the tag: derive an opaque one
with the CLI below and use that.

### 3. Seal the world on the private side

```sh
cd design
pnpm --filter "@material-bluemap/render-actions..." run build

export PRIVATE_WORLD_KEY=<the key>
export PRIVATE_WORLD_LABEL=<the label>

tar -cf world.tar -C /path/to/saves my-world
node packages/render-actions/dist/private/cli.js seal \
  --in world.tar \
  --out sealed \
  --label-env PRIVATE_WORLD_LABEL \
  --suffix source
```

That writes `sealed/<hash>.0000.bin`, `sealed/<hash>.0001.bin`, … and
`sealed/<hash>.manifest.bin`. Attach them to a release on the private repository:

```sh
tag=$(node packages/render-actions/dist/private/cli.js id \
  --label-env PRIVATE_WORLD_LABEL --suffix "source-release")
gh release create "$tag" --repo <owner/name> --title "World" --notes "Encrypted world."
gh release upload "$tag" --repo <owner/name> sealed/*
```

Set `PRIVATE_WORLD_SOURCE_TAG` to that `$tag`.

### 4. Run it

Actions → **Encrypted render** → Run workflow. The only inputs are the dimension and the
two sizing knobs; nothing that names anything.

### 5. Open the result

The run creates a release on your private repository whose tag begins `r-`. Download its
assets and open them with the same key:

```sh
gh release download <tag> --repo <owner/name> --dir sealed-map
node packages/render-actions/dist/private/cli.js open \
  --in sealed-map \
  --out map.tar \
  --label-env PRIVATE_WORLD_LABEL \
  --suffix "release|<the run id from the release notes>"
mkdir -p map && tar -xf map.tar -C map
```

Serve `map/` over HTTP. Opening `index.html` from the filesystem will not work, because
the webapp fetches its tiles.

---

## The CLI

`design/packages/render-actions/dist/private/cli.js`, kept deliberately separate from the
main `cli.js`: everything in it handles a key, and a separate entry point means the public
render path cannot grow a flag that takes one.

| command | what it does |
| --- | --- |
| `id` | derives an opaque identifier from the label, without touching any data |
| `seal` | encrypts a file into parts plus a manifest |
| `open` | verifies and decrypts parts back into the original file |
| `check` | proves the key and the required secrets are present before anything runs |

The label is passed as `--label-env <VAR>` rather than `--label <text>` so that it never
appears in a process list, which on a shared runner is readable. `--suffix` extends it
(`shard|3`, `release|<run id>`) so one secret label yields every identifier a run needs.

---

## Things this does not do

- **It does not hide that a render happened, or roughly how big the world is.** See the
  trust boundary above.
- **It does not protect the world from the machine rendering it.** It cannot.
- **It does not publish to Pages.** Publishing a private world's map to this repository's
  Pages site would make it public, which is the opposite of the point. If you want it on
  the web, serve the downloaded map yourself, behind whatever authentication you want.
- **It does not manage key rotation.** A world sealed with one key can only be opened with
  that key. If you rotate, re-seal.
- **It does not resume.** A failed run is a run to start again. The public path's resume
  machinery is not wired up here.

---

## Related

- [Rendering a world in GitHub Actions](./render-in-actions.md) — how the split, the merge
  and the verification work. All of it applies here.
- `design/packages/render-actions/src/private/` — the transport, with its tests.
- `.github/workflows/render-private-world.yml` — the workflow itself, commented.
