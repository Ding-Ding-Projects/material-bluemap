// @vitest-environment jsdom

/**
 * The downloads surface, mounted.
 *
 * Its most load-bearing sentences live in the template rather than in a function, so
 * nothing next door reaches them: how large a download is, how much of it has arrived, how
 * long is left, and where the unpacked folder ended up. Each carries a value through
 * vue-i18n's fallback path, which is where a value goes missing without anything looking
 * broken. "1.7 GB of 4.03 GB" and " of " read the same from a distance, and only one of
 * them is a download somebody can judge.
 *
 * So the i18n here is the real one, built the way `i18n.ts` builds it: no messages loaded,
 * every key falling back. That is the state a build without translations stays in, and the
 * state this surface is nearly always rendered in.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import ReleaseDownloads from "./ReleaseDownloads.vue";
import type {
    DiscoveredRelease,
    DownloadBridge,
    DownloadEvent,
    DownloadResult,
    DownloadSummary,
} from "./downloadBridge.js";

beforeAll(() => {
    // jsdom has no layout engine, and Vuetify's fields and overlays observe their own size.
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;

    globalThis.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof globalThis.matchMedia;

    // Vuetify places an anchored overlay through a strategy that reads `visualViewport`
    // without guarding it, and jsdom does not define it. The reference error is thrown
    // inside a Vue watcher and swallowed there, so the menu's model flips and its card
    // never renders: the builder looks broken when the only thing missing is this stub.
    globalThis.visualViewport = {
        width: 1024,
        height: 768,
        offsetLeft: 0,
        offsetTop: 0,
        pageLeft: 0,
        pageTop: 0,
        scale: 1,
        onresize: null,
        onscroll: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    } as unknown as VisualViewport;
});

const RELEASE: DiscoveredRelease = {
    tag: "v1.4.0",
    name: "Har Gow",
    htmlUrl: "https://github.com/owner/repo/releases/tag/v1.4.0",
    downloads: [{ name: "test-world-seed-1739.zip", split: true, parts: 3, bytes: 4_030_000_000 }],
};

const DOWNLOAD_ID = "test-world-seed-1739-zip-6640a521a882";

interface FakeOptions {
    readonly active?: readonly string[];
    readonly list?: readonly DownloadSummary[];
    /** Wires up the "paste a link" field. Left out, the bridge cannot parse one at all. */
    readonly parseLink?: DownloadBridge["parseLink"];
}

function fakeBridge(options: FakeOptions = {}) {
    const listeners: ((event: DownloadEvent) => void)[] = [];
    const cancelled: string[] = [];

    const bridge: DownloadBridge = {
        discoverRelease: async () => ({ ok: true, release: RELEASE }),
        startDownload: async () => await new Promise<DownloadResult>(() => undefined),
        cancelDownload: async (downloadId) => {
            cancelled.push(downloadId);
            return true;
        },
        activeDownloads: async () => options.active ?? [],
        listDownloads: async () => options.list ?? [],
        onDownloadEvent: (listener) => {
            listeners.push(listener);
            return () => listeners.splice(listeners.indexOf(listener), 1);
        },
        parseLink: options.parseLink ?? (async () => null),
        canCancel: true,
        canList: true,
        canSeeActive: true,
        canParseLink: options.parseLink !== undefined,
    };

    return {
        bridge,
        cancelled,
        emit(event: DownloadEvent): void {
            for (const listener of [...listeners]) listener(event);
        },
    };
}

const vuetify = createVuetify();

/** The options `i18n.ts` ships: no messages, so every key falls back. */
function i18n() {
    return createI18n({
        legacy: false,
        missingWarn: false,
        fallbackWarn: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        messages: {},
    });
}

function render(bridge: DownloadBridge | null) {
    return mount(ReleaseDownloads, {
        props: { bridge },
        global: { plugins: [vuetify, i18n()] },
    });
}

/** A button by the words on it, which is how somebody finds it too. */
function button(wrapper: VueWrapper, text: string) {
    const found = wrapper.findAll("button").find((candidate) => candidate.text().includes(text));
    if (found === undefined) {
        throw new Error(`no button says "${text}". Buttons: ${wrapper.findAll("button").map((b) => b.text()).join(" | ")}`);
    }
    return found;
}

const STARTED: DownloadEvent = {
    type: "started",
    downloadId: DOWNLOAD_ID,
    asset: "test-world-seed-1739.zip",
    release: "v1.4.0",
    parts: 3,
    bytesTotal: 4_030_000_000,
    at: "2026-08-03T09:14:00.000Z",
};

describe("a build that cannot download", () => {
    it("says so, and offers no control that would throw", () => {
        const wrapper = render(null);

        expect(wrapper.text()).toContain("This build cannot download releases");
        expect(wrapper.findAll("button")).toHaveLength(0);
        expect(wrapper.findAll("input")).toHaveLength(0);

        wrapper.unmount();
    });
});

