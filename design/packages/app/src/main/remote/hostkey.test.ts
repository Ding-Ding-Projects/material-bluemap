/**
 * Fingerprints, and the rule that an approval names a key rather than supplying one.
 *
 * The fingerprint arithmetic is checked against a vector rather than against itself: the
 * whole point of `SHA256:...` is that a person compares it character-for-character with
 * what `ssh-keygen -l` prints on the machine, so an implementation that agrees only with
 * its own tests is worthless.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fingerprintOf, parseKeyscan, recordedFor, scanHostKeys, trustHostKey } from "./hostkey.js";
import { fakeRunner, output, testTarget } from "./fakes.js";

let workDir = "";
let knownHostsFile = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mbm-hostkey-"));
    knownHostsFile = join(workDir, "known_hosts");
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

const KEY_A = "AAAAC3NzaC1lZDI1NTE5AAAAIJ7Zt5cQKJhX0m0bZ0m2Q2K1nZ8xY6fW3Vd1aJ9kLm2p";
const KEY_B = "AAAAC3NzaC1lZDI1NTE5AAAAIGx1bmNoVGltZUlzVGhlQmVzdFRpbWVGb3JEaW1TdW0h";

function keyscanOutput(key: string, port = 2222): ReturnType<typeof output> {
    return output({
        stdout:
            `# render.example:${String(port)} SSH-2.0-OpenSSH_9.6\n` +
            `[render.example]:${String(port)} ssh-ed25519 ${key}\n`,
    });
}

describe("fingerprintOf", () => {
    it("computes what ssh-keygen -l prints: base64 of the SHA-256, padding stripped", () => {
        const expected = createHash("sha256")
            .update(Buffer.from(KEY_A, "base64"))
            .digest("base64")
            .replace(/=+$/, "");
        expect(fingerprintOf(KEY_A)).toBe(`SHA256:${expected}`);
        // A fingerprint a person cannot compare with the server's is a fingerprint nobody
        // checks, so the shape is asserted too.
        expect(fingerprintOf(KEY_A)).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
    });

    it("gives different keys different fingerprints", () => {
        expect(fingerprintOf(KEY_A)).not.toBe(fingerprintOf(KEY_B));
    });
});

describe("parseKeyscan", () => {
    it("reads the lines and skips the banner comments", () => {
        const offers = parseKeyscan(keyscanOutput(KEY_A).stdout);
        expect(offers).toHaveLength(1);
        expect(offers[0]?.type).toBe("ssh-ed25519");
        expect(offers[0]?.base64).toBe(KEY_A);
        expect(offers[0]?.line).toContain("[render.example]:2222");
    });

    it("skips a line that is not a key rather than refusing the whole scan", () => {
        // Some builds write progress to stdout; refusing everything because of one line
        // would turn a working host into an unusable one.
        const offers = parseKeyscan(`getting keys...\n${keyscanOutput(KEY_A).stdout}`);
        expect(offers).toHaveLength(1);
    });

    it("finds nothing in nothing", () => {
        expect(parseKeyscan("")).toEqual([]);
        expect(parseKeyscan("# only a comment\n")).toEqual([]);
    });
});

describe("scanHostKeys", () => {
    it("asks the host on the right port and reads what it offered", async () => {
        const runner = fakeRunner([{ when: /ssh-keyscan/, answer: keyscanOutput(KEY_A) }]);
        const scanned = await scanHostKeys(testTarget(), {
            knownHostsFile,
            runner: runner.runner,
        });
        expect(scanned.offers).toHaveLength(1);
        expect(runner.text()).toContain("-p 2222");
        expect(runner.text()).toContain("render.example");
    });

    it("answers with nothing rather than throwing when the host says nothing", async () => {
        const runner = fakeRunner([
            { when: /ssh-keyscan/, answer: output({ stderr: "connection closed" }) },
        ]);
        const scanned = await scanHostKeys(testTarget(), { knownHostsFile, runner: runner.runner });
        expect(scanned.offers).toEqual([]);
        expect(scanned.detail).toBe("connection closed");
    });
});

describe("recordedFor", () => {
    it("finds a key recorded under the [host]:port form a non-standard port needs", async () => {
        await writeFile(knownHostsFile, `[render.example]:2222 ssh-ed25519 ${KEY_A}\n`, "utf8");
        const found = await recordedFor(testTarget(), knownHostsFile);
        expect(found).toHaveLength(1);
        expect(found[0]?.fingerprint).toBe(fingerprintOf(KEY_A));
    });

    it("finds a key recorded under the bare host name on port 22", async () => {
        await writeFile(knownHostsFile, `render.example ssh-ed25519 ${KEY_A}\n`, "utf8");
        const found = await recordedFor(testTarget({ port: 22 }), knownHostsFile);
        expect(found).toHaveLength(1);
    });

    it("finds nothing when there is no file yet, which is the ordinary first run", async () => {
        expect(await recordedFor(testTarget(), knownHostsFile)).toEqual([]);
    });
});

describe("trustHostKey", () => {
    it("records the exact key whose fingerprint was approved", async () => {
        const runner = fakeRunner([{ when: /ssh-keyscan/, answer: keyscanOutput(KEY_A) }]);
        const result = await trustHostKey(testTarget(), fingerprintOf(KEY_A), {
            knownHostsFile,
            runner: runner.runner,
        });

        expect(result.ok).toBe(true);
        const written = await readFile(knownHostsFile, "utf8");
        // The `[host]:port` form, because that is what OpenSSH looks a non-standard port
        // up under - recorded bare, every connection would ask again.
        expect(written).toBe(`[render.example]:2222 ssh-ed25519 ${KEY_A}\n`);
    });

    it("cannot be used to record a key it was not offered", async () => {
        // The whole reason the approval is a fingerprint rather than a key: otherwise the
        // renderer is one IPC message away from writing an arbitrary trust-store line.
        const runner = fakeRunner([{ when: /ssh-keyscan/, answer: keyscanOutput(KEY_A) }]);
        const result = await trustHostKey(testTarget(), fingerprintOf(KEY_B), {
            knownHostsFile,
            runner: runner.runner,
        });

        expect(result.ok).toBe(false);
        expect(result.message).toContain("not offering a key with fingerprint");
        await expect(readFile(knownHostsFile, "utf8")).rejects.toThrow();
    });

    it("refuses anything that is not a SHA-256 fingerprint at all", async () => {
        const runner = fakeRunner([{ when: /ssh-keyscan/, answer: keyscanOutput(KEY_A) }]);
        for (const value of ["", "SHA256:", KEY_A, "MD5:aa:bb", "../../etc/passwd"]) {
            const result = await trustHostKey(testTarget(), value, {
                knownHostsFile,
                runner: runner.runner,
            });
            expect(result.ok).toBe(false);
        }
        // Not one of them reached the scanner, let alone the file.
        expect(runner.calls).toEqual([]);
    });

    it("appends, so recording a second target does not lose the first", async () => {
        await writeFile(knownHostsFile, `other.example ssh-ed25519 ${KEY_B}\n`, "utf8");
        const runner = fakeRunner([{ when: /ssh-keyscan/, answer: keyscanOutput(KEY_A) }]);
        await trustHostKey(testTarget(), fingerprintOf(KEY_A), {
            knownHostsFile,
            runner: runner.runner,
        });
        const written = await readFile(knownHostsFile, "utf8");
        expect(written).toContain("other.example");
        expect(written).toContain("[render.example]:2222");
    });
});
