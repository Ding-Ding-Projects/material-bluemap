/**
 * The four checks, shown in order, each with its own result and its own fix.
 *
 * ```
 * 1  ssh        can this application reach the host and sign in at all?
 * 2  host key   is the machine answering the machine that answered last time?
 * 3  docker     is there a Docker there, and is its daemon running?
 * 4  disk       is there room under the work directory for this world and its tiles?
 * ```
 *
 * The order is not cosmetic and neither is showing all four. A render is gigabytes of
 * upload and hours of compute; finding out at the end of the upload that the host has no
 * Docker is a wasted evening. So the main process asks in this order and stops at the first
 * failure - and this surface renders the ones it never reached as **not reached** rather
 * than as passed or failed, because a check that did not run is a third state and drawing it
 * as either of the other two is a lie about what is known.
 *
 * ## The host key is the security-critical part of this file
 *
 * Three states, and only one of them has a button:
 *
 * ```
 * trusted    already recorded. Nothing to ask.
 * unknown    never seen. Show the SHA256 fingerprints; the person decides. Nothing is sent.
 * changed    seen, and different. REFUSED, with no accept control anywhere.
 * ```
 *
 * `changed` has no button because a rebuilt server and an intercepted connection are
 * indistinguishable from here, and a button that resolves that ambiguity in the
 * application's favour resolves it in an attacker's favour too. The main process sends no
 * fingerprints in that case for exactly this reason, and {@link hostKeyDecision} refuses to
 * synthesise any: a fingerprint on screen is a fingerprint with an accept button next to it,
 * sooner or later, and the way to make sure that never happens is to have nothing to draw.
 *
 * Accepting an *unknown* key names the fingerprint that was accepted. The main process
 * re-scans and records only a key it has just been offered whose fingerprint matches, so
 * this surface cannot put a line of its choosing into a trust store even if it tried.
 */

import type { HostKeyOffer, PreflightReport, PreflightStage } from "./remoteBridge.js";
import type { Translate } from "../world/worldFolder.js";

/** The order they are asked in, which is the order they are shown in. */
export const PREFLIGHT_STAGES: readonly PreflightStage[] = ["ssh", "host-key", "docker", "disk"];

export type PreflightRowState = "passed" | "failed" | "not-reached" | "waiting";

export interface PreflightRow {
    readonly stage: PreflightStage;
    readonly state: PreflightRowState;
    /** What to call this check on screen. */
    readonly title: string;
    /** The result, in the main process's own words when it has any. */
    readonly message: string;
    /** Supporting evidence, behind a disclosure. Null when there is none. */
    readonly detail: string | null;
}

export function stageTitle(stage: PreflightStage, t: Translate): string {
    switch (stage) {
        case "ssh":
            return t("remote.preflight.stage.ssh", "Connection and sign-in");
        case "host-key":
            return t("remote.preflight.stage.hostKey", "Host key");
        case "docker":
            return t("remote.preflight.stage.docker", "Docker on that machine");
        case "disk":
            return t("remote.preflight.stage.disk", "Room to work");
    }
}

/** What each check would prove, said before it runs so the wait means something. */
export function stagePurpose(stage: PreflightStage, t: Translate): string {
    switch (stage) {
        case "ssh":
            return t(
                "remote.preflight.purpose.ssh",
                "Signs in with your agent or your key file. No password is offered and none is asked for.",
            );
        case "host-key":
            return t(
                "remote.preflight.purpose.hostKey",
                "Proves the machine answering is the one that answered last time.",
            );
        case "docker":
            return t(
                "remote.preflight.purpose.docker",
                "Asks that machine whether it has Docker and whether its daemon is running.",
            );
        case "disk":
            return t(
                "remote.preflight.purpose.disk",
                "Measures the free space under the work directory, before a byte is uploaded.",
            );
    }
}

/**
 * The four rows, whatever the report got as far as.
 *
 * A report holds only the checks that ran, so this fills in the rest as **not reached**.
 * That is the honest reading: the main process stops at the first failure precisely so a
 * later check is never run against a machine that has already failed an earlier one, and
 * showing "Docker: not checked, because the connection failed" is what stops somebody
 * installing Docker on a server that was simply switched off.
 */
