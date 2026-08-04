/**
 * The host key, which is the one question this app refuses to answer on somebody's behalf.
 *
 * SSH's whole guarantee rests on knowing that the machine answering is the machine that
 * answered last time. `StrictHostKeyChecking=accept-new` throws that away for the *first*
 * connection to any host - which is precisely the connection an interceptor needs to
 * survive, because after it the wrong key is the recorded key and every later connection
 * looks fine. So this app connects with `StrictHostKeyChecking=yes`, an unknown host is a
 * refusal, and the refusal is turned into a decision with a fingerprint in front of it.
 *
 * ## Three states, and only one of them has a button
 *
 * ```
 * trusted    the key is already in a known_hosts this app reads. Nothing to ask.
 * unknown    never seen. Show the fingerprints; the person decides. Nothing is sent.
 * changed    seen, and different. REFUSED, with no button anywhere.
 * ```
 *
 * `changed` has no button because a rebuilt server and an intercepted connection are
 * indistinguishable from here, and a button that resolves that ambiguity in the app's
 * favour is a button that resolves it in an attacker's favour too. Removing a recorded key
 * is a deliberate act with a file path in it, and the message says so.
 *
 * ## Why the approval is re-scanned rather than taken at its word
 *
 * {@link trustHostKey} does **not** accept a key blob from the caller and write it. It
 * scans the host again, computes the fingerprints itself, and writes a line only if one of
 * them equals the fingerprint the person approved. Otherwise the renderer - the least
 * trusted process in the application - would be one IPC message away from appending an
 * arbitrary line to a trust store, which is a longer way round to the same compromise.
 */

import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { execFileCommandRunner, type CommandRunner } from "../runtime/command.js";
import { firstLine } from "./ssh.js";
import type { RemoteTarget } from "./target.js";

export interface HostKeyOffer {
    /** `ssh-ed25519`, `ecdsa-sha2-nistp256`, `ssh-rsa`, ... */
    readonly type: string;
    /** The key blob, base64, exactly as `ssh-keyscan` printed it. */
    readonly base64: string;
    /** `SHA256:...`, in OpenSSH's own spelling, so it can be compared by eye. */
    readonly fingerprint: string;
    /** The whole `known_hosts` line, ready to be written if it is approved. */
    readonly line: string;
}

/**
 * The keys asked for, newest algorithm first.
 *
 * Ed25519 first because it is what a modern host offers and what a person is most likely
 * to be able to compare against `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the
 * machine itself. RSA is still asked for because plenty of hosts have nothing else.
 */
const KEY_TYPES = "ed25519,ecdsa,rsa";

/**
 * OpenSSH's `SHA256:` fingerprint of a key blob.
 *
 * Base64 of the SHA-256 of the raw key, with the `=` padding stripped - which is exactly
 * what `ssh-keygen -l` prints, and the whole point: a fingerprint a person cannot compare
 * character-for-character with what the server prints is a fingerprint nobody checks.
 */
export function fingerprintOf(base64Key: string): string {
    const digest = createHash("sha256").update(Buffer.from(base64Key, "base64")).digest("base64");
    return `SHA256:${digest.replace(/=+$/, "")}`;
}

/**
 * Reads `ssh-keyscan` output.
 *
 * Its lines are `<host> <keytype> <base64>`, with `#` comments carrying the banner. Lines
 * that are not that shape are skipped rather than throwing: keyscan writes progress and
 * version comments to stdout on some builds, and refusing the whole scan because of one
 * of them would turn a working host into an unusable one.
 */
export function parseKeyscan(stdout: string): HostKeyOffer[] {
    const offers: HostKeyOffer[] = [];
    for (const raw of stdout.split(/\r?\n/)) {
        const line = raw.trim();
        if (line === "" || line.startsWith("#")) continue;
        const parts = line.split(/\s+/);
        const type = parts[1];
        const base64 = parts[2];
        if (type === undefined || base64 === undefined) continue;
        if (!/^[A-Za-z0-9+/]+=*$/.test(base64)) continue;
        offers.push({ type, base64, fingerprint: fingerprintOf(base64), line });
    }
    return offers;
}

export interface HostKeyOptions {
    readonly knownHostsFile: string;
    readonly userKnownHostsFile?: string | null;
    /** The `ssh-keyscan` binary. A parameter so a test can name one that does not exist. */
    readonly keyscan?: string;
    readonly runner?: CommandRunner;
    readonly timeoutMs?: number;
}

