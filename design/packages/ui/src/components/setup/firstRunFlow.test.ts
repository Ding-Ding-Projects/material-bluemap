import { beforeEach, describe, expect, it } from "vitest";
import { memoryStorage, setSetupStorage } from "./setupPrefs.js";
import { defaultMapStorageDir, readMapStorageDir } from "./mapStorage.js";
import {
    SETUP_STEPS,
    createConsentSettings,
    createFirstRunController,
    formatConsentTimestamp,
    type ConsentRecordLike,
    type FirstRunStateLike,
    type SetupBridge,
} from "./firstRunFlow.js";

const ACCEPTED: ConsentRecordLike = {
    accepted: true,
    acceptedAt: "2026-08-03T09:14:00.000Z",
    documentUrl: "https://account.mojang.com/documents/minecraft_eula",
    termsVersion: 1,
    appVersion: "0.1.0",
};

const UNACCEPTED: ConsentRecordLike = {
    accepted: false,
    acceptedAt: null,
    documentUrl: "https://account.mojang.com/documents/minecraft_eula",
    termsVersion: 1,
    appVersion: null,
};

interface FakeBridge extends SetupBridge {
    calls: string[];
    record: ConsentRecordLike;
    firstRunNeeded: boolean;
    completions: number;
    failOn: string | null;
}

function fakeBridge(overrides: Partial<Pick<FakeBridge, "record" | "firstRunNeeded">> = {}): FakeBridge {
    const bridge: FakeBridge = {
        calls: [],
        record: overrides.record ?? UNACCEPTED,
        firstRunNeeded: overrides.firstRunNeeded ?? true,
        completions: 0,
        failOn: null,
        readConsent() {
            bridge.calls.push("readConsent");
            if (bridge.failOn === "readConsent") return Promise.reject(new Error("no bridge"));
            return Promise.resolve(bridge.record);
        },
        acceptDownload() {
            bridge.calls.push("acceptDownload");
            if (bridge.failOn === "acceptDownload") return Promise.reject(new Error("disk full"));
            bridge.record = ACCEPTED;
            return Promise.resolve(bridge.record);
        },
        revokeDownloadConsent() {
            bridge.calls.push("revokeDownloadConsent");
            if (bridge.failOn === "revokeDownloadConsent") {
                return Promise.reject(new Error("read only"));
            }
            bridge.record = UNACCEPTED;
            return Promise.resolve(bridge.record);
        },
        needsFirstRun() {
            bridge.calls.push("needsFirstRun");
            if (bridge.failOn === "needsFirstRun") return Promise.reject(new Error("no ipc"));
            return Promise.resolve(bridge.firstRunNeeded);
        },
        completeFirstRun(): Promise<FirstRunStateLike> {
            bridge.calls.push("completeFirstRun");
            if (bridge.failOn === "completeFirstRun") {
                return Promise.reject(new Error("could not write first-run.json"));
            }
            bridge.completions += 1;
            return Promise.resolve({ completed: true, completedAt: "2026-08-03T09:15:00.000Z" });
        },
    };
    return bridge;
}

function controller(bridge: SetupBridge | null) {
    return createFirstRunController({ bridge, storageBridge: null, platform: "linux" });
}

beforeEach(() => {
    setSetupStorage(memoryStorage());
});

describe("showing the flow at all", () => {
    it("opens on a first launch", async () => {
        const bridge = fakeBridge();
        const flow = controller(bridge);
        expect(await flow.start()).toBe(true);
        expect(flow.visible.value).toBe(true);
        expect(flow.step.value).toBe("welcome");
    });

    it("stays closed once setup has been completed", async () => {
        const bridge = fakeBridge({ firstRunNeeded: false });
        const flow = controller(bridge);
        expect(await flow.start()).toBe(false);
        expect(flow.visible.value).toBe(false);
    });

    it("shows nothing in a build with no bridge, where there is nothing to consent to", async () => {
        const flow = controller(null);
        expect(await flow.start()).toBe(false);
        expect(flow.visible.value).toBe(false);
    });

    it("reports a bridge that cannot be asked instead of inventing a first run", async () => {
        const bridge = fakeBridge();
        bridge.failOn = "needsFirstRun";
        const flow = controller(bridge);
        expect(await flow.start()).toBe(false);
        expect(flow.visible.value).toBe(false);
        expect(flow.failure.value).toBe("no ipc");
    });

    it("reflects an answer that was already given rather than asking it as new", async () => {
        const bridge = fakeBridge({ record: ACCEPTED });
        const flow = controller(bridge);
        await flow.start();
        expect(flow.answer.value).toBe("accepted");
    });
});