export function preflightRows(
    report: PreflightReport | null,
    running: boolean,
    t: Translate,
): readonly PreflightRow[] {
    return PREFLIGHT_STAGES.map((stage) => {
        const title = stageTitle(stage, t);
        if (report === null) {
            return {
                stage,
                state: running ? ("waiting" as const) : ("not-reached" as const),
                title,
                message: running
                    ? t("remote.preflight.waiting", "Checking...")
                    : stagePurpose(stage, t),
                detail: null,
            };
        }
        const check = report.checks.find((entry) => entry.stage === stage);
        if (check === undefined) {
            return {
                stage,
                state: "not-reached" as const,
                title,
                message: t(
                    "remote.preflight.notReached",
                    "Not checked: an earlier check stopped this. Fix that one first.",
                ),
                detail: null,
            };
        }
        return {
            stage,
            state: check.ok ? ("passed" as const) : ("failed" as const),
            title,
            message: check.message,
            detail: check.detail,
        };
    });
}

/* -------------------------------------------------------------------------- */
/* The host key decision                                                      */
/* -------------------------------------------------------------------------- */

export type HostKeyDecision =
    /** Nothing to decide: the key is recorded, or the preflight stopped somewhere else. */
    | { readonly kind: "none" }
    /**
     * Never seen before. The fingerprints are shown; the person decides.
     *
     * `canAccept` is true only when this build can actually record one. A surface that
     * offers acceptance and cannot write it is a button that changes nothing.
     */
    | {
          readonly kind: "unknown";
          readonly offers: readonly HostKeyOffer[];
          readonly canAccept: boolean;
          readonly message: string;
      }
    /** Seen, and different. Refused. There is no accept path in this shape at all. */
    | { readonly kind: "changed"; readonly message: string; readonly detail: string | null }
    /** The key could not be read, so there is nothing to show and nothing to trust. */
    | { readonly kind: "unavailable"; readonly message: string; readonly detail: string | null };

/**
 * What, if anything, to put in front of the person about the host key.
 *
 * Reads `failure.remoteCode` rather than matching on prose. The codes are the contract -
 * `host-key-changed` means one thing and will keep meaning it - and a surface that decides
 * whether to offer an accept button by looking for the word "changed" in a sentence is a
 * surface one wording change away from offering it in the wrong case.
 */
export function hostKeyDecision(
    report: PreflightReport | null,
    canAccept: boolean,
    t: Translate,
): HostKeyDecision {
    if (report === null || report.ok || report.failure === null) return { kind: "none" };

    const failure = report.failure;
    switch (failure.remoteCode) {
        case "host-key-changed":
            return {
                kind: "changed",
                message: t(
                    "remote.hostKey.changed",
                    "That machine offered a host key that is NOT the one recorded for it. This application will not connect, and it deliberately offers no way to accept the new key: a rebuilt server and an intercepted connection look exactly the same from here. If you rebuilt it yourself, remove the recorded key on purpose, in the file named below, and try again.",
                ),
                detail: failure.detail ?? failure.message,
            };
        case "host-key-unavailable":
            return {
                kind: "unavailable",
                message: t(
                    "remote.hostKey.unavailable",
                    "That machine's host key could not be read at all, so there is nothing to show you and nothing to trust. The host may be unreachable, or may not be running SSH on that port.",
                ),
                detail: failure.detail ?? null,
            };
        case "host-key-unknown":
            return {
                kind: "unknown",
                // Empty when the main process sent none. Never invented, never carried over
                // from an earlier report: a stale fingerprint accepted here would be a key
                // approved by looking at a different machine's.
                offers: report.hostKeys,
                canAccept: canAccept && report.hostKeys.length > 0,
                message: t(
                    "remote.hostKey.unknown",
                    "This application has never seen that machine's host key. Compare a fingerprint below with what the machine itself reports - run 'ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub' on it - and accept only if they match character for character. Nothing has been uploaded and nothing is recorded until you do.",
                ),
            };
        default:
            return { kind: "none" };
    }
}

/**
 * True when a decision offers a way to accept a key.
 *
 * Exported so a test can assert the property the security of this surface rests on -
 * that the **changed** case can never produce an accept control - against one small
 * function, rather than against the absence of a button in a rendered tree.
 */
export function offersAcceptance(decision: HostKeyDecision): boolean {
    return decision.kind === "unknown" && decision.canAccept;
}

/** Bytes as a short human string, in the decimal units the main process reports in. */
export function formatBytes(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1000 && unit < units.length - 1) {
        value /= 1000;
        unit += 1;
    }
    return `${unit === 0 ? String(value) : value.toFixed(1)} ${units[unit] ?? "B"}`;
}
