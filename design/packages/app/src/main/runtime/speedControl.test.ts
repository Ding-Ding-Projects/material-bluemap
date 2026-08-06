import { constants as osConstants } from "node:os";
import { describe, expect, it, vi } from "vitest";

import {
    LOCAL_PRIORITY_LEVELS,
    applyDockerCpuQuota,
    applyLocalPriority,
    dockerCpuQuotaForLevel,
    dockerUpdateCpusArguments,
    hostCpuCount,
    isSpeedLevel,
    localPriorityForLevel,
    localPriorityLevelFor,
} from "./speedControl.js";
import type { SpeedLevelNumber } from "./speedControl.js";
import type { CommandOutput } from "./command.js";

const LEVELS: readonly SpeedLevelNumber[] = [1, 2, 3, 4, 5];

function ok(): CommandOutput {
    return { ok: true, exitCode: 0, stdout: "", stderr: "", spawnError: null };
}

function refused(stderr: string): CommandOutput {
    return { ok: false, exitCode: 1, stdout: "", stderr, spawnError: null };
}

describe("isSpeedLevel", () => {
    it("accepts exactly the five integers 1 through 5", () => {
        for (const level of LEVELS) expect(isSpeedLevel(level)).toBe(true);
    });

    it("refuses everything else", () => {
        for (const value of [0, 6, -1, 3.5, "3", null, undefined, Number.NaN]) {
            expect(isSpeedLevel(value)).toBe(false);
        }
    });
});

describe("localPriorityForLevel", () => {
    it("covers every level exactly once, gentlest to fastest", () => {
        expect(LOCAL_PRIORITY_LEVELS.map((entry) => entry.level)).toEqual(LEVELS);
    });

    it("never reaches PRIORITY_HIGHEST, the level Windows silently downgrades without elevation", () => {
        for (const level of LEVELS) {
            expect(localPriorityForLevel(level).priority).not.toBe(osConstants.priority.PRIORITY_HIGHEST);
        }
    });

    it("climbs monotonically as the level rises", () => {
        const values = LEVELS.map((level) => localPriorityForLevel(level).priority);
        for (let i = 1; i < values.length; i++) {
            expect(values[i]).toBeLessThan(values[i - 1] as number);
        }
    });

    it("round-trips through localPriorityLevelFor for every real priority value", () => {
        for (const entry of LOCAL_PRIORITY_LEVELS) {
            expect(localPriorityLevelFor(entry.priority)).toEqual(entry);
        }
    });

    it("returns null for a priority value that matches no level", () => {
        expect(localPriorityLevelFor(999)).toBeNull();
    });
});

describe("applyLocalPriority", () => {
    it("asks the injected setPriority for exactly the requested level's priority", async () => {
        const setPriority = vi.fn();
        const getPriority = vi.fn().mockReturnValue(localPriorityForLevel(4).priority);
        const result = applyLocalPriority(4321, 4, { setPriority, getPriority });
        expect(setPriority).toHaveBeenCalledWith(4321, localPriorityForLevel(4).priority);
        expect(result.ok).toBe(true);
        expect(result.refused).toBe(false);
        expect(result.applied).toBe(localPriorityForLevel(4).priority);
    });

    it("reports a refusal when the OS granted a lower priority than was asked for", () => {
        const setPriority = vi.fn();
        // Windows silently drops an unprivileged raise to PRIORITY_HIGH's own numeric
        // neighbour; simulate that by having the read-back land at level 3 after a level 5 ask.
        const getPriority = vi.fn().mockReturnValue(localPriorityForLevel(3).priority);
        const result = applyLocalPriority(1, 5, { setPriority, getPriority });
        expect(result.ok).toBe(true);
        expect(result.refused).toBe(true);
    });

    it("never throws when setPriority itself throws - e.g. the process already exited", () => {
        const setPriority = vi.fn(() => {
            throw new Error("ESRCH: no such process");
        });
        const result = applyLocalPriority(999999, 3, { setPriority });
        expect(result.ok).toBe(false);
        expect(result.error).toContain("ESRCH");
    });

    it("still reports ok when the priority set worked but reading it back failed", () => {
        const setPriority = vi.fn();
        const getPriority = vi.fn(() => {
            throw new Error("gone");
        });
        const result = applyLocalPriority(1, 3, { setPriority, getPriority });
        expect(result.ok).toBe(true);
        expect(result.applied).toBeNull();
        expect(result.refused).toBe(false);
    });
});

