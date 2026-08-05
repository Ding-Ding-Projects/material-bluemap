/**
 * What Docker has, read the way a picker needs it: containers, volumes, and what each
 * container has mounted.
 *
 * Every function here takes a {@link CommandRunner} rather than assuming `docker` is on
 * this machine's PATH - the same seam `runtime/docker.ts` and `remote/ssh.ts` already use,
 * which is what lets this module answer identically for a local daemon and for one reached
 * over `sshCommandRunner(...)`. Nothing here reads a byte of a world; it only asks Docker
 * what it has, which is why a picker can call it on every screen open without downloading
 * anything first.
 *
 * The daemon-level questions - not installed, daemon down, refused, unusable - are answered
 * by {@link probeDocker} and mapped straight across rather than re-detected, so this module
 * cannot drift from the five states `runtime/docker.ts` already tests exhaustively.
 */

import { probeDocker, type DockerReport } from "../runtime/docker.js";
import { execFileCommandRunner, type CommandRunner } from "../runtime/command.js";
import * as failures from "./failure.js";
import type { DockerWorldFailure } from "./failure.js";

export type InventoryResult<T> =
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly failure: DockerWorldFailure };

export interface DockerContainerSummary {
    readonly id: string;
    readonly name: string;
    readonly image: string;
    /** Docker's own status line, e.g. "Up 3 hours" or "Exited (0) 2 days ago". */
    readonly status: string;
    readonly running: boolean;
}

export interface DockerVolumeSummary {
    readonly name: string;
    readonly driver: string;
}

export interface DockerMount {
    readonly type: "bind" | "volume" | "tmpfs" | "npipe" | string;
    /** The host path for a bind mount, or the mountpoint Docker reports for a volume. */
    readonly source: string;
    /** The volume's name, when `type` is `"volume"`. Null otherwise. */
    readonly volumeName: string | null;
    /** Where this is mounted inside the container. */
    readonly destination: string;
    readonly readOnly: boolean;
}

export interface DockerContainerDetail extends DockerContainerSummary {
    readonly mounts: readonly DockerMount[];
    readonly startedAt: string | null;
}

export interface DockerVolumeDetail extends DockerVolumeSummary {
    /** Where the volume's data lives on the daemon's own host. Rarely readable from here directly; see `resolve.ts`. */
    readonly mountpoint: string;
}

export interface DockerInventoryOptions {
    readonly runner?: CommandRunner;
    readonly docker?: string;
}

/** Turns an available {@link DockerReport} into the one failure code every caller checks for. */
function daemonFailure(report: DockerReport): DockerWorldFailure | null {
    switch (report.status) {
        case "available":
            return null;
        case "not-installed":
            return failures.notInstalled(report.message);
        case "daemon-unreachable":
            return failures.daemonUnreachable(report.message);
        case "refused":
            return failures.refused(report.message);
        case "unusable":
            return failures.unusable(report.message, report.detail);
    }
}

/** One JSON object per line, the shape every `docker ... --format {{json .}}` list prints. */
function parseJsonLines(stdout: string): Record<string, unknown>[] {
    const rows: Record<string, unknown>[] = [];
    for (const line of stdout.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed === "") continue;
        try {
            const parsed: unknown = JSON.parse(trimmed);
            if (typeof parsed === "object" && parsed !== null) rows.push(parsed as Record<string, unknown>);
        } catch {
            // A line Docker did not mean as JSON is skipped rather than failing the whole
            // list - a stray warning printed to stdout must not hide every container after it.
        }
    }
    return rows;
}

function text(value: unknown): string {
    return typeof value === "string" ? value : "";
}

/** Every container Docker knows about, running or not - a picker needs both. */
export async function listContainers(options: DockerInventoryOptions = {}): Promise<InventoryResult<readonly DockerContainerSummary[]>> {
    const runner = options.runner ?? undefined;
    const docker = options.docker ?? "docker";
    const report = await probeDocker({ ...(runner === undefined ? {} : { runner }), docker });
    const blocked = daemonFailure(report);
    if (blocked !== null) return { ok: false, failure: blocked };

    const run = runner ?? execFileCommandRunner;
    const output = await run(docker, ["ps", "-a", "--format", "{{json .}}"], {});
    if (!output.ok) {
        return { ok: false, failure: failures.unusable("Docker could not list containers.", firstLine(output.stderr)) };
    }

    const containers = parseJsonLines(output.stdout).map((row): DockerContainerSummary => {
        const status = text(row["Status"]);
        return {
            id: text(row["ID"]),
            name: text(row["Names"]),
            image: text(row["Image"]),
            status,
            running: /^up\b/i.test(status),
        };
    });
    return { ok: true, value: containers };
}