describe("looking at a release", () => {
    it("lists what it offers with the real size and the real number of parts", async () => {
        const fake = fakeBridge();
        const wrapper = render(fake.bridge);

        await button(wrapper, "See what it offers").trigger("click");
        await flushPromises();

        expect(wrapper.text()).toContain("test-world-seed-1739.zip");
        expect(wrapper.text()).toContain("4.03 GB");
        expect(wrapper.text()).toContain("published in 3 parts, checked and rejoined here");

        wrapper.unmount();
    });

    it("fetches nothing until somebody asks", async () => {
        let asked = 0;
        const fake = fakeBridge();
        const wrapper = render({
            ...fake.bridge,
            discoverRelease: async () => {
                asked++;
                return { ok: true, release: RELEASE };
            },
        });
        await flushPromises();

        expect(asked).toBe(0);
        wrapper.unmount();
    });
});

describe("pasting a link", () => {
    it("stays hidden when the bridge cannot resolve one", async () => {
        const fake = fakeBridge();
        const wrapper = render(fake.bridge);
        await flushPromises();

        expect(wrapper.text()).not.toContain("Paste a link");
        wrapper.unmount();
    });

    it("resolves a repository link into the owner, repository and tag fields", async () => {
        const fake = fakeBridge({
            parseLink: async (text) =>
                text === "https://github.com/cafepromenade/Andyville-World/releases/tag/andyville-backup-20260804-160001"
                    ? {
                          owner: "cafepromenade",
                          repo: "Andyville-World",
                          tag: "andyville-backup-20260804-160001",
                      }
                    : null,
        });
        const wrapper = render(fake.bridge);
        await flushPromises();

        const linkField = wrapper.get(".mb-downloads__link input");
        await linkField.setValue(
            "https://github.com/cafepromenade/Andyville-World/releases/tag/andyville-backup-20260804-160001",
        );
        await flushPromises();

        // Found by value rather than by position, so a template edit that reorders the
        // three fields cannot make this test pass while pointing at the wrong one.
        const values = wrapper.findAll("input").map((input) => input.element.value);
        expect(values).toContain("cafepromenade");
        expect(values).toContain("Andyville-World");
        expect(values).toContain("andyville-backup-20260804-160001");

        wrapper.unmount();
    });

    it("leaves the three fields alone for text that names no repository", async () => {
        const fake = fakeBridge({ parseLink: async () => null });
        const wrapper = render(fake.bridge);
        await flushPromises();

        const linkField = wrapper.get(".mb-downloads__link input");
        await linkField.setValue("still typing");
        await flushPromises();

        // The default owner/repo are untouched: a null answer must not blank a field
        // somebody had already filled in by hand.
        expect(wrapper.findAll("input").some((input) => input.element.value === "material-bluemap")).toBe(true);

        wrapper.unmount();
    });
});

