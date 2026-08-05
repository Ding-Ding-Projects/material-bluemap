/**
 * The machines somebody has told this application about, and the form for adding one.
 *
 * ## There is no password field, and there is nowhere to put one
 *
 * That is the design of the whole remote path, restated on this side of the bridge because
 * this is where a field would get added. A {@link RemoteTargetDraft} holds a host, a port,
 * a user name, and the **path** to a key file that this application never opens. That is
 * everything. Authentication is an SSH agent, or a key that stays exactly where it is.
 *
 * A password that exists somewhere is a password that ends up in a settings file, a log
 * line, a crash report or a screenshot, so the way not to leak one is not to have one.
 * {@link sanitiseStoredTarget} enforces that on the way *in* as well: a record written by an
 * older build, imported from somewhere, or edited by hand is stripped of anything calling
 * itself a password, a passphrase, a secret or a key blob before it is ever shown or sent.
 *
 * ## Why these are persisted at all
 *
 * Because retyping `user@build-server.lan:22` and a key path every time somebody wants to
 * render is how a feature stops being used. Persisting them is safe by construction: there
 * is nothing secret in one. The list lives in the renderer's own storage, is never sent
 * anywhere, and every field is re-validated by the main process before it reaches an `ssh`
 * argument - a stored target is a convenience, never a trusted input.
 */

import type { RemoteTarget } from "./remoteBridge.js";
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";

const STORAGE_KEY = "material-bluemap-remote-targets";

/** Bumped when the stored shape changes in a way reading cannot repair. */
export const REMOTE_TARGET_STORAGE_VERSION = 1;

export const DEFAULT_SSH_PORT = 22;
/** Where a render stages by default: under the remote account's own home, not `/tmp`. */
export const DEFAULT_WORK_DIR = "~/.material-bluemap/renders";

/**
 * The form, as strings.
 *
 * Strings rather than the typed {@link RemoteTarget} because a half-typed port is `"2"` and
 * a number field that turns that into `2` while somebody is still typing `22` is a field
 * that fights them. The main process owns the grammar; this owns the typing.
 */
export interface RemoteTargetDraft {
    readonly id: string;
    readonly label: string;
    readonly host: string;
    readonly port: string;
    readonly user: string;
    /** Absolute path to a private key, or empty to use the SSH agent. */
    readonly identityFile: string;
    readonly workDir: string;
    readonly image: string;
    readonly docker: string;
    readonly keepRemoteFiles: boolean;
}

/** A new, empty form. The id is generated here so a draft is addressable before it is saved. */
export function blankDraft(id = newTargetId()): RemoteTargetDraft {
    return {
        id,
        label: "",
        host: "",
        port: String(DEFAULT_SSH_PORT),
        user: "",
        identityFile: "",
        workDir: DEFAULT_WORK_DIR,
        image: "",
        docker: "docker",
        keepRemoteFiles: false,
    };
}

export function draftFromTarget(target: RemoteTarget): RemoteTargetDraft {
    return {
        id: target.id,
        label: target.label,
        host: target.host,
        port: String(target.port),
        user: target.user,
        identityFile: target.identityFile ?? "",
        workDir: target.workDir,
        image: target.image,
        docker: target.docker,
        keepRemoteFiles: target.keepRemoteFiles,
    };
}

/**
 * The draft as the shape the main process validates.
 *
 * An empty identity file becomes `null` rather than `""`: null means "use the agent", and
 * an empty string would be a path to nothing that `ssh` would be asked to read. An empty
 * image and an empty work directory are simply omitted, so the main process fills in its
 * own defaults rather than being handed a blank to interpret.
 */
export function draftToTarget(draft: RemoteTargetDraft): Record<string, unknown> {
    const port = Number.parseInt(draft.port.trim(), 10);
    const request: Record<string, unknown> = {
        id: draft.id,
        host: draft.host.trim(),
        user: draft.user.trim(),
        port: Number.isFinite(port) ? port : draft.port.trim(),
        identityFile: draft.identityFile.trim() === "" ? null : draft.identityFile.trim(),
        keepRemoteFiles: draft.keepRemoteFiles,
    };
    if (draft.label.trim() !== "") request["label"] = draft.label.trim();
    if (draft.workDir.trim() !== "") request["workDir"] = draft.workDir.trim();
    if (draft.image.trim() !== "") request["image"] = draft.image.trim();
    if (draft.docker.trim() !== "") request["docker"] = draft.docker.trim();
    return request;
}

/** `user@host:port`, the form a message names a machine by. Never carries a key path. */
export function describeTarget(target: RemoteTarget): string {
    return `${target.user}@${target.host}:${String(target.port)}`;
}

/** Everything about a target that a search should look through. Never the key's contents. */
export function targetText(target: RemoteTarget): string[] {
    return [
        target.label,
        describeTarget(target),
        target.host,
        target.user,
        target.workDir,
        target.image,
        target.identityFile ?? "",
    ].filter((value) => value !== "");
}

/* -------------------------------------------------------------------------- */
/* Storage                                                                    */
/* -------------------------------------------------------------------------- */