/** Every volume Docker knows about. */
export async function listVolumes(options: DockerInventoryOptions = {}): Promise<InventoryResult<readonly DockerVolumeSummary[]>> {
    const runner = options.runner ?? undefined;
    const docker = options.docker ?? "docker";
    const report = await probeDocker({ ...(runner === undefined ? {} : { runner }), docker });
    const blocked = daemonFailure(report);
    if (blocked !== null) return { ok: false, failure: blocked };

    const run = runner ?? execFileCommandRunner;
    const output = await run(docker, ["volume", "ls", "--format", "{{json .}}"], {});
    if (!output.ok) {
        return { ok: false, failure: failures.unusable("Docker could not list volumes.", firstLine(output.stderr)) };
    }

    const volumes = parseJsonLines(output.stdout).map(
        (row): DockerVolumeSummary => ({ name: text(row["Name"]), driver: text(row["Driver"]) }),
    );
    return { ok: true, value: volumes };
}

interface InspectMount {
    readonly Type?: unknown;
    readonly Source?: unknown;
    readonly Destination?: unknown;
    readonly Name?: unknown;
    readonly RW?: unknown;
}

interface InspectContainerJson {
    readonly Id?: unknown;
    readonly Name?: unknown;
    readonly Config?: { readonly Image?: unknown };
    readonly State?: { readonly Running?: unknown; readonly StartedAt?: unknown; readonly Status?: unknown };
    readonly Mounts?: readonly InspectMount[];
}

/** One container's mounts and running state, read fresh - never cached, because "is it running" is the safety question. */
export async function inspectContainer(
    id: string,
    options: DockerInventoryOptions = {},
): Promise<InventoryResult<DockerContainerDetail>> {
    const runner = options.runner ?? undefined;
    const docker = options.docker ?? "docker";
    const report = await probeDocker({ ...(runner === undefined ? {} : { runner }), docker });
    const blocked = daemonFailure(report);
    if (blocked !== null) return { ok: false, failure: blocked };

    const run = runner ?? execFileCommandRunner;
    const output = await run(docker, ["inspect", id], {});
    if (!output.ok) {
        if (/no such (container|object)/i.test(output.stderr)) {
            return { ok: false, failure: failures.containerNotFound(id) };
        }
        return { ok: false, failure: failures.unusable(`Docker could not inspect '${id}'.`, firstLine(output.stderr)) };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(output.stdout);
    } catch {
        return { ok: false, failure: failures.unusable(`Docker's answer for '${id}' was not the JSON it was asked for.`) };
    }
    const row = Array.isArray(parsed) ? (parsed[0] as InspectContainerJson | undefined) : undefined;
    if (row === undefined) return { ok: false, failure: failures.containerNotFound(id) };

    const mounts: DockerMount[] = (row.Mounts ?? []).map((mount) => {
        const type = text(mount.Type);
        return {
            type: type === "" ? "bind" : type,
            source: text(mount.Source),
            volumeName: type === "volume" ? text(mount.Name) || null : null,
            destination: text(mount.Destination),
            readOnly: mount.RW === false,
        };
    });

    return {
        ok: true,
        value: {
            id: text(row.Id) || id,
            name: text(row.Name).replace(/^\//, ""),
            image: text(row.Config?.Image),
            status: text(row.State?.Status),
            running: row.State?.Running === true,
            startedAt: (() => {
                const started = text(row.State?.StartedAt);
                // Docker reports the zero time for a container that has never run.
                return started === "" || started.startsWith("0001-01-01") ? null : started;
            })(),
            mounts,
        },
    };
}

interface InspectVolumeJson {
    readonly Name?: unknown;
    readonly Driver?: unknown;
    readonly Mountpoint?: unknown;
}

/** One volume's driver and mountpoint. The mountpoint is the daemon's own path, not necessarily this machine's - see `resolve.ts`. */
export async function inspectVolume(
    name: string,
    options: DockerInventoryOptions = {},
): Promise<InventoryResult<DockerVolumeDetail>> {
    const runner = options.runner ?? undefined;
    const docker = options.docker ?? "docker";
    const report = await probeDocker({ ...(runner === undefined ? {} : { runner }), docker });
    const blocked = daemonFailure(report);
    if (blocked !== null) return { ok: false, failure: blocked };

    const run = runner ?? execFileCommandRunner;
    const output = await run(docker, ["volume", "inspect", name], {});
    if (!output.ok) {
        if (/no such volume/i.test(output.stderr)) return { ok: false, failure: failures.volumeNotFound(name) };
        return { ok: false, failure: failures.unusable(`Docker could not inspect the volume '${name}'.`, firstLine(output.stderr)) };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(output.stdout);
    } catch {
        return { ok: false, failure: failures.unusable(`Docker's answer for volume '${name}' was not the JSON it was asked for.`) };
    }
    const row = Array.isArray(parsed) ? (parsed[0] as InspectVolumeJson | undefined) : undefined;
    if (row === undefined) return { ok: false, failure: failures.volumeNotFound(name) };

    return {
        ok: true,
        value: { name: text(row.Name) || name, driver: text(row.Driver), mountpoint: text(row.Mountpoint) },
    };
}

function firstLine(value: string): string | null {
    const line = value
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .find((entry) => entry.length > 0);
    return line === undefined || line === "" ? null : line;
}