describe("moving between steps", () => {
    it("counts the steps for the progress line", async () => {
        const flow = controller(fakeBridge());
        await flow.start();
        expect(flow.stepCount).toBe(SETUP_STEPS.length);
        expect(flow.stepNumber.value).toBe(1);
        flow.next();
        expect(flow.stepNumber.value).toBe(2);
    });

    /*
     * The licence comes before the question, which is the whole point of it being a step.
     * A document offered after the buttons is a document nobody opens, and one offered as
     * a link beside them is one people click past.
     */
    it("shows the licence before it asks the question", async () => {
        const flow = controller(fakeBridge());
        await flow.start();
        expect(flow.step.value).toBe("welcome");
        flow.next();
        expect(flow.step.value).toBe("eula");
        flow.next();
        expect(flow.step.value).toBe("consent");
        flow.back();
        expect(flow.step.value).toBe("eula");
    });

    it("will not walk past the consent question", async () => {
        const flow = controller(fakeBridge());
        await flow.start();
        flow.next();
        flow.next();
        expect(flow.step.value).toBe("consent");
        flow.next();
        // Still on consent: Accept and Decline are the only ways forward.
        expect(flow.step.value).toBe("consent");
    });

    it("goes back without losing the answer", async () => {
        const flow = controller(fakeBridge());
        await flow.start();
        flow.next();
        await flow.answerConsent(true);
        expect(flow.step.value).toBe("storage");
        flow.back();
        expect(flow.step.value).toBe("consent");
        expect(flow.answer.value).toBe("accepted");
    });

    it("does not go back past the first step", async () => {
        const flow = controller(fakeBridge());
        await flow.start();
        flow.back();
        expect(flow.step.value).toBe("welcome");
    });
});

describe("answering consent", () => {
    it("records an acceptance through the main process", async () => {
        const bridge = fakeBridge();
        const flow = controller(bridge);
        await flow.start();
        flow.next();
        await flow.answerConsent(true);
        expect(bridge.calls).toContain("acceptDownload");
        expect(bridge.record.accepted).toBe(true);
        expect(flow.answer.value).toBe("accepted");
    });

    it("writes nothing when a decline has nothing to undo", async () => {
        const bridge = fakeBridge();
        const flow = controller(bridge);
        await flow.start();
        flow.next();
        await flow.answerConsent(false);
        expect(bridge.calls).not.toContain("acceptDownload");
        expect(bridge.calls).not.toContain("revokeDownloadConsent");
        expect(flow.answer.value).toBe("declined");
        expect(flow.step.value).toBe("storage");
    });

    it("withdraws a previous acceptance when the answer is changed to decline", async () => {
        const bridge = fakeBridge();
        const flow = controller(bridge);
        await flow.start();
        flow.next();
        await flow.answerConsent(true);
        flow.back();
        await flow.answerConsent(false);
        expect(bridge.calls).toContain("revokeDownloadConsent");
        expect(bridge.record.accepted).toBe(false);
        expect(flow.answer.value).toBe("declined");
    });

    it("stays on the question and reports a failure rather than claiming an answer", async () => {
        const bridge = fakeBridge();
        bridge.failOn = "acceptDownload";
        const flow = controller(bridge);
        await flow.start();
        flow.next();
        flow.next();
        await flow.answerConsent(true);
        expect(flow.answer.value).toBeNull();
        expect(flow.step.value).toBe("consent");
        expect(flow.failure.value).toBe("disk full");
    });
});