/**
 * Asks the host what key it is offering. Never rejects.
 *
 * This does not decide trust - `ssh` itself does that, and `preflight.ts` reads its verdict.
 * What this provides is the *evidence*: the fingerprints to put in front of a person when
 * ssh has already said it does not recognise the host.
 */
export async function scanHostKeys(
    target: RemoteTarget,
    options: HostKeyOptions,
): Promise<{ readonly offers: HostKeyOffer[]; readonly detail: string | null }> {
    const runner = options.runner ?? execFileCommandRunner;
    const output = await runner(
        options.keyscan ?? "ssh-keyscan",
        ["-T", "10", "-p", String(target.port), "-t", KEY_TYPES, target.host],
        options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs },
    );
    // keyscan writes its banner and its complaints to stderr and exits 0 even when it got
    // nothing, so the output is what says whether it worked, not the exit code.
    return { offers: parseKeyscan(output.stdout), detail: firstLine(output.stderr) };
}

/** True when the app's own file already records a key for this host and port. */
export async function recordedFor(
    target: RemoteTarget,
    knownHostsFile: string,
): Promise<HostKeyOffer[]> {
    let text: string;
    try {
        text = await readFile(knownHostsFile, "utf8");
    } catch {
        // No file yet is the ordinary first-run state, not an error.
        return [];
    }
    const plain = target.port === 22 ? target.host : `[${target.host}]:${String(target.port)}`;
    const found: HostKeyOffer[] = [];
    for (const offer of parseKeyscan(text)) {
        const host = offer.line.split(/\s+/)[0] ?? "";
        // Only the plain form is matched. A hashed entry (`|1|...`) cannot be compared
        // without re-deriving the HMAC, and this file is written by this app, which never
        // hashes - so a hashed line here came from somewhere else and is left to ssh.
        if (host.split(",").includes(plain)) found.push(offer);
    }
    return found;
}

/**
 * Records a host key, but only the exact one that was approved.
 *
 * Re-scans, recomputes, and writes a line only when a freshly offered key's fingerprint
 * equals `approvedFingerprint`. A caller cannot hand in a key; it can only name one it has
 * already been shown.
 *
 * Returns false when the fingerprint is no longer on offer, which is the case worth
 * refusing loudly: between the person reading a fingerprint and pressing the button, the
 * host started answering with a different key.
 */
export async function trustHostKey(
    target: RemoteTarget,
    approvedFingerprint: string,
    options: HostKeyOptions,
): Promise<{ readonly ok: boolean; readonly message: string }> {
    if (!/^SHA256:[A-Za-z0-9+/]{43}$/.test(approvedFingerprint)) {
        return { ok: false, message: "That is not a SHA-256 host-key fingerprint." };
    }

    const scanned = await scanHostKeys(target, options);
    const match = scanned.offers.find((offer) => offer.fingerprint === approvedFingerprint);
    if (match === undefined) {
        return {
            ok: false,
            message:
                `${target.host} is not offering a key with fingerprint ${approvedFingerprint} any more. ` +
                "Nothing was recorded. Look at the fingerprints again before accepting one.",
        };
    }

    // Written with the `[host]:port` form whenever the port is not 22, which is what
    // OpenSSH looks the key up under. Recorded under the bare host name, a non-standard
    // port would never match and every connection would ask again.
    const host = target.port === 22 ? target.host : `[${target.host}]:${String(target.port)}`;
    const line = `${host} ${match.type} ${match.base64}\n`;

    await mkdir(dirname(options.knownHostsFile), { recursive: true });
    // Appended, never rewritten: this file may already record other targets, and replacing
    // it to add one line is how the other ones get lost.
    await appendFile(options.knownHostsFile, line, "utf8");
    return {
        ok: true,
        message: `${match.type} key ${match.fingerprint} recorded for ${host}.`,
    };
}

/** The sentence shown beside an unknown key, with the fingerprints to compare. */
export function describeOffers(offers: readonly HostKeyOffer[]): string {
    if (offers.length === 0) return "The host offered no key that could be read.";
    return offers.map((offer) => `${offer.type} ${offer.fingerprint}`).join("\n");
}
