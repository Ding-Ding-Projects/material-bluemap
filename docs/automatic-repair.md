# Automatic repair when a render or the web server fails to start

When a run fails, the app collects what was actually observed and tries to say why. It does that
in two halves, and the order between them is the whole safety of the feature:

1. **Deterministic diagnosis first.** Every failure this project knows the shape of is decided by
   code, from the evidence, with no language model involved anywhere.
2. **A local coding agent only for what is left** — and only if one is installed and the user has
   switched it on — inside guardrails that refuse anything outside a narrow set of files.

If the first half explains the failure, the second half is **not reached at all**. A model asked
"why did this fail?" always answers, and an answer is not the same thing as a cause; for a port
that is already in use there is nothing to gain from asking and a config file to lose.

## The evidence

Assembled at the moment of the failure, because most of it stops being true afterwards:

- the exit code, the signal, and any spawn error (`ENOENT` and friends)
- the last lines of stderr and every `WARNING`/`ERROR` the log reader kept
- upstream's multi-line "problem with your BlueMap setup" banners
- **the config that was in force then**, not after somebody edited it
- which Java ran it and which feature version this app requires
- what Docker was doing, when the run was containerised
- the port a web server tried to bind, the output folder, and each world folder
- the exact command and arguments

### Credentials never leave that record intact

A config folder can hold database credentials: `storages/*.conf` carries a JDBC URL and a
`connection-properties` block with a user name and a password. The evidence is shown on screen,
copied into bug reports, and — when the deterministic half comes up empty — put into a prompt for
a local agent that may send it to whatever model it is configured to use.

So masking happens **on the way in**, not on the way out: every config file is redacted as the
record is built, so nothing downstream can hold an unmasked copy even by accident. Keys are kept
and values replaced, which is all a diagnosis needs — "the password is set" and "the password is
`hunter2`" are the same fact for every purpose here. URL user-information and JDBC query strings
are masked too, because that is the other place a password hides.

## The failures decided without any AI

Each pattern below is quoted from the vendored BlueMap source that prints it, so the claim can be
checked and an upstream bump can be checked against it.

| Diagnosis | Recognised from | What is offered |
|---|---|---|
| `download-not-accepted` | the engine's own `You must accept the required file download…`, or the parsed consent signal | the Settings row that accepts it |
| `port-in-use` | `BlueMap failed to bind to the configured address` / `already in use by some other program` / `java.net.BindException` / Docker's `port is already allocated` | retry on a port the operating system picks |
| `java-missing` | a spawn `ENOENT` on a local run, `'java' is not recognized…`, `java: command not found` | the Java runtime setting |
| `java-too-old` | `UnsupportedClassVersionError`, `class file version …`, **or** the reported version being below the required feature version before anything was printed | a newer runtime, or a container, which supplies one |
| `world-unreadable` | `'<path>' does not exist or is no directory!`, `Failed to load world …` | the world-folder setting, with a container-specific sentence about read-only sharing |
| `output-not-writable` | `AccessDeniedException`, `Read-only file system`, `No space left on device`, attributed to the output folder rather than the config folder | the map-storage setting, and a different sentence for a full disk |
| `out-of-memory` | `java.lang.OutOfMemoryError`, `Could not reserve enough space for object heap`, **or exit code 137**, which is what a container gets when it passes its memory limit and prints nothing at all | retry with a larger heap |
| `config-rejected` | `BlueMap failed to parse this file:` / `Failed to load map-config:` / `BlueMap tried to read this file, but can not access it:` | restore the config folder's last working revision, or fix the file the engine named |

Two more exist for the container path: `docker-unavailable` (with the honest distinction between
not installed and not running, so nobody is told to install Java when Docker was what was
missing) and `docker-image-unavailable`.

More than one can be true at once, and all of them are reported rather than a winner being
picked. Every diagnosis quotes the evidence line it was decided from — never a paraphrase,
because a diagnosis a person cannot check is one they have to take on trust from something that
is about to offer to change their files.

**A cancelled run is diagnosed as nothing.** Cancelling is a decision, not a fault, and offering
to repair it would be offering to repair a decision.

**An unrecognised failure stays unexplained.** A pattern that stops matching after an upstream
change degrades to "I could not work out why", which is the correct failure mode — not matching
something else by accident.

## The coding agent, and everything it may not do

Reached only for a failure nothing above matched, only when the setting is on, and only when
`opencode` is on the account's `PATH`. Absence is reported as an ordinary fact; the app works
without it and the only thing lost is the last resort.

The prompt states the rules in words, and the same list is what the code enforces — the two are
built from one constant so they cannot drift:

- **Nothing inside the Minecraft world folder**, or anywhere outside this run's config folder.
- **No deletion of any file or folder, anywhere, for any reason.**
- **No git**: no commit, checkout, branch switch, reset, rebase, revert, stash, clean, push,
  force-push, or history rewriting of any kind.
- **No sending the config, logs or paths anywhere**: no HTTP request, upload, paste service,
  issue or telemetry.
- No installing or removing software; no starting or stopping the app, a render, the web server,
  Docker or a container.
