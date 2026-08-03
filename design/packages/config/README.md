# `@material-bluemap/config`

BlueMap's configuration, modelled well enough to generate an options GUI from and
to hand back to the real Java CLI.

Three things live here.

1. **A schema per config file.** Every field carries its real default, its
   bounds, upstream's own documentation, the control a GUI should render for it,
   the group it belongs to, and whether changing it invalidates tiles that are
   already rendered.
2. **A HOCON reader and writer that round-trip.** Editing one setting in a
   generated file leaves the other forty settings, and all of the comments that
   explain them, exactly where they were.
3. **The CLI's flag list**, modelled well enough to express a run without anybody
   opening a terminal, including which flags quietly cancel each other out.

Everything is derived from the vendored upstream source at `vendor/BlueMap`, and
the tests check it against that source rather than against another copy of
itself.

---

## What it covers

| File | Descriptor | Fields | Java class |
| --- | --- | --- | --- |
| `core.conf` | `coreConfigDescriptor` | 10 | `CoreConfig` |
| `webapp.conf` | `webappConfigDescriptor` | 19 | `WebappConfig` |
| `webserver.conf` | `webserverConfigDescriptor` | 8 | `WebserverConfig` |
| `plugin.conf` | `pluginConfigDescriptor` | 12 | `PluginConfig` |
| `maps/<id>.conf` | `mapConfigDescriptor` | 31 | `MapConfig` |
| `storages/<id>.conf` (file) | `fileStorageDescriptor` | 4 | `FileConfig` + `StorageConfig` |
| `storages/<id>.conf` (sql) | `sqlStorageDescriptor` | 8 | `SQLConfig` + `StorageConfig` |

Plus the five render-mask shapes (`box`, `circle`, `ellipse`, `polygon`, `blur`)
in `MASK_SHAPES`, and all 17 CLI flags in `CLI_FLAGS`.

`schema.test.ts` reads the field declarations straight out of the vendored Java
files and asserts that this package models **every** field on those classes, with
**no** field this package invented, and with **every default equal**. That test is
what makes the table above a claim rather than a hope.

### Settings upstream does not advertise

Ten fields exist on the Java config classes and appear in none of upstream's
templates. They work; they are just undiscoverable. Each is modelled with
`hidden: true` so a GUI can put them behind an "advanced" disclosure rather than
pretending they do not exist:

`webserver.ip`, `map.loader`, `map.min-inhabited-time-radius`,
`map.check-for-removed-regions`, `map.hires-tile-size`, `map.lowres-tile-size`,
`map.lod-count`, `map.lod-factor`, `storage-file.atomic`, `storage-sql.dialect`.

### Where the template and the Java class disagree

Several defaults differ between the Java field and what a freshly generated file
actually contains — `edge-light-strength` is 15 in `MapConfig.java` and 8 in the
template, `cave-detection-ocean-floor` is 10000 and -5. Showing only one of them
would mislead somebody, so `FieldMeta.default` is the Java default and
`FieldMeta.templateValue` records what the generated file says and why.

---

## What it does **not** model, and why

**Marker contents.** `marker-sets` is modelled down to the marker *set* — its
`label`, `toggleable`, `default-hidden` and `sorting` — and the markers inside it
pass through untouched as opaque values. Marker shapes (POI, line, shape, extrude,
html, player) belong to the markers contract, which another part of this project
owns; modelling half of them here would produce an editor that silently dropped
the fields it did not know about. A marker set edited through this package keeps
every marker it had.

**HOCON substitutions, `include`, and `+=`.** The reader refuses all three by
name, with the line number, rather than guessing. Resolving a substitution
wrongly would corrupt somebody's config, and a config editor that corrupts
configs is worse than no config editor. A file using them has to keep being
edited by hand. Nothing upstream generates uses any of them.

**Unexpanded templates are not parseable, by design.** BlueMap's template
placeholder syntax `${name}` is also HOCON's substitution syntax, so
`CONFIG_TEMPLATES.core` cannot be read as HOCON until it has been expanded. Use
`ConfigTemplate` (or `generateConfigSet`) first. This is upstream's arrangement,
not ours.

**Very large integers.** `min-inhabited-time` is a Java `long`. JavaScript numbers
hold integers exactly only up to 2^53, so a value beyond that would lose
precision. In practice an inhabited-time threshold is a tick count in the
thousands, so this has never mattered, but it is a real limit rather than a
hidden one.

**`Double.MAX_VALUE` defaults.** The circle and ellipse masks default their radii
to Java's `Double.MAX_VALUE`, meaning "no limit". Writing that value back out
produces `1.7976931348623157e+308` in the file, which parses correctly but reads
like a mistake. Prefer omitting the key and letting the default apply.

**One upstream quirk is modelled rather than fixed.** `storageType` is declared on
the abstract `StorageConfig` base with a default of `bluemap:file`, and
`SQLConfig` inherits it. An SQL storage config that omits `storage-type` is
therefore loaded as a *file* storage. This package records the Java default
honestly and always writes the key, and the field's documentation says so.

### The controls a GUI has to be able to render

`FieldMeta.control` is a discriminated union on `kind`. The full set is
`switch`, `number`, `slider`, `text`, `path`, `select`, `color`, `vector`,
`list`, `key-value`, `mask-list` and `marker-sets`. Anything that renders a
`FieldMeta` has to handle all twelve, because every one of them is used by at
least one real setting. (The colour control is spelled `color` to match the
config keys it edits, `sky-color` and `void-color`.)

### `invalidatesTiles` is the warning before the click