describe("completing the flow", () => {
    it("completes after an acceptance", async () => {
        const bridge = fakeBridge();
        const flow = controller(bridge);
        await flow.start();
        flow.next();
        await flow.answerConsent(true);
        expect(await flow.finish()).toBe(true);
        expect(bridge.completions).toBe(1);
        expect(flow.visible.value).toBe(false);
    });

    it("completes after a decline, so nobody is asked again every launch", async () => {
        // The whole point of `completeFirstRun` being separate from `acceptDownload`:
        // declining is an answer, and somebody who gave it does not get worn down by
        // being asked once per launch until they give in.
        const bridge = fakeBridge();
        const flow = controller(bridge);
        await flow.start();
        flow.next();
        await flow.answerConsent(false);
        expect(await flow.finish()).toBe(true);
        expect(bridge.completions).toBe(1);
        expect(bridge.record.accepted).toBe(false);
    });

    it("completes exactly once even if finish is pressed again", async () => {
        const bridge = fakeBridge();
        const flow = controller(bridge);
        await flow.start();
        flow.next();
        await flow.answerConsent(false);
        await flow.finish();
        await flow.finish();
        expect(bridge.completions).toBe(1);
    });

    it("stores the chosen map folder", async () => {
        const bridge = fakeBridge();
        const flow = controller(bridge);
        await flow.start();
        flow.storageDir.value = "  /srv/bluemap/maps/ ";
        flow.next();
        await flow.answerConsent(true);
        await flow.finish();
        expect(readMapStorageDir()).toBe("/srv/bluemap/maps");
    });

    it("refuses to finish on an unusable folder rather than writing one nobody chose", async () => {
        const bridge = fakeBridge();
        const flow = controller(bridge);
        await flow.start();
        flow.storageDir.value = "maps";
        expect(flow.storageProblem.value).toBe("relative");
        expect(await flow.finish()).toBe(false);
        expect(bridge.completions).toBe(0);
        expect(flow.visible.value).toBe(true);
    });

    it("keeps the dialog open and says so when the flag could not be written", async () => {
        const bridge = fakeBridge();
        bridge.failOn = "completeFirstRun";
        const flow = controller(bridge);
        await flow.start();
        flow.next();
        await flow.answerConsent(true);
        expect(await flow.finish()).toBe(false);
        expect(flow.visible.value).toBe(true);
        expect(flow.failure.value).toContain("first-run.json");
        // Setup will open again next launch, which is the safe direction, and the person
        // is not trapped in the dialog meanwhile.
        flow.dismissAfterFailure();
        expect(flow.visible.value).toBe(false);
    });
});

describe("the map folder default", () => {
    it("starts at the platform default", () => {
        const flow = controller(fakeBridge());
        expect(flow.storageDir.value).toBe(defaultMapStorageDir("linux"));
        expect(flow.storageIsToken.value).toBe(true);
    });

    it("starts at a previously stored answer instead", () => {
        setSetupStorage(memoryStorage({ "material-bluemap.maps.directory": "/srv/maps" }));
        const flow = controller(fakeBridge());
        expect(flow.storageDir.value).toBe("/srv/maps");
        expect(flow.storageIsToken.value).toBe(false);
    });

    it("comes back to the default on request", () => {
        const flow = controller(fakeBridge());
        flow.storageDir.value = "/somewhere/else";
        flow.useDefaultStorage();
        expect(flow.storageDir.value).toBe(defaultMapStorageDir("linux"));
    });

    // There used to be a folder-picker test trio here, exercising `flow.canBrowse` and
    // `flow.browse()` against a `chooseMapStorageDirectory` bridge method that no build
    // ever implemented. The storage step's browse button is `PathField.vue` now, which
    // reaches the real `window.materialBluemap.dialog` bridge directly and is exercised
    // by `PathField.test.ts` and `SetupStorageStep.test.ts`; there is nothing left in
    // this flow for a picker to gate.

    it("prefers a real resolved default over the token form when one is offered", async () => {
        const bridge = fakeBridge();
        const flow = createFirstRunController({
            bridge,
            storageBridge: {
                mapStorageDirectory: () =>
                    Promise.resolve({
                        current: "/home/you/.config/mb/maps",
                        default: "/home/you/.config/mb/maps",
                    }),
            },
            platform: "linux",
        });
        await flow.start();
        expect(flow.storageDir.value).toBe("/home/you/.config/mb/maps");
        expect(flow.storageIsToken.value).toBe(false);
    });

    it("shows where maps are really written, not merely where they would be by default", async () => {
        // The two are the same on a fresh install and diverge the moment anybody moves
        // the folder. Showing the default then would describe a folder nothing writes to.
        const flow = createFirstRunController({
            bridge: fakeBridge(),
            storageBridge: {
                mapStorageDirectory: () =>
                    Promise.resolve({ current: "/srv/bluemap/maps", default: "/home/you/.config/mb/maps" }),
            },
            platform: "linux",
        });
        await flow.start();
        expect(flow.storageDir.value).toBe("/srv/bluemap/maps");
    });

    it("does not overwrite an answer somebody already gave", async () => {
        setSetupStorage(memoryStorage({ "material-bluemap.maps.directory": "/srv/maps" }));
        const flow = createFirstRunController({
            bridge: fakeBridge(),
            storageBridge: {
                mapStorageDirectory: () =>
                    Promise.resolve({ current: "/home/you/.config/mb/maps", default: "/home/you/.config/mb/maps" }),
            },
            platform: "linux",
        });
        await flow.start();
        expect(flow.storageDir.value).toBe("/srv/maps");
    });

    it("sends 'use the default' to the resolved default rather than back to the token", async () => {
        const flow = createFirstRunController({
            bridge: fakeBridge(),
            storageBridge: {
                mapStorageDirectory: () =>
                    Promise.resolve({ current: "/srv/bluemap/maps", default: "/home/you/.config/mb/maps" }),
            },
            platform: "linux",
        });
        await flow.start();
        flow.storageDir.value = "/somewhere/else";
        flow.useDefaultStorage();
        expect(flow.storageDir.value).toBe("/home/you/.config/mb/maps");
    });

    it("keeps the token form when the lookup fails, rather than stopping setup over it", async () => {
        const flow = createFirstRunController({
            bridge: fakeBridge(),
            storageBridge: {
                mapStorageDirectory: () => Promise.reject(new Error("no ipc")),
            },
            platform: "linux",
        });
        expect(await flow.start()).toBe(true);
        expect(flow.storageDir.value).toBe(defaultMapStorageDir("linux"));
        expect(flow.failure.value).toBeNull();
    });
});

