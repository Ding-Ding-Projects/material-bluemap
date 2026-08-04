/**
 * Finding Chunker, and being honest when it is not there.
 *
 * Every probe is injected, so none of this touches a disk or a network and none of it
 * needs Chunker installed. "Chunker is absent" is the state this suite cares about most,
 * because it is the state of every machine that has never converted a world and the one
 * the app has to describe well.
 */

import { describe, expect, it } from "vitest";
import {
    CHUNKER_JAR_ENV,
    PINNED_CHUNKER,
    chunkerJarPath,
    findChunker,
    pinnedRelease,
    versionFromJarName,
} from "./chunker.js";

/** A probe that says yes to exactly these paths. */
function probeFor(...present: string[]): (path: string) => Promise<boolean> {
    const set = new Set(present);
    return async (path) => set.has(path);
}

const none = async (): Promise<boolean> => false;

describe("when Chunker is not installed", () => {
    it("says so honestly, names what it is, and offers to fetch it", async () => {
        const lookup = await findChunker({ dataDir: "/data", env: {}, probe: none });

        expect(lookup.found).toBe(false);
        if (lookup.found) throw new Error("unreachable");

        // The message has to carry three facts: it is absent, it is somebody else's
        // project under a named licence, and this app does not ship it.
        expect(lookup.reason).toContain("not installed");
        expect(lookup.reason).toContain("Hive Games");
        expect(lookup.reason).toContain("MIT");
        expect(lookup.reason).toContain("does not bundle");
        expect(lookup.remedy).toBe("download");

        // And it names where it looked, so the message is checkable rather than a shrug.
        expect(lookup.searched).toContain(chunkerJarPath("/data"));
    });

    it("does not reject - a machine without Chunker is ordinary, not exceptional", async () => {
        // If this ever throws, every caller has to wrap a perfectly normal screen in a
        // try/catch to render it.
        await expect(findChunker({ probe: none, env: {} })).resolves.toMatchObject({
            found: false,
        });
    });

    it("still answers when there is nowhere to keep a downloaded copy", async () => {
        const lookup = await findChunker({ dataDir: null, env: {}, probe: none });
        expect(lookup.found).toBe(false);
        if (lookup.found) throw new Error("unreachable");
        expect(lookup.searched).toEqual([]);
    });
});

describe("finding an installed Chunker", () => {
    it("uses a copy the app downloaded", async () => {
        const jar = chunkerJarPath("/data");
        const lookup = await findChunker({ dataDir: "/data", env: {}, probe: probeFor(jar) });

        expect(lookup).toMatchObject({
            found: true,
            source: "downloaded",
            jarPath: jar,
            version: PINNED_CHUNKER.version,
        });
    });

    it("prefers a configured jar over one the app downloaded", async () => {
        const configured = "/opt/chunker/chunker-cli-1.18.0.jar";
        const lookup = await findChunker({
            dataDir: "/data",
            configuredJar: configured,
            env: {},
            probe: probeFor(configured, chunkerJarPath("/data")),
        });

        expect(lookup).toMatchObject({ found: true, source: "configured", jarPath: configured });
    });

    it("reports a configured jar that is missing instead of quietly using another", async () => {
        // Silently falling back would run a different converter than the one that was
        // named, which is how somebody spends an afternoon wondering why a setting does
        // nothing.
        const lookup = await findChunker({
            dataDir: "/data",
            configuredJar: "/opt/gone.jar",
            env: {},
            probe: probeFor(chunkerJarPath("/data")),
        });

        expect(lookup.found).toBe(false);
        if (lookup.found) throw new Error("unreachable");
        expect(lookup.reason).toContain("/opt/gone.jar");
        expect(lookup.remedy).toBe("configure");
    });

    it("honours the environment variable, and reports it by name when it is wrong", async () => {
        const good = await findChunker({
            env: { [CHUNKER_JAR_ENV]: "/ci/chunker-cli-1.19.1.jar" },
            probe: probeFor("/ci/chunker-cli-1.19.1.jar"),
        });
        expect(good).toMatchObject({ found: true, source: "environment" });

        const bad = await findChunker({
            env: { [CHUNKER_JAR_ENV]: "/ci/missing.jar" },
            probe: none,
        });
        expect(bad.found).toBe(false);
        if (bad.found) throw new Error("unreachable");
        expect(bad.reason).toContain(CHUNKER_JAR_ENV);
    });
});

describe("reading a version from a jar name", () => {
    it("reads the version the app's own downloads carry", () => {
        expect(versionFromJarName("/x/chunker-cli-1.19.1.jar")).toBe("1.19.1");
        expect(versionFromJarName("C:\\x\\chunker-cli-1.20.0.jar")).toBe("1.20.0");
    });

    it("answers null rather than guessing at a name that says nothing", () => {
        // A jar somebody renamed is a jar whose version is unknown. Inventing one would put
        // a wrong version into a provenance record, which is worse than an empty field.
        expect(versionFromJarName("/x/chunker.jar")).toBeNull();
        expect(versionFromJarName("/x/converter.jar")).toBeNull();
    });
});

describe("the release the app would fetch", () => {
    it("is pinned in source, and says plainly what the digest does and does not prove", () => {
        const release = pinnedRelease();

        expect(release.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(release.digestTrust).toBe("pinned");
        expect(release.url.startsWith("https://")).toBe(true);

        // The honesty requirement, asserted rather than trusted to stay in the prose: the
        // note must not imply a publisher signature, because there is not one.
        expect(release.verificationNote).toContain("do not publish a signature");
    });
});