describe("a download, on screen", () => {
    it("shows the phase, the bytes and the estimate, and can be stopped", async () => {
        const fake = fakeBridge();
        const wrapper = render(fake.bridge);

        await button(wrapper, "See what it offers").trigger("click");
        await flushPromises();
        await button(wrapper, "Download").trigger("click");
        await flushPromises();

        fake.emit(STARTED);
        fake.emit({
            type: "progress",
            downloadId: DOWNLOAD_ID,
            phase: "downloading",
            task: {
                phase: "downloading",
                description: "Transferring",
                bytesDone: 1_700_000_000,
                bytesTotal: 4_030_000_000,
                partsDone: 1,
                partsTotal: 3,
                currentPart: "test-world-seed-1739.zip.002",
                percent: 32.25,
                etaSeconds: 254,
                etaText: "4m 14s",
            },
            at: "t1",
        });
        await nextTick();

        expect(wrapper.text()).toContain("32.3%");
        expect(wrapper.text()).toContain("Transferring");
        expect(wrapper.text()).toContain("1.7 GB of 4.03 GB");
        expect(wrapper.text()).toContain("part 1 of 3");
        expect(wrapper.text()).toContain("about 4m 14s left");
        expect(wrapper.text()).toContain("test-world-seed-1739.zip.002");

        // The bar is a real progress bar to a screen reader, not a decorated div. Found
        // by its own class, because Vuetify gives every text field and every card a
        // hidden loader bar of the same component and any of those would match first.
        const bar = wrapper.find(".mb-download-row__bar");
        expect(bar.attributes("role")).toBe("progressbar");
        expect(bar.attributes("aria-valuenow")).toBe("32");
        expect(bar.attributes("aria-label")).toBe("Download progress for test-world-seed-1739.zip");

        await button(wrapper, "Stop this download").trigger("click");
        await flushPromises();
        expect(fake.cancelled).toEqual([DOWNLOAD_ID]);
        expect(wrapper.text()).toContain("Stopping keeps every byte already transferred");

        fake.emit({ type: "cancelled", downloadId: DOWNLOAD_ID, at: "t2" });
        await nextTick();
        expect(wrapper.text()).toContain("carries on from where it stopped");

        wrapper.unmount();
    });

    it("offers the unpacked folder once it is verified, and hands it over", async () => {
        const fake = fakeBridge();
        const wrapper = render(fake.bridge);
        await flushPromises();

        fake.emit(STARTED);
        fake.emit({
            type: "finished",
            downloadId: DOWNLOAD_ID,
            archive: "/var/maps/downloads/x/test-world-seed-1739.zip",
            content: "/var/maps/downloads/x/content",
            bytes: 4_030_000_000,
            sha256: "6640a521a88283195b790c8bdf6ca176e480c2f9399a8163153d02a2c5b72083",
            durationMs: 254_000,
            at: "t9",
        });
        await nextTick();

        expect(wrapper.text()).toContain("Downloaded and verified in 4 minutes");
        expect(wrapper.text()).toContain("Unpacked into /var/maps/downloads/x/content");

        await button(wrapper, "Use this folder").trigger("click");
        expect(wrapper.emitted("use")).toEqual([["/var/maps/downloads/x/content"]]);

        wrapper.unmount();
    });

    it("shows what the app said when a download fails, without a stack trace", async () => {
        const fake = fakeBridge();
        const wrapper = render(fake.bridge);
        await flushPromises();

        fake.emit(STARTED);
        fake.emit({
            type: "failed",
            downloadId: DOWNLOAD_ID,
            failure: {
                code: "integrity-failed",
                message: "The downloaded files do not match their published checksums, so nothing was kept.",
                settings: null,
                detail: "Part 3 of 3 (test-world-seed-1739.zip.003) does not match the manifest",
                status: null,
            },
            at: "t9",
        });
        await nextTick();

        expect(wrapper.text()).toContain("do not match their published checksums");
        expect(wrapper.text()).toContain("A file that is corrupt and looks complete is worse than no file");
        // The evidence is there, behind a disclosure, rather than pasted into the sentence.
        expect(wrapper.text()).not.toContain("does not match the manifest");

        // A screen reader announces aria-expanded on its own; without aria-controls it has
        // no region to say it is expanding. The button must name the id of the pre it
        // reveals, and that id has to actually exist once the disclosure is open.
        const detailToggle = button(wrapper, "Show what the app reported");
        const detailPanelId = detailToggle.attributes("aria-controls");
        expect(detailPanelId).toBeTruthy();
        expect(wrapper.find(`#${detailPanelId}`).exists()).toBe(false);

        await detailToggle.trigger("click");
        expect(wrapper.text()).toContain("Part 3 of 3 (test-world-seed-1739.zip.003) does not match the manifest");
        expect(button(wrapper, "Hide the detail").attributes("aria-controls")).toBe(detailPanelId);
        const detailPanel = wrapper.find(`#${detailPanelId}`);
        expect(detailPanel.exists()).toBe(true);
        expect(detailPanel.element.tagName).toBe("PRE");
        expect(detailPanel.text()).toContain("does not match the manifest");

        wrapper.unmount();
    });

    it("names the log region its toggle claims to expand", async () => {
        const fake = fakeBridge();
        const wrapper = render(fake.bridge);
        await flushPromises();

        fake.emit(STARTED);
        fake.emit({
            type: "log",
            downloadId: DOWNLOAD_ID,
            level: "info",
            message: "Resolved release v1.4.0 from Ding-Ding-Projects/material-bluemap",
            at: "t2",
        });
        await nextTick();

        const logToggle = button(wrapper, "Show what it reported");
        const logPanelId = logToggle.attributes("aria-controls");
        expect(logPanelId).toBeTruthy();
        // Collapsed by default, so the region the button claims to control does not exist
        // yet on the page - which is exactly what makes the missing pairing invisible to a
        // sighted reviewer clicking through, and exactly what a screen reader cannot skip.
        expect(wrapper.find(`#${logPanelId}`).exists()).toBe(false);

        await logToggle.trigger("click");
        expect(button(wrapper, "Hide what it reported").attributes("aria-controls")).toBe(logPanelId);
        const logPanel = wrapper.find(`#${logPanelId}`);
        expect(logPanel.exists()).toBe(true);
        expect(logPanel.element.tagName).toBe("PRE");
        expect(logPanel.text()).toContain("Resolved release v1.4.0 from Ding-Ding-Projects/material-bluemap");

        wrapper.unmount();
    });
});

