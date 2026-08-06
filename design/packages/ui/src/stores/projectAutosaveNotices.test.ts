import { describe, expect, it } from "vitest";
import {
    autosaveNoticeFor,
    handleProjectAutosaveOutcome,
    type ProjectAutosaveOutcome,
} from "./projectAutosaveNotices.js";

function outcome(
    reason: ProjectAutosaveOutcome["reason"],
    result: ProjectAutosaveOutcome["result"],
): ProjectAutosaveOutcome {
    return { worldFolder: "C:/worlds/overworld", reason, result };
}

describe("what an autosave outcome earns", () => {
    it("stays silent for a routine, successful, quiet autosave - the History tab is the indicator", () => {
        const notice = autosaveNoticeFor(
            outcome("quiet", { ok: true, historyOk: true, historyMessage: "Recorded the save." }),
        );
        expect(notice).toBeNull();
    });

    it("stays silent for a successful flush at a boundary too - it is still just an autosave", () => {
        for (const reason of ["boundary", "destructive", "quit"] as const) {
            const notice = autosaveNoticeFor(
                outcome(reason, { ok: true, historyOk: true, historyMessage: "Recorded the save." }),
            );
            expect(notice).toBeNull();
        }
    });

    it("warns when the file was written but no revision could be kept", () => {
        const notice = autosaveNoticeFor(
            outcome("quiet", {
                ok: true,
                historyOk: false,
                historyMessage: "The project was autosaved, but this build could not keep a record of it.",
            }),
        );
        expect(notice).toEqual({
            level: "warning",
            message: "The project was autosaved, but this build could not keep a record of it.",
        });
    });

    it("errors when the autosave write itself failed", () => {
        const notice = autosaveNoticeFor(
            outcome("quiet", { ok: false, reason: "The project could not be autosaved: disk is full." }),
        );
        expect(notice).toEqual({ level: "error", message: "The project could not be autosaved: disk is full." });
    });

    it("still reports a failure at a flushed boundary, because that is exactly when it matters most", () => {
        const notice = autosaveNoticeFor(
            outcome("quit", { ok: false, reason: "The project could not be autosaved: git is missing." }),
        );
        expect(notice).toEqual({ level: "error", message: "The project could not be autosaved: git is missing." });
    });
});

describe("handleProjectAutosaveOutcome", () => {
    it("calls the injected raise function for a failure, and not at all for a quiet success", () => {
        const raised: { level: string; message: string }[] = [];
        const raise = (level: string, message: string): void => {
            raised.push({ level, message });
        };

        handleProjectAutosaveOutcome(
            outcome("quiet", { ok: true, historyOk: true, historyMessage: "Recorded the save." }),
            raise,
        );
        expect(raised).toEqual([]);

        handleProjectAutosaveOutcome(
            outcome("quiet", { ok: false, reason: "The project could not be autosaved: disk is full." }),
            raise,
        );
        expect(raised).toEqual([
            { level: "error", message: "The project could not be autosaved: disk is full." },
        ]);
    });
});
