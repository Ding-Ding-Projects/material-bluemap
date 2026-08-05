# syntax=docker/dockerfile:1
#
# The standalone BlueMap server CLI, containerised.
#
# Build from the REPOSITORY ROOT (one level above `design/`), not from this
# directory — the build needs both the pnpm workspace (`design/`) and the
# vendored upstream webapp bundle (`vendor/BlueMap/common/webapp/dist`, the
# same MIT-licensed static bundle `bluemap-cli -g` itself would otherwise need
# to be told about at run time; see `packages/cli/scripts/copy-webapp.mjs`):
#
#   docker build -f design/packages/cli/Dockerfile -t material-bluemap-cli .
#
# Render a world:
#
#   docker run --rm \
#     -v "$PWD/my-config:/data/config" \
#     -v "$PWD/my-world:/data/world:ro" \
#     material-bluemap-cli -c /data/config -r
#
# Serve what was rendered:
#
#   docker run --rm -p 8100:8100 \
#     -v "$PWD/my-config:/data/config" \
#     material-bluemap-cli -c /data/config -w
#
# Both in one run (render once, then keep serving the result):
#
#   docker run --rm -p 8100:8100 \
#     -v "$PWD/my-config:/data/config" \
#     -v "$PWD/my-world:/data/world:ro" \
#     material-bluemap-cli -c /data/config -r -w
#
# `-c /data/config`'s `maps/*.conf` `world` setting has to point at whatever
# path the world is mounted at inside the container (`/data/world` above) —
# this image cannot know that path for you, the same way upstream's own jar
# cannot. See packages/cli/src/config.ts's doc comment for the one sharp edge
# worth knowing here: a relative `world`/`data`/`web` path in the config
# resolves against the CONTAINER's working directory (this image sets it to
# `/app`), not against the config folder — mount an absolute path, or run with
# `--workdir /data` and point the config at a folder there.

###############################################################################
# Stage 1 — install and build only what @material-bluemap/cli needs
###############################################################################
FROM node:22-slim AS build

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# /repo/design is the pnpm workspace root; /repo/vendor is the upstream
# submodule copy-webapp.mjs reaches by walking up from its own script
# location — mirroring that exact relative layout is what lets the ordinary
# `pnpm run build` (no Docker-specific flags) find the webapp bundle here.
WORKDIR /repo

# The full workspace manifest set is copied (not just cli's own package.json)
# because pnpm needs every workspace member's package.json to resolve the
# --filter dependency graph and to honor the committed lockfile exactly —
# --frozen-lockfile refuses to run if the manifests and the lockfile disagree.
COPY design/package.json design/pnpm-lock.yaml design/pnpm-workspace.yaml design/tsconfig.base.json ./design/
COPY design/packages ./design/packages
COPY design/tools ./design/tools

# Only the CLI's own webapp source is needed, not the rest of the upstream
# webapp checkout (its own source, tests and 100+MB of its own node_modules) —
# copy-webapp.mjs only ever reads common/webapp/dist.
COPY vendor/BlueMap/common/webapp/dist ./vendor/BlueMap/common/webapp/dist

# --filter "@material-bluemap/cli..." installs the CLI and everything it
# actually depends on — never the Electron desktop app, the UI package, or
# their native/heavy build steps (electron's own binary download,
# better-sqlite3's native compile), which this standalone server CLI has
# nothing to do with. devDependencies (typescript itself) are needed here to
# actually run the build below; `pnpm deploy --prod` strips them back out of
# the final runtime copy further down, so this is not the last word on what
# ships. (Not split into a --prod pass followed by a dev pass: pnpm refuses to
# swap a --prod-installed node_modules for a fuller one non-interactively —
# "Aborted removal of modules directory due to no TTY" — so one install that
# already includes dev deps is the correct shape here, not a workaround.)
WORKDIR /repo/design
RUN pnpm install --frozen-lockfile --filter "@material-bluemap/cli..."

# Runs each dependency's own "build" script in dependency order (pnpm reads
# the workspace:* graph itself), then the CLI's own build, which — per its
# package.json — also runs scripts/copy-webapp.mjs, now able to find the real
# webapp bundle copied in above.
RUN pnpm --filter "@material-bluemap/cli..." run build

# `pnpm deploy` prunes the result down to exactly what @material-bluemap/cli
# needs at runtime: real (non-symlinked) copies of its own dist/ and of every
# workspace + external dependency it actually resolved, with devDependencies
# and every unrelated workspace package left out entirely. `--legacy`: pnpm
# v10's new default deploy strategy refuses outright unless the workspace
# opts in with `inject-workspace-packages=true`
# (ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE) — this workspace has not, and does
# not need to just to satisfy this one build step, so the flag pnpm's own
# error message names is the direct fix, not a workaround.
RUN pnpm --filter @material-bluemap/cli deploy --prod --legacy /app

###############################################################################
# Stage 2 — a slim runtime image with nothing but the Node runtime and /app
###############################################################################
FROM node:22-slim AS runtime

# Never root — but not a freshly created user either. The official node:22-slim
# image already ships an unprivileged "node" user at uid/gid 1000 for exactly
# this purpose (verified: `useradd --uid 1000` here fails with "GID '1000'
# already exists", because it does). Reusing it is more correct than masking
# that fact with a different uid, not just less code.
WORKDIR /app
COPY --from=build --chown=node:node /app ./

# The default config/data folder this image expects to be bind-mounted onto;
# created (and owned by the unprivileged user) so a first run does not fail
# trying to create it under a read-only or unmounted /data.
RUN mkdir -p /data/config /data/world && chown -R node:node /data
VOLUME ["/data/config"]
# Mount the actual world read-only at whatever path the config's own
# maps/*.conf "world" setting names — see the top-of-file usage notes. This
# declared volume is the documented default, not an enforced restriction.
VOLUME ["/data/world"]

USER node
WORKDIR /data
EXPOSE 8100

ENTRYPOINT ["node", "/app/dist/index.js"]
# No arguments by default: matches upstream's own "no actions -> write
# default configs, print help, exit 1" behaviour (see cli.ts) rather than
# guessing what the caller wants. A real run always passes at least -c.
CMD ["--help"]