describe("dockerCpuQuotaForLevel", () => {
    it("throttles levels 1 and 2 to a fraction of the host's logical cores", () => {
        expect(dockerCpuQuotaForLevel(1, 8)).toEqual({ level: 1, cpus: 2, unlimited: false });
        expect(dockerCpuQuotaForLevel(2, 8)).toEqual({ level: 2, cpus: 4, unlimited: false });
    });

    it("never asks for less than half a core, even on a single-core machine", () => {
        expect(dockerCpuQuotaForLevel(1, 1).cpus).toBeGreaterThanOrEqual(0.5);
        expect(dockerCpuQuotaForLevel(2, 1).cpus).toBeGreaterThanOrEqual(0.5);
    });

    it("resolves levels 3, 4 and 5 all to the same uncapped quota", () => {
        for (const level of [3, 4, 5] as const) {
            const quota = dockerCpuQuotaForLevel(level, 8);
            expect(quota.unlimited).toBe(true);
            expect(quota.cpus).toBe(0);
        }
    });

    it("throttles level 1 harder than level 2 on the same machine", () => {
        const one = dockerCpuQuotaForLevel(1, 16);
        const two = dockerCpuQuotaForLevel(2, 16);
        expect(one.cpus).toBeLessThan(two.cpus);
    });

    it("floors a fractional or non-positive core count to at least one core", () => {
        expect(dockerCpuQuotaForLevel(2, 0).cpus).toBeGreaterThan(0);
        expect(dockerCpuQuotaForLevel(2, -3).cpus).toBeGreaterThan(0);
    });
});

describe("dockerUpdateCpusArguments", () => {
    it("builds the exact docker update command", () => {
        expect(dockerUpdateCpusArguments("mb-render-abc", 2)).toEqual(["update", "--cpus", "2", "mb-render-abc"]);
    });

    it("spells 'no limit' as the literal 0 docker update itself documents", () => {
        expect(dockerUpdateCpusArguments("mb-render-abc", 0)).toEqual(["update", "--cpus", "0", "mb-render-abc"]);
    });
});

describe("applyDockerCpuQuota", () => {
    it("runs docker update against the named container with the injected runner", async () => {
        const runner = vi.fn().mockResolvedValue(ok());
        const result = await applyDockerCpuQuota("mb-render-xyz", 1, 8, { docker: "docker", runner });
        expect(runner).toHaveBeenCalledWith("docker", ["update", "--cpus", "2", "mb-render-xyz"], {});
        expect(result.ok).toBe(true);
        expect(result.quota).toEqual({ level: 1, cpus: 2, unlimited: false });
    });

    it("reports docker's own refusal rather than throwing when the container has stopped", async () => {
        const runner = vi.fn().mockResolvedValue(refused("Error: No such container: mb-render-xyz"));
        const result = await applyDockerCpuQuota("mb-render-xyz", 1, 8, { runner });
        expect(result.ok).toBe(false);
        expect(result.error).toContain("No such container");
    });

    it("defaults to the docker binary on PATH when none is given", async () => {
        const runner = vi.fn().mockResolvedValue(ok());
        await applyDockerCpuQuota("mb-render-xyz", 3, 8, { runner });
        expect(runner).toHaveBeenCalledWith("docker", expect.any(Array), {});
    });
});

describe("hostCpuCount", () => {
    it("is always at least 1", () => {
        expect(hostCpuCount()).toBeGreaterThanOrEqual(1);
    });
});
