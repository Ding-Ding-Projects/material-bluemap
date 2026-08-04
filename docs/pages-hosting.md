# Publishing a rendered map to GitHub Pages

A finished render is served by this application at `http://127.0.0.1:<port>/local/<renderId>/`.
That address works for exactly one person, on exactly one machine, for exactly as long as the
machine is switched on. This feature turns it into a GitHub Pages site: a real address anybody
can open, hosted by somebody else, free, and still nothing but files.

The screen is the **Publish to Pages** tab. Its main-process half is
`design/packages/app/src/main/pages/`, its renderer half is
`design/packages/ui/src/components/pages/`, and the piece both of them stand on is
`prepareStaticHost` in `design/packages/render-actions/src/pages/staticHost.ts`.

## The fact the whole feature rests on

BlueMap's engine stores hires tiles gzip-compressed: the file on disk is `0.prbm.gz`, and the
map's texture data is `textures.json.gz`. The viewer, by default, asks for `0.prbm` and
`textures.json` without the suffix, because BlueMap's own web server answers the uncompressed
name out of the compressed file. So does this application's embedded server, which is why a map
looks perfect locally and then 404s on every tile the moment it is copied anywhere else.

GitHub Pages does not rewrite anything. It serves the files that exist, under their real names,
and 404s the rest. There is no configuration and no `.htaccess`, which is the entire point of it.

The fix is one flag: `clientDecompression: true` in the web app's own `settings.json`. With it
set, the viewer appends `.gz` to both names and inflates the bytes itself with
`DecompressionStream("gzip")`. `prepareStaticHost` sets that flag, and then **verifies it against
the files that are actually on disk**, because a flag that points the viewer at files nobody
wrote is exactly as broken as the problem it fixes.

The same module also writes an empty `.nojekyll`, without which Pages runs the site through
Jekyll and drops every path whose name starts with an underscore.

`docs/render-in-actions.md` covers the same trap from the CI side, where the render workflow
prepares a Pages copy of the merged map. Both routes call the same function.

## Behaviour

### Preflight, which changes nothing

`pages:preflight` runs `prepareStaticHost` with `write: false` and reads the target repository.
It writes nothing at all: the flag is not flipped, `.nojekyll` is not created, and the marker
described below is not written. It reports:

- the site's total size and file count, which is what the decision actually turns on;
- whether the site is over the **1 GB** GitHub asks Pages sites to stay under (a warning);
- any single file over the **100 MB** GitHub refuses outright (a blocker);
- any map missing the files the viewer will ask for once the flag is on (a blocker);
- what `gh` is on this machine, as three separate situations rather than one dead end;
- whether `git` is on `PATH` at all;
- whether the repository exists, whether this account can write to it, whether it is private,
  and **whether the publishing branch already exists and carries this application's marker**.

Publishing is refused when `blockers` is non-empty. The screen disables the button and shows the
reason; the main process refuses again on its own, because a guard that lives only in the
renderer is not a guard.

### Publishing

1. **Prepare.** `prepareStaticHost` with `write: true`. A map that is not servable stops here.
2. **Check.** `gh` and `git` are probed again, the repository is created if it does not exist,
   and the publishing branch is read for the marker.
3. **Stage.** Files are added to the index in batches of 2,000, handed to `git add` on stdin,
   NUL-separated, so progress is reported as files staged out of files total. Tens of thousands
   of small files is the ordinary case, and a bare spinner over it is indistinguishable from a
   hang for several minutes.
4. **Push.** An orphan commit is force-pushed to the publishing branch, then the branch is read
   back from GitHub and its head compared to the commit that was just made. `pushVerified` is
   false when they do not match, and the report says so rather than claiming the push landed.
5. **Enable.** `POST /repos/{owner}/{repo}/pages` with the branch as the source, or `PUT` when a
   site already exists and points somewhere else.
6. **Wait.** `GET /repos/{owner}/{repo}/pages` is polled until GitHub reports `built`.
7. **Verify.** The published URL is fetched. **`status` becomes `live` only when that request
   answered `200`.** "GitHub says built" and "a browser can open it" are two different claims,
   and a first build routinely reports built a minute before the address resolves.

### Why the publishing branch is replaced rather than added to

Every publish is an orphan commit and a force-push. A republished map is a replacement, not a
revision of the last one, and keeping the history of a million tiles would grow the repository
without bound for no benefit anybody would ever use.

That makes the feature capable of destroying a website, so it is guarded:

> Every publish writes `.material-bluemap-map.json` at the site root, naming this tool, the
> render and the map ids. Before anything is pushed, **and again before anything is deleted**,
> the target branch is read. If the branch exists and does not carry that marker, the operation
> is refused.

This is the one guard in the feature with no fallback and no override. One mistyped repository
name would otherwise replace somebody else's site.

### Where the git directory lives

There is never a `.git` inside a render's output. The repository lives under the application's
own data directory, at `<userData>/pages-hosting/<renderId>/.git`, and every git command names it
explicitly:

```
git -C <webRoot> --git-dir=<workDir>/.git --work-tree=<webRoot> ...
```

Copying the tile tree into a staging directory first was rejected on arithmetic rather than
taste: a rendered map is routinely several gigabytes across tens of thousands of files, and
copying it doubles both the disk it needs and the time before anything is pushed, to produce a
byte-for-byte duplicate of a directory that is already there. Git never writes into a work tree
during `add`, `commit` or `push`, so the only things this puts into the render output are the
marker file and the two additive changes `prepareStaticHost` makes.