describe("what was already going", () => {
    it("shows a download that started before this surface was opened", async () => {
        const fake = fakeBridge({ active: ["already-going-abc123"] });
        const wrapper = render(fake.bridge);
        await flushPromises();

        // Only the id is known until the next event arrives, and it is shown as the name
        // rather than left blank: a nameless row is one nobody can act on.
        expect(wrapper.text()).toContain("already-going-abc123");
        expect(button(wrapper, "Stop this download").attributes("disabled")).toBeUndefined();

        wrapper.unmount();
    });

    it("promises to carry on only where there is something to carry on from", async () => {
        const base = {
            asset: "test-world-seed-1739.zip",
            repository: "Ding-Ding-Projects/material-bluemap",
            tag: "v1.4.0",
            bytes: 4_030_000_000,
            parts: 3,
            split: true,
            archive: "/var/maps/downloads/x/test-world-seed-1739.zip",
            content: null,
            startedAt: "2026-08-02T09:14:00.000Z",
            finishedAt: "2026-08-02T09:20:00.000Z",
            durationMs: 360_000,
        };
        const fake = fakeBridge({
            list: [
                { ...base, downloadId: "stopped-one", outcome: "cancelled" },
                { ...base, downloadId: "broken-one", outcome: "failed" },
            ],
        });
        const wrapper = render(fake.bridge);
        await flushPromises();

        // Cancelling keeps every byte, so the button says so. A record that only says the
        // download failed cannot promise that, and offers a fresh attempt instead.
        expect(wrapper.text()).toContain("Carry on from where it stopped");
        expect(wrapper.text()).toContain("Try this download again");

        wrapper.unmount();
    });

    it("is searchable, by a field with its own regex builder anchored to it", async () => {
        const base = {
            repository: "Ding-Ding-Projects/material-bluemap",
            tag: "v1.4.0",
            bytes: 4_030_000_000,
            parts: 3,
            split: true,
            archive: "/var/maps/downloads/x/world.zip",
            content: null,
            startedAt: "2026-08-02T09:14:00.000Z",
            finishedAt: "2026-08-02T09:20:00.000Z",
            durationMs: 360_000,
            outcome: "cancelled" as const,
        };
        const fake = fakeBridge({
            list: [
                { ...base, downloadId: "one", asset: "overworld-1.21-hires.zip" },
                { ...base, downloadId: "two", asset: "the-nether-1.21-lowres.zip" },
            ],
        });
        const wrapper = render(fake.bridge);
        await flushPromises();

        // The field belongs to this list, and its builder is anchored inside it rather
        // than shared with the release's asset list further up the same screen.
        const field = wrapper.get(".mb-downloads__search .mb-config-search");
        expect(
            wrapper.find('.mb-downloads__search [aria-label="Open the regex builder"]').exists(),
        ).toBe(true);

        await field.get("input").setValue("nether");
        await nextTick();

        expect(wrapper.text()).toContain("the-nether-1.21-lowres.zip");
        expect(wrapper.text()).not.toContain("overworld-1.21-hires.zip");
        expect(wrapper.text()).toContain("Showing 1 of 2");

        // Plain text is the default, so a pattern-shaped query is matched literally and
        // finds nothing rather than quietly matching everything.
        await field.get("input").setValue(".*");
        await nextTick();
        expect(wrapper.text()).toContain("Nothing on this machine matches that search");

        // Filtering hid them; nothing was removed. Clearing brings both back.
        await field.get("input").setValue("");
        await nextTick();
        expect(wrapper.text()).toContain("overworld-1.21-hires.zip");
        expect(wrapper.text()).toContain("the-nether-1.21-lowres.zip");

        wrapper.unmount();
    });

    it("offers no search over an empty list, which would be a control that cannot act", async () => {
        const fake = fakeBridge();
        const wrapper = render(fake.bridge);
        await flushPromises();

        expect(wrapper.find(".mb-downloads__search").exists()).toBe(false);

        wrapper.unmount();
    });

    it("reads back a finished download from an earlier session", async () => {
        const fake = fakeBridge({
            list: [
                {
                    downloadId: DOWNLOAD_ID,
                    asset: "test-world-seed-1739.zip",
                    repository: "Ding-Ding-Projects/material-bluemap",
                    tag: "v1.4.0",
                    outcome: "finished",
                    bytes: 4_030_000_000,
                    parts: 3,
                    split: true,
                    archive: "/var/maps/downloads/x/test-world-seed-1739.zip",
                    content: "/var/maps/downloads/x/content",
                    startedAt: "2026-08-02T09:14:00.000Z",
                    finishedAt: "2026-08-02T09:31:14.000Z",
                    durationMs: 1_034_000,
                },
            ],
        });
        const wrapper = render(fake.bridge);
        await flushPromises();

        expect(wrapper.text()).toContain("Ding-Ding-Projects/material-bluemap");
        expect(wrapper.text()).toContain("3 parts, rejoined here");
        expect(wrapper.text()).toContain("Use this folder");

        wrapper.unmount();
    });
});