describe("consent, as seen from settings", () => {
    it("reads the stored record", async () => {
        const bridge = fakeBridge({ record: ACCEPTED });
        const settings = createConsentSettings(bridge);
        await settings.load();
        expect(settings.accepted.value).toBe(true);
        expect(settings.record.value?.acceptedAt).toBe("2026-08-03T09:14:00.000Z");
    });

    it("accepts and withdraws, both directions being real", async () => {
        const bridge = fakeBridge();
        const settings = createConsentSettings(bridge);
        await settings.load();
        expect(settings.accepted.value).toBe(false);

        await settings.accept();
        expect(settings.accepted.value).toBe(true);

        await settings.withdraw();
        expect(settings.accepted.value).toBe(false);
    });

    it("reports a failure instead of showing a state that was not stored", async () => {
        const bridge = fakeBridge();
        bridge.failOn = "acceptDownload";
        const settings = createConsentSettings(bridge);
        await settings.load();
        await settings.accept();
        expect(settings.accepted.value).toBe(false);
        expect(settings.failure.value).toBe("disk full");
    });

    it("knows when there is no bridge to talk to", () => {
        const settings = createConsentSettings(null);
        expect(settings.available).toBe(false);
    });

    it("tells a decline apart from a question that was never put", async () => {
        // The stored record has only accepted true or false, so a decline and an unasked
        // question look identical in it. Setup having completed is what separates them.
        const neverAsked = fakeBridge({ firstRunNeeded: true });
        const first = createConsentSettings(neverAsked);
        await first.load();
        expect(first.accepted.value).toBe(false);
        expect(first.asked.value).toBe(false);

        const declined = fakeBridge({ firstRunNeeded: false });
        const second = createConsentSettings(declined);
        await second.load();
        expect(second.accepted.value).toBe(false);
        expect(second.asked.value).toBe(true);
    });
});

describe("when the answer was given", () => {
    it("formats the stored timestamp for reading", () => {
        const formatted = formatConsentTimestamp("2026-08-03T09:14:00.000Z", "en-GB");
        expect(formatted).not.toBeNull();
        expect(formatted).toContain("2026");
    });

    it("survives an upstream locale name that is not a BCP 47 tag", () => {
        // BlueMap ships `zh_cn`, `pt_br` and friends; `Intl` throws on the underscore.
        expect(formatConsentTimestamp("2026-08-03T09:14:00.000Z", "zh_cn")).not.toBeNull();
    });

    it("has no answer to give when nothing was recorded", () => {
        expect(formatConsentTimestamp(null, "en")).toBeNull();
        expect(formatConsentTimestamp("not a date", "en")).toBeNull();
    });
});
