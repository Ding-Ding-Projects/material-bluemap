# Release workflow security boundary

The release job turns repository state, prior-job outputs and metadata from the public dim-sum
catalog into release notes and assets. Dynamic values cross into a shell only through explicit
environment mappings. The shell reads those variables inside double quotes and passes them to
data-only consumers; no Actions expression is inserted into executable script text.

## Behaviour

Three steps form the watched boundary: **Resolve dim sum code name**, **Compose release notes** and
**Publish**. `scripts/lint-workflows.mjs` names each step, every environment variable it accepts and
the exact Actions expression that may supply that variable. It also pins SHA-256 fingerprints of
each complete normalized `env` and `run` block. It rejects a missing or duplicated step, changed
provenance, a direct or multiline expression in script text, YAML anchor/alias indirection, an
unquoted read, and **any** reviewed-block change. The full-block fingerprint is the fail-closed
boundary: it catches indirect reads such as `printenv`, parameter indirection and a newly added line
without pretending a list of dangerous shell spellings can ever be complete.

The guard also scans every executable `run:` or `script:` region in the release job, irrespective
of its display name, and pins a SHA-256 fingerprint of the complete normalized release job. The
three named boundaries are therefore not an allowlist with gaps around it: inserting or renaming an
adjacent shell step fails, and a direct Actions expression in that step receives its own diagnostic.

`scripts/pick-dim-sum.mjs` treats catalog and release API responses as untrusted input. It checks
the expected object/array shapes, field types, per-field character sets and bounds, exact dish ID,
safe slug and filename shapes, release tag, asset size, and the exact public release-asset URL. The
English alternative-text boundary is 235 Unicode characters because that is the real maximum in
the current 2,866-record catalog; Traditional Chinese names retain their legitimate CJK
punctuation. Rejected content is never copied into its error message.

Before buffering a photo, the picker rejects an excessive `Content-Length` and enforces the same
50 MiB limit while reading the stream. It then parses every PNG chunk, validates every CRC, requires
the critical chunk order and a terminal zero-length `IEND`, checks supported IHDR methods, and
bounds dimensions. Indexed images may not declare more palette entries than their IHDR bit depth
can address. This is a chunk/CRC integrity proof, not a claim that pixel data was inflated by a
complete image decoder.

## Configuration

The watched inventory is deliberately hand-written in `scripts/lint-workflows.mjs`. Adding,
renaming or splitting one of the three release steps requires reviewing the complete changed
blocks, updating their expected bindings and replacing the stored step and complete-job fingerprints
with `stepFingerprint()` and `jobFingerprint()` values. A fingerprint update is a security review
decision, not a mechanical response to a red test. New dynamic values still need an exact `env:`
binding, a quoted data-only use, and negative fixtures for their context.

All 49 external action invocations in `ci.yml` and its `build-jars.yml` reusable workflow are pinned
to full commit SHAs. To update one, resolve the intended major tag from the action's official
repository with `git ls-remote <official-repository> refs/tags/v4`, review that commit and its
release, replace the SHA and update the exact per-file count in `ACTION_INVENTORIES`. The tests must
fail on a mutable tag before the new SHA is accepted.

The workflow defaults to `contents: read`; only the release job receives `contents: write`. Every
checkout in `ci.yml` sets `persist-credentials: false`, including the release checkout. The catalog
API may use the configured token for rate limits, but the public asset download never receives it.
The release job explicitly depends on the workflow-security job, so a failing root guard or
actionlint run blocks publication.

## Failure modes

- A workflow-boundary violation fails the early **Lint the workflow files** job before build or
  publication.
- Invalid or unavailable catalog metadata fails only the optional dish-resolution step. The release
  continues without a code-name photo and says so in its notes; it never substitutes another image.
- An excessive, truncated, structurally invalid or CRC-invalid photo is rejected before it becomes
  a release asset.
- `actionlint` 1.7.12 can deadlock on this Windows host when it feeds many script blocks to the
  Windows `shellcheck` process: its process bridge fills the child input before starting the child.
  Windows syntax-only `actionlint` plus direct shellcheck are supplementary. The authoritative
  combined proof runs on Linux, where actionlint invokes shellcheck normally.

## Security considerations

Environment variables prevent their contents from becoming shell grammar, but quoting alone is not
enough if a later line recovers the value through `printenv`, indirection or another execution
route. Exact whole-block fingerprints make that complete script the reviewed unit. Canonical inline
provenance bindings separately prevent a YAML alias from quietly swapping in a different source.

The picker emits only the five outputs the workflow consumes: English and Traditional Chinese
names, filename, English alternative text and catalog volume. Output values are already single-line
validated metadata; unused path, pronunciation and source-URL outputs were removed.

The packaged CLI jar, installer set and test-world archive carry SHA-256 records produced in their
own jobs and checked after the same-run artifact download. These checks prove that the bytes
survived that transport unchanged. They do **not** prove that a compromised producer emitted good
bytes: the producer job, pinned action code, repository source, vendored source and GitHub-hosted
runner remain the trust boundary.

## Verification

```bash
node --test scripts/lint-workflows.test.mjs scripts/pick-dim-sum.test.mjs
node scripts/lint-workflows.mjs
actionlint -no-color -oneline
```

The regression test reads the historical workflow files directly from Git. Commit `98988e3` must
fail at its original 11 direct-expression sites. The assigned baseline
`e13777927876a3d7898778f18193e9465bc97cc2` must fail at its exact 19 sites. The checked-in fixed
workflow must have zero findings, exact provenance and reviewed block fingerprints. Focused fixtures
also cover multiline expressions, YAML aliases, altered provenance, indirect `printenv`/parameter
execution, harmless block drift, an adjacent differently named shell step, all 49 immutable action
pins, release-gate dependency, real
235-character alternative text, malformed schema, control characters, unsafe Markdown contexts,
wrong asset origins, path containment, byte ceilings, corrupt CRCs, invalid PNG ordering and IHDR
combinations, oversized indexed palettes, truncation and false `IEND` markers.

### Suggested articles

- [GitHub-hosted cloud runners](./cloud-runners.md)
- [Changelog and the in-app changelog viewer](./changelog-viewer.md)
- [Large worlds and rendered maps](./large-worlds.md)
