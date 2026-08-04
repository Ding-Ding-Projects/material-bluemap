/**
 * The four checks in order, and the host-key decision they can produce.
 *
 * The security-critical assertion in this whole feature is in here: a **changed** host key
 * can never produce a shape that offers acceptance. Not a disabled button, not one behind a
 * confirmation - the decision type has no acceptable variant for that case at all, which is
 * what makes it a property of the model rather than of somebody remembering not to render a
 * button. A rebuilt server and an intercepted connection are indistinguishable from here,
 * and a button that resolves that ambiguity in the application's favour resolves it in an
 * attacker's favour too.
 *
 * The other property worth a test is the third state of a check: **not reached**. The main
 * process stops at the first failure precisely so a later check never runs against a machine
 * that already failed an earlier one, and drawing an unrun check as passed or failed is a
 * lie about what is known - the one that sends somebody to install Docker on a server that
 * was simply switched off.
 */

import { describe, expect, it } from "vitest";
import {
    PREFLIGHT_STAGES,
    formatBytes,
    hostKeyDecision,
    offersAcceptance,
    preflightRows,
    stagePurpose,
    stageTitle,
} from "./preflightModel.js";
import type { HostKeyOffer, PreflightReport, RemoteFailure } from "./remoteBridge.js";
import { t } from "./testTranslate.js";

const offer: HostKeyOffer = {
    type: "ssh-ed25519",
    base64: "AAAAC3NzaC1lZDI1NTE5AAAAIexample",
    fingerprint: "SHA256:0123456789012345678901234567890123456789012",
    line: "build.lan ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIexample",
};

function failure(remoteCode: string, extra: Partial<RemoteFailure> = {}): RemoteFailure {
    return {
        code: "remote-failed",
        message: `refused: ${remoteCode}`,
        detail: null,
        exitCode: null,
        remoteCode,
        target: "renderer@build.lan:22",
        ...extra,
    };
}

function report(overrides: Partial<PreflightReport> = {}): PreflightReport {
    return {
        ok: false,
        target: "renderer@build.lan:22",
        checks: [],
        failure: null,
        hostKeys: [],
        docker: null,
        freeBytes: null,
        workDir: null,
        ...overrides,
    };
}

describe("the four checks", () => {
    it("are always shown in the order they are asked in", () => {
        expect(PREFLIGHT_STAGES).toEqual(["ssh", "host-key", "docker", "disk"]);
        expect(preflightRows(null, false, t).map((row) => row.stage)).toEqual([
            "ssh",
            "host-key",
            "docker",
            "disk",
        ]);
    });

    it("gives every stage its own name and its own purpose", () => {
        const titles = PREFLIGHT_STAGES.map((stage) => stageTitle(stage, t));
        const purposes = PREFLIGHT_STAGES.map((stage) => stagePurpose(stage, t));

        expect(new Set(titles).size).toBe(4);
        expect(new Set(purposes).size).toBe(4);
    });

    it("marks the checks a stopped run never reached, rather than drawing them as failures", () => {
        // The failure this prevents: "Docker: failed" on a machine that was switched off,
        // which sends somebody to install software on a server that was never the problem.
        const rows = preflightRows(
            report({
                checks: [{ stage: "ssh", ok: false, message: "did not answer", detail: null }],
                failure: failure("unreachable"),
            }),
            false,
            t,
        );

        expect(rows.map((row) => row.state)).toEqual(["failed", "not-reached", "not-reached", "not-reached"]);
        expect(rows[2]?.message).toMatch(/Not checked/i);
        expect(rows[2]?.message).toMatch(/earlier check/i);
    });

    it("reports every check as passed once they all did", () => {
        const rows = preflightRows(
            report({
                ok: true,
                failure: null,
                checks: PREFLIGHT_STAGES.map((stage) => ({
                    stage,
                    ok: true,
                    message: `${stage} is fine`,
                    detail: null,
                })),
            }),
            false,
            t,
        );

        expect(rows.every((row) => row.state === "passed")).toBe(true);
    });

    it("distinguishes a run in flight from one that has not been asked for", () => {
        expect(preflightRows(null, true, t).every((row) => row.state === "waiting")).toBe(true);
        expect(preflightRows(null, false, t).every((row) => row.state === "not-reached")).toBe(true);
        // With nothing run yet, the line says what the check would prove rather than
        // leaving four blank rows.
        expect(preflightRows(null, false, t)[3]?.message).toMatch(/free space/i);
    });

    it("carries the check's own detail through for the disclosure", () => {
        const rows = preflightRows(
            report({
                checks: [{ stage: "ssh", ok: false, message: "refused", detail: "Permission denied (publickey)" }],
            }),
            false,
            t,
        );

        expect(rows[0]?.detail).toBe("Permission denied (publickey)");
    });
});