### Stopping

Taking a site down disables Pages and deletes the publishing branch. That is the map gone from
the internet, so it sits behind the application's super-confirmation gate: two independently
operated keys and a full-range slider, exactly as every other destructive action does. See
[Super confirmation](./super-confirmation.md).

The marker is re-read at the moment of deletion rather than trusted from a preflight that ran
minutes earlier, because the interesting failure is somebody typing a different repository name
in between.

## Configuration

| Setting | Where | Default |
|---|---|---|
| Publishing branch | On the screen | `gh-pages` |
| Repository visibility | On the screen | `public`, and only used if the repository has to be created |
| Owner | On the screen | The `gh` account, or an organisation it can write to |
| Work directory | Fixed | `<userData>/pages-hosting/` |
| Build poll | Fixed | Every 5 s, up to 60 attempts |

A branch name that is not `[A-Za-z0-9][A-Za-z0-9._-]{0,99}`, or that contains `..`, falls back to
`gh-pages` rather than becoming part of a URL path or a ref it was not meant to be.

## Failure modes

| What happens | What is reported |
|---|---|
| A map is missing `textures.json.gz` or its `tiles/` | Blocked before anything is pushed, naming the map and the files |
| A file is over 100 MB | Blocked; GitHub cannot accept it at all |
| The site is over 1 GB | A warning, not a refusal; GitHub may throttle or refuse |
| The branch exists with no marker | **Refused**, with the branch named. Nothing is pushed and nothing is deleted |
| `gh` is not installed | Blocked, pointing at cli.github.com |
| `gh` is signed out | Blocked, naming `gh auth login` and saying it has to be run in a terminal |
| `git` is not on `PATH` | Blocked; publishing is a push |
| Pages refused on a private repository | Reported as needing a paid plan, which is what a free account's 403 actually means |
| GitHub's Pages build errors | Reported as `errored`; the repository's Pages settings page carries the reason |
| The build finishes but the URL does not answer | Reported as `built` and **not** as live, with the HTTP status |
| The push exits zero but GitHub does not show the commit | `pushVerified: false`, said out loud |

## Security considerations

- **No token is read, held, logged or passed as an argument.** `--show-token` is never passed and
  no `GH_TOKEN` is set. Authentication for the API is `gh api`; authentication for the push is
  git's own `credential.helper` mechanism pointed at `gh auth git-credential` for that one
  command, passed with `-c` so the person's global git config is never modified.
- **`gh auth login` is never driven from the application.** It suppresses its device-code prompt
  when stdin is not a terminal, so a spawned copy prints nothing and hangs for ever. The feature
  names the command and re-probes afterwards.
- **Every command is spawned with an argument array and never through a shell**, so nothing in a
  repository or branch name can become part of a command line.
- **Publishing is publication.** A public repository means every tile, marker and coordinate in
  the map can be downloaded by anybody who finds the address. The screen says so as a warning
  before the button, and the acknowledgement tick box is never pre-ticked.
- **Pages on a private repository needs a paid GitHub plan.** That is said plainly at preflight
  rather than discovered as a 403 after several gigabytes have been pushed.

## Verification

What has been proved, and by what:

- `prepareStaticHost` is proved against a **real** map on a **real** Pages site. A map rendered in
  CI was published to `DingDingChae/bluemap-pages-proof`; the tile
  `maps/tiny/tiles/0/x0/z0.prbm.gz` returned `200` with `content-type: application/gzip`, no
  `Content-Encoding`, and first bytes `1f8b`. The same tile without `.gz` returned `404`. The
  BlueMap web app loaded from Pages, read `settings.json`, entered the map and rendered geometry
  in a headless browser. The flag is genuinely load-bearing.
- The main-process feature is covered by 35 tests in
  `design/packages/app/src/main/pages/hosting.test.ts` and `ipc.test.ts`, against a fake process
  runner. **No test spawns a real `git`, a real `gh`, or a network call**, deliberately: the
  cases worth testing are `gh` missing, `gh` signed out, a branch somebody else wrote, a push
  GitHub does not show, a build that errors and a URL that answers 404, and none of those can be
  produced on a machine where the whole thing works.
- The renderer half is covered by 32 tests in
  `design/packages/ui/src/components/pages/`, including the mounted screen: the disabled button
  and its stated reason, the refusal on a foreign branch surviving a ticked acknowledgement, the
  render list filtered through the shared search field, and the super-confirmation gate really
  standing between the button and the deletion.
- The screen is in the screenshot harness as a **required** surface, so a run that cannot open it
  fails rather than recording a gap.

What has **not** been proved:

> The desktop publish path has never been run end to end against a real GitHub account from the
> application. Every step is unit-tested against a fake process runner, and the static-host
> preparation it depends on is verified against a real published site, but the sequence
> `gh repo create` → orphan push → `POST /pages` → poll → fetch has not been executed against
> github.com from this application on a real machine. Until it has, treat the feature as
> implemented and unproven rather than as verified, and see `HANDOFF.md` for what that would take.

```
pnpm exec vitest run packages/app/src/main/pages packages/ui/src/components/pages
```

## Related

- [Rendering a world in GitHub Actions](./render-in-actions.md) - the other route to a Pages
  copy, where the runners render and the merge job prepares the site.
- [Super confirmation](./super-confirmation.md) - the gate in front of taking a site down.
- [Large worlds and rendered maps](./large-worlds.md) - what to do when a map is past a limit.
