/**
 * The machines somebody saved, and the one thing that must never be among them.
 *
 * Persisting a remote target is safe *by construction* - a host, a port, an account name
 * and the path to a key file are not secrets - and the way that stays true is that nothing
 * else is ever read back. So the assertions here are mostly about what does **not** survive
 * a round trip: a `password` written into the settings file by hand, an export from another
 * tool carrying a `privateKey`, a field an older build invented. None of them may reach an
 * object that travels to the main process, because from there it is one step into an `ssh`
 * invocation.
 *
 * The rest is ordinary: a half-typed port must not fight the person typing it, and a corrupt
 * stored entry must cost one row rather than the whole list.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../stores/appSettingsHistorySync.js", () => ({ recordAppSetting: vi.fn() }));
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";

import {
    DEFAULT_SSH_PORT,
    DEFAULT_WORK_DIR,
    blankDraft,
    describeTarget,
    draftFromTarget,
    draftToTarget,
    holdsRefusedField,
    loadTargets,
    newTargetId,
    removeTarget,
    sanitiseStoredTarget,
    saveTargets,
    targetText,
    upsertTarget,
    type TargetStorage,
} from "./remoteTargets.js";
import type { RemoteTarget } from "./remoteBridge.js";

function memoryStorage(seed: Record<string, string> = {}): TargetStorage & { cells: Map<string, string> } {
    const cells = new Map(Object.entries(seed));
    return {
        cells,
        getItem: (key) => cells.get(key) ?? null,
        setItem: (key, value) => void cells.set(key, value),
    };
}

const target: RemoteTarget = {
    id: "t-1",
    label: "the build server",
    host: "build.lan",
    port: 2222,
    user: "renderer",
    identityFile: "C:/Users/me/.ssh/id_ed25519",
    workDir: "/srv/renders",
    image: "eclipse-temurin:25-jre",
    docker: "docker",
    keepRemoteFiles: false,
};

describe("reading a stored machine", () => {
    it("drops every field that claims to be a secret, whatever wrote it", () => {
        // Not theoretical: a hand-edited settings file, an import, or a build with a
        // different idea can all carry one of these, and a spread would carry it onward.
        const read = sanitiseStoredTarget({
            ...target,
            password: "hunter2",
            passphrase: "also secret",
            privateKey: "-----BEGIN OPENSSH PRIVATE KEY-----",
            token: "ghp_something",
        });

        expect(read).not.toBeNull();
        const carried = JSON.stringify(read);
        expect(carried).not.toContain("hunter2");
        expect(carried).not.toContain("BEGIN OPENSSH");
        expect(carried).not.toContain("ghp_");
        expect(Object.keys(read ?? {})).not.toContain("password");
        expect(Object.keys(read ?? {})).not.toContain("privateKey");
    });

    it("can say when a record held one, so a surface may warn rather than silently discard", () => {
        expect(holdsRefusedField({ ...target, password: "x" })).toBe(true);
        expect(holdsRefusedField(target)).toBe(false);
    });

    it("refuses a record with no host or no user rather than showing a row that cannot connect", () => {
        expect(sanitiseStoredTarget({ ...target, host: "" })).toBeNull();
        expect(sanitiseStoredTarget({ ...target, user: "   " })).toBeNull();
        expect(sanitiseStoredTarget("not an object")).toBeNull();
        expect(sanitiseStoredTarget(null)).toBeNull();
    });

    it("repairs the fields it can rather than losing the machine over them", () => {
        const read = sanitiseStoredTarget({ host: "build.lan", user: "renderer", port: "nonsense" });

        expect(read?.port).toBe(DEFAULT_SSH_PORT);
        expect(read?.workDir).toBe(DEFAULT_WORK_DIR);
        expect(read?.label).toBe("renderer@build.lan");
        expect(read?.identityFile).toBeNull();
        expect(read?.id).not.toBe("");
    });

    it("treats an empty key path as 'use the agent', which is a different thing from a path to nothing", () => {
        expect(sanitiseStoredTarget({ ...target, identityFile: "   " })?.identityFile).toBeNull();
    });
});

describe("the stored list", () => {
    it("survives a round trip", () => {
        const storage = memoryStorage();
        expect(saveTargets([target], storage)).toBe(true);

        expect(loadTargets(storage)).toEqual([target]);
    });

    it("costs one row rather than the whole list when an entry is corrupt", () => {
        const storage = memoryStorage({
            "material-bluemap-remote-targets": JSON.stringify({
                version: 1,
                targets: [target, { host: "" }, "nonsense", { ...target, id: "t-2", host: "other.lan" }],
            }),
        });

        expect(loadTargets(storage).map((entry) => entry.host)).toEqual(["build.lan", "other.lan"]);
    });

    it("answers with an empty list rather than throwing on rubbish, or on no storage at all", () => {
        expect(loadTargets(memoryStorage({ "material-bluemap-remote-targets": "{{{" }))).toEqual([]);
        expect(loadTargets(memoryStorage({ "material-bluemap-remote-targets": "[]" }))).toEqual([]);
        expect(loadTargets(null)).toEqual([]);
    });

    it("reports a storage that refuses instead of interrupting anybody over it", () => {
        const refusing: TargetStorage = {
            getItem: () => null,
            setItem: () => {
                throw new Error("quota exceeded");
            },
        };

        expect(saveTargets([target], refusing)).toBe(false);
        expect(saveTargets([target], null)).toBe(false);
    });

    describe("mirroring into the application-settings history", () => {
        beforeEach(() => {
            vi.mocked(recordAppSetting).mockClear();
        });

        it("mirrors the list under the remoteTargets key, even when storage refuses", () => {
            const refusing: TargetStorage = {
                getItem: () => null,
                setItem: () => {
                    throw new Error("quota exceeded");
                },
            };
            saveTargets([target], refusing);
            expect(recordAppSetting).toHaveBeenCalledTimes(1);
            expect(recordAppSetting).toHaveBeenCalledWith("remoteTargets", [target]);
        });
    });

    it("adds, replaces by id, and forgets", () => {
        const two = upsertTarget([target], { ...target, id: "t-2", label: "another" });
        expect(two).toHaveLength(2);

        const edited = upsertTarget(two, { ...target, label: "renamed" });
        expect(edited).toHaveLength(2);
        expect(edited[0]?.label).toBe("renamed");

        expect(removeTarget(edited, "t-2").map((entry) => entry.id)).toEqual(["t-1"]);
    });

    it("gives every new machine an id of its own", () => {
        expect(newTargetId()).not.toBe(newTargetId());
    });
});

describe("the form", () => {
    it("starts empty, on the default port and the default work directory", () => {
        const draft = blankDraft("t-x");

        expect(draft.host).toBe("");
        expect(draft.port).toBe(String(DEFAULT_SSH_PORT));
        expect(draft.workDir).toBe(DEFAULT_WORK_DIR);
        expect(draft.identityFile).toBe("");
        expect(draft.keepRemoteFiles).toBe(false);
    });

    it("has nowhere at all to put a password", () => {
        // The whole design of the remote path in one assertion. If this ever fails,
        // something has grown a secret field and the persistence above stopped being safe
        // by construction.
        expect(Object.keys(blankDraft("t-x")).join(" ")).not.toMatch(/pass|secret|token/i);
    });

    it("keeps a half-typed port as text rather than rewriting it under the person", () => {
        const draft = { ...blankDraft("t-x"), host: "a.lan", user: "b", port: "2" };

        expect(draft.port).toBe("2");
        expect(draftToTarget(draft)["port"]).toBe(2);
    });

    it("sends an empty key path as null, so ssh is never asked to read a path to nothing", () => {
        const request = draftToTarget({ ...blankDraft("t-x"), host: "a.lan", user: "b" });

        expect(request["identityFile"]).toBeNull();
    });

    it("omits the optional fields it has nothing for, rather than handing over blanks", () => {
        const request = draftToTarget({
            ...blankDraft("t-x"),
            host: "a.lan",
            user: "b",
            label: "",
            image: "",
        });

        expect(request).not.toHaveProperty("label");
        expect(request).not.toHaveProperty("image");
        expect(request).toHaveProperty("workDir", DEFAULT_WORK_DIR);
    });

    it("round-trips a saved machine back into the form it came from", () => {
        expect(draftFromTarget(target)).toEqual({
            id: "t-1",
            label: "the build server",
            host: "build.lan",
            port: "2222",
            user: "renderer",
            identityFile: "C:/Users/me/.ssh/id_ed25519",
            workDir: "/srv/renders",
            image: "eclipse-temurin:25-jre",
            docker: "docker",
            keepRemoteFiles: false,
        });
    });
});

describe("naming a machine", () => {
    it("uses the form ssh itself takes, with the port in it", () => {
        expect(describeTarget(target)).toBe("renderer@build.lan:2222");
    });

    it("searches everything about a machine that identifies it", () => {
        const text = targetText(target).join(" ");

        expect(text).toContain("build.lan");
        expect(text).toContain("renderer@build.lan:2222");
        expect(text).toContain("/srv/renders");
    });
});