- **No inventing a cause.** If the evidence does not say why, the answer is "I do not know".

The words are a courtesy, because an agent told the rules is likelier to follow them. The
enforcement is the guard, which every proposed edit passes through before a file is opened:

- the path must resolve inside **this run's config folder** — absolute paths are accepted only
  when they genuinely are, and are then reduced to a relative name so there is one check rather
  than two;
- the file must be one BlueMap loads as config: `core.conf`, `webapp.conf`, `webserver.conf`,
  `plugin.conf`, `maps/<name>.conf`, `storages/<name>.conf`, in either supported spelling — the
  same set the options editor writes, checked by the same function;
- a deletion is refused as a category;
- anything inside a world folder is refused explicitly, even though the folder rule already
  excludes it;
- a file named twice in one repair has **no** version written, rather than letting whichever the
  agent emitted last silently win.

A refusal never fails the batch: an agent that proposes one good edit and one that reaches
outside the folder has still worked something out. Every refusal is reported in full beside what
was applied, so nothing is silently dropped.

## Doing nothing is a correct outcome

Five different results all mean "nothing was changed", and they are reported differently because
they suggest different next steps:

- the failure was explained deterministically, so no agent was consulted;
- automatic repair is switched off;
- no coding agent is installed;
- the agent answered `"cause": null` — it did not know either;
- the agent answered in prose, or everything it proposed was refused.

"I could not work out why this failed" costs a person one sentence. A confident wrong edit costs
them a config file and their trust in the feature.

## Every change is recorded and shown

Before a file is written it is read, so the change can be shown as a **unified diff** — the
format every developer already reads and which pastes into an issue unchanged. After the writes,
the config folder's own [local version history](./config-history.md) is asked to snapshot it, so
the automatic change is an ordinary revision that can be restored, and that restore undone in
turn, exactly like any change a person made.

A file whose proposed contents are byte-identical to what is already there is not written and not
recorded: a row in the history panel for an event that did not happen makes the real events
harder to find. A history write that fails never undoes the repair that succeeded — the change is
kept and the failure is reported, the same rule the history layer states for a person's own save.

## Failure modes

| What happens | What the app does |
|---|---|
| The agent is not installed | says so plainly; the deterministic diagnosis is still complete |
| The agent cannot be run | reports the reason; nothing is changed |
| The agent answers in prose | refuses the reply whole rather than inferring an edit from it |
| The agent answers with invalid JSON | the same |
| The agent proposes a deletion | refused by name, and the person is told it was asked for |
| The agent proposes a path outside the folder | refused, with the path, and nothing is written |
| A write fails | reported per file; the other files still applied |
| The history cannot be recorded | the change is kept and the report says it cannot be undone from the panel |
| The pass itself throws | it does not: every step's failure is a field in the result |

## Security considerations

- The evidence a repair works from is put in place by the main process at the moment of failure.
  The renderer names a failure by id and never describes one — otherwise whatever runs in that
  window would choose the config folder a repair writes into and the world folders it is told to
  keep away from.
- Config text is masked before it is stored, before it is displayed and before it reaches a
  prompt.
- The agent is invoked with the prompt as a single argv element and no shell, so nothing in a
  path or a log line can become a second command.
- The agent is opt-in. Handing a failure report — even a masked one — to a program that may send
  it to a model is a decision somebody makes once, knowingly, not something that happens because
  a render failed.
- The repair pass has no network, no process and no git channel of its own. It reads and writes
  config files and nothing else.

## Verification

`design/packages/app/src/main/repair/` carries 102 tests, none of which need `opencode` installed:

- `diagnose.test.ts` — every failure class above, in and correct diagnosis out, including both
  wordings of a port conflict, Java 8's version spelling not being read as version 1, the exit-137
  container kill that prints no Java error, several causes at once, and the two cases that must
  yield **nothing**: a cancelled run and an unrecognised exception.
- `guardrails.test.ts` — deletion, traversal, absolute paths outside the folder, a file inside a
  world, a non-config file, a config file in a folder BlueMap does not read, an oversized file,
  and a file named twice.
- `pass.test.ts` — that the agent is never consulted for an explained failure, that "I do not
  know" is accepted, that a refused edit writes nothing while a good one beside it still applies,
  that the diff and the history record are produced, and that a failed write or a failed history
  write is reported rather than hidden.
- `agent.test.ts` — detection when absent, the prompt naming every prohibition, and a reply parser
  that refuses prose.
- `evidence.test.ts` — credentials masked in every place they hide, and never present anywhere in
  the serialised record.
- `diff.test.ts`, `ipc.test.ts` — the diff's hunks and counts, and that no channel rejects.

## Suggested articles

- [Running the engine on this computer, or in a container](./docker-and-local.md) — the two ways a
  run can be started, and the container-specific failures the repair pass recognises.
- [Local version history for config folders](./config-history.md) — where an automatic change is
  recorded, and how it is undone.
- [Renders that survive being interrupted](./resumable-renders.md) — what happens to a render that
  started and then stopped.