`invalidatesTiles` is true when changing a value makes tiles that are already
rendered wrong, so the GUI can say "saving this re-renders the map" **before**
somebody saves rather than afterwards. Eighteen of the map config's fields are
marked, and `invalidationNote` carries upstream's own qualification where it has
one — switching `enable-hires` *on* forces a re-render while switching it off
does not, and changing the render mask deletes the tiles outside the new limits
instead of re-rendering everything.

Four of those eighteen are marked on our judgement rather than upstream's
wording, and each says so in its `invalidationNote`: `edge-light-strength`,
`ignore-missing-light-data`, `core.scan-for-mod-resources` and the storage
`compression` fields. A spurious re-render warning costs a person some time; a
missing one costs them a map that is quietly wrong.

---

## Consent is not a setting

`core.accept-download` is Mojang EULA acceptance, not a checkbox. It is modelled
with `consentGated: true` so no generated settings screen renders it as an
ordinary switch.

The app already has this: `packages/app/src/main/consent.ts` persists the
decision and the preload exposes `readConsent`, `acceptDownload`,
`revokeDownloadConsent`, `needsFirstRun` and `completeFirstRun`. Asked once at
first launch, remembered forever, never asked again. This package never flips the
value; it only describes the field, and `resolveCliActions` reminds the caller
that a render needs it.

`storage-sql.connection-properties` is marked `secret: true` for the same kind of
reason: it usually holds a database password, and a value marked secret must
never reach a log, an exported diagnostic, or an issue comment.

---

## Using it

### Reading a file the CLI generated

```ts
import { descriptorFor, parseConfigText } from "@material-bluemap/config";

const result = parseConfigText(descriptorFor("core"), await readFile(path, "utf8"));

result.value;    // fully defaulted, typed CoreConfig, or null if it failed
result.issues;   // unknown keys, legacy keys, bad values, advisories
result.document; // keep this: it is what you edit and write back
```

Parsed values use the file's own kebab-case keys (`config["accept-download"]`),
not camelCase, so what you read and what is in the file are the same thing.

### Changing one setting without wrecking the file

```ts
import { parseHocon, setPlainValue, writeHocon } from "@material-bluemap/config";

const document = parseHocon(text);
await writeFile(path, writeHocon(setPlainValue(document, ["update-cooldown"], 120)));
```

A key that is currently commented out (`#start-location: "..."`) is re-added
directly beneath its own example rather than appended to the bottom, so the
setting lands where its documentation already is.

### Generating a config folder

```ts
import { generateConfigSet } from "@material-bluemap/config";

for (const file of generateConfigSet({ webroot, dataFolder, world, version })) {
    // file.path is relative to the config folder; file.text is ready to write
}
```

**Always pass absolute paths.** The CLI resolves the storage root and the data
folder against its *working directory*, not the config folder. Getting that wrong
is how a render writes 47 MB of tiles into whatever directory the app happened to
be launched from.

### Expressing a CLI run

```ts
import { buildCliArgs, formatCliCommand, resolveCliActions } from "@material-bluemap/config";

const invocation = { ...EMPTY_INVOCATION, configFolder, render: true, watch: true };
buildCliArgs(invocation);              // ["-c", "...", "-r", "-u"]
formatCliCommand(jarPath, invocation); // the whole command, for showing and copying
resolveCliActions(invocation);         // what it will actually do, and what it will not
```

`resolveCliActions` exists because the flags are not independent. `-r`, `-f`, `-u`
and `-e` all take the render branch, and inside it `-g` stops meaning "generate
the web app" and starts meaning "regenerate it as part of the render", while
`--markers` and `-s` are never reached. A GUI with plain checkboxes and no model
of that will confidently promise things the run does not do.

---

## Verification

```
cd design
npx tsc -p packages/config/tsconfig.json --noEmit       # sources
npx tsc -p packages/config/tsconfig.test.json --noEmit  # sources and tests
npx eslint packages/config
npx vitest run packages/config
```

What the 174 tests actually prove:

- **Byte-for-byte round trip.** All eight files a real `java -jar cli.jar -c <dir>`
  run produced are parsed and re-written with not one byte moved, comments,
  blank lines, inline objects, trailing commas and all.
- **Byte-for-byte generation.** `generateConfigSet` reproduces those same eight
  files exactly, from the embedded templates.
- **Defaults match the Java classes.** Field lists and defaults are extracted
  from the vendored `.java` files at test time and compared. The test also
  asserts which fields the Java reader could not resolve, so it cannot silently
  degrade into checking nothing.
- **The flag list matches the jar.** Parsed out of a captured `--help`, including
  each flag's exact description text.
- **The real Java CLI reads what this package writes.** `javaRoundTrip.test.ts`
  generates a config folder, edits it through this package's own reader and
  writer, runs the actual `cli-*-shadow.jar`, and reads back the `settings.json`
  the Java side produced to confirm the edited values arrived. It is skipped, not
  failed, when there is no jar or no JVM.

To run the Java round trip from a clean checkout:

```
cd vendor/BlueMap
GRADLE_USER_HOME=tools/oracle/.gradle ./gradlew :cli:shadowJar
cd ../../design
npx vitest run packages/config/test/javaRoundTrip.test.ts
```

Or point it at a jar elsewhere with `BLUEMAP_CLI_JAR=/path/to/cli-shadow.jar`.

### Fixtures

`test/fixtures/cli-generated/` is the config folder the real CLI wrote, copied
unmodified. `test/fixtures/cli-help.txt` is the real `--help` output, with only
its line endings normalised to LF. Neither was written by hand.

### Keeping the embedded templates honest

The seven templates are embedded as TypeScript strings because the app ships
without the vendored Java tree beside it. They are copied by a script, never by
hand, and a test compares every one against the vendored file byte for byte
whenever that tree is present:

```
node design/packages/config/scripts/sync-templates.mjs
```