/** The two methods used, so a test passes a plain object and nothing else leaks. */
export interface TargetStorage {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
}

function defaultStorage(): TargetStorage | null {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        // Reading `localStorage` itself throws where storage is blocked outright.
        return null;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
    return typeof value === "string" ? value : fallback;
}

/**
 * Fields that are never read back, whatever a stored record happens to hold.
 *
 * Not a theoretical list. A settings file edited by hand, an export from another tool, or a
 * record written by a build that had a different idea can all carry one of these, and the
 * moment one is read into an object that travels to the main process it is a secret in an
 * `ssh` invocation. Dropping them here means the renderer cannot pass one on even by
 * accident.
 */
const NEVER_READ = ["password", "passphrase", "secret", "privateKey", "identity", "token"];

/**
 * One stored record, read field by field into a target.
 *
 * Nothing is spread. Every field below is named, so a record carrying anything else - a
 * password, a key blob, a stale field from an older shape - contributes exactly nothing to
 * what comes out. Returns null when the record has no host or user, because a target
 * without those is not a machine, and showing a row that cannot be connected to is worse
 * than showing one fewer row.
 */
export function sanitiseStoredTarget(value: unknown): RemoteTarget | null {
    if (!isRecord(value)) return null;
    const host = text(value["host"]).trim();
    const user = text(value["user"]).trim();
    if (host === "" || user === "") return null;

    const rawPort = value["port"];
    const port =
        typeof rawPort === "number" && Number.isSafeInteger(rawPort) && rawPort > 0 && rawPort < 65_536
            ? rawPort
            : DEFAULT_SSH_PORT;

    const identity = text(value["identityFile"]).trim();
    const id = text(value["id"]).trim();

    return {
        id: id === "" ? newTargetId() : id,
        label: text(value["label"]).trim() === "" ? `${user}@${host}` : text(value["label"]).trim(),
        host,
        user,
        port,
        identityFile: identity === "" ? null : identity,
        workDir: text(value["workDir"]).trim() === "" ? DEFAULT_WORK_DIR : text(value["workDir"]).trim(),
        image: text(value["image"]).trim(),
        docker: text(value["docker"]).trim() === "" ? "docker" : text(value["docker"]).trim(),
        keepRemoteFiles: value["keepRemoteFiles"] === true,
    };
}

/** True when a record claims to hold something this application refuses to carry. */
export function holdsRefusedField(value: unknown): boolean {
    if (!isRecord(value)) return false;
    return NEVER_READ.some((name) => name in value);
}

/** The stored list, or an empty one. Never throws: a corrupt entry is skipped, not fatal. */
export function loadTargets(storage: TargetStorage | null = defaultStorage()): RemoteTarget[] {
    if (storage === null) return [];
    let raw: string | null;
    try {
        raw = storage.getItem(STORAGE_KEY);
    } catch {
        return [];
    }
    if (raw === null || raw === "") return [];

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return [];
    }
    if (!isRecord(parsed)) return [];
    const list = parsed["targets"];
    if (!Array.isArray(list)) return [];

    const targets: RemoteTarget[] = [];
    for (const entry of list) {
        const target = sanitiseStoredTarget(entry);
        if (target !== null) targets.push(target);
    }
    return targets;
}

/**
 * Writes the list back. A storage that refuses is not an error worth interrupting anybody
 * for: the targets stay usable for this session and the surface keeps working.
 */
export function saveTargets(
    targets: readonly RemoteTarget[],
    storage: TargetStorage | null = defaultStorage(),
): boolean {
    // Fire-and-forget mirror into the main process's own settings history, on top of the
    // localStorage write below - see `appSettingsHistorySync.ts`'s own doc comment. Safe by
    // the same construction this file's own doc comment states: no field here is a secret.
    recordAppSetting("remoteTargets", targets);
    if (storage === null) return false;
    try {
        storage.setItem(
            STORAGE_KEY,
            JSON.stringify({ version: REMOTE_TARGET_STORAGE_VERSION, targets }),
        );
        return true;
    } catch {
        return false;
    }
}

/** Adds or replaces a target by id, keeping the order somebody put them in. */
export function upsertTarget(
    targets: readonly RemoteTarget[],
    target: RemoteTarget,
): RemoteTarget[] {
    const index = targets.findIndex((candidate) => candidate.id === target.id);
    if (index === -1) return [...targets, target];
    const next = [...targets];
    next[index] = target;
    return next;
}

export function removeTarget(targets: readonly RemoteTarget[], id: string): RemoteTarget[] {
    return targets.filter((candidate) => candidate.id !== id);
}

/**
 * A fresh id.
 *
 * `crypto.randomUUID` where it exists, and a time-and-counter fallback where it does not,
 * because the id is only ever a settings key and a way to tell two rows apart - it is not a
 * secret and nothing depends on it being unguessable.
 */
let counter = 0;
export function newTargetId(): string {
    const crypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (crypto?.randomUUID !== undefined) return `t-${crypto.randomUUID()}`;
    counter += 1;
    return `t-${Date.now().toString(36)}-${String(counter)}`;
}