describe("the host key decision", () => {
    it("offers NOTHING to accept when the key has changed", () => {
        // The single most important assertion in this feature.
        const decision = hostKeyDecision(
            report({ failure: failure("host-key-changed", { detail: "recorded: ssh-ed25519 SHA256:old" }) }),
            true,
            t,
        );

        expect(decision.kind).toBe("changed");
        expect(offersAcceptance(decision)).toBe(false);
        // There is no field to render a button from, whatever a template might try.
        expect(decision).not.toHaveProperty("offers");
        expect(decision).not.toHaveProperty("canAccept");
    });

    it("says plainly why there is no button, and where the deliberate act would be", () => {
        const decision = hostKeyDecision(report({ failure: failure("host-key-changed") }), true, t);

        if (decision.kind !== "changed") throw new Error("expected a refusal");
        expect(decision.message).toMatch(/NOT the one recorded/);
        expect(decision.message).toMatch(/no way to accept/i);
        expect(decision.message).toMatch(/rebuilt it yourself/i);
    });

    it("puts an unknown key in front of the person with its fingerprints", () => {
        const decision = hostKeyDecision(
            report({ failure: failure("host-key-unknown"), hostKeys: [offer] }),
            true,
            t,
        );

        expect(decision.kind).toBe("unknown");
        expect(offersAcceptance(decision)).toBe(true);
        if (decision.kind !== "unknown") throw new Error("expected a decision");
        expect(decision.offers).toEqual([offer]);
        expect(decision.message).toMatch(/ssh-keygen -lf/);
        expect(decision.message).toMatch(/character for character/i);
    });

    it("never invents a fingerprint the main process did not send", () => {
        // An unknown key with no offers is a decision nobody can make, and a fingerprint
        // carried over from an earlier report would be a key approved by looking at a
        // different machine's.
        const decision = hostKeyDecision(report({ failure: failure("host-key-unknown") }), true, t);

        if (decision.kind !== "unknown") throw new Error("expected a decision");
        expect(decision.offers).toEqual([]);
        expect(offersAcceptance(decision)).toBe(false);
    });

    it("does not offer acceptance a build cannot actually perform", () => {
        const decision = hostKeyDecision(
            report({ failure: failure("host-key-unknown"), hostKeys: [offer] }),
            false,
            t,
        );

        expect(offersAcceptance(decision)).toBe(false);
    });

    it("says an unreadable key is unreadable, rather than unknown", () => {
        const decision = hostKeyDecision(report({ failure: failure("host-key-unavailable") }), true, t);

        expect(decision.kind).toBe("unavailable");
        expect(offersAcceptance(decision)).toBe(false);
    });

    it("stays quiet when the host key was not what stopped the run", () => {
        expect(hostKeyDecision(report({ failure: failure("docker-missing") }), true, t).kind).toBe("none");
        expect(hostKeyDecision(report({ ok: true, failure: null }), true, t).kind).toBe("none");
        expect(hostKeyDecision(null, true, t).kind).toBe("none");
    });

    it("decides on the failure code rather than on the wording of a sentence", () => {
        // A surface that decided by looking for the word "changed" in a message would be
        // one rewording away from offering an accept button in the wrong case.
        const decision = hostKeyDecision(
            report({
                failure: failure("host-key-unknown", { message: "the host key has changed, allegedly" }),
                hostKeys: [offer],
            }),
            true,
            t,
        );

        expect(decision.kind).toBe("unknown");
    });
});

describe("free space, in words", () => {
    it("uses the decimal units the main process measures in", () => {
        expect(formatBytes(0)).toBe("0 B");
        expect(formatBytes(999)).toBe("999 B");
        expect(formatBytes(1_500)).toBe("1.5 KB");
        expect(formatBytes(64_000_000_000)).toBe("64.0 GB");
    });
});
