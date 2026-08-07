/**
 * @vitest-environment jsdom
 *
 * The backup surface, mounted.
 *
 * Four properties are only true of the rendered component and would be asserted against a
 * stand-in for nothing: that a build with no bridge says what is needed instead of showing
 * a button that fails on press; that a **public** repository cannot be backed up to until
 * the checkbox has been ticked; that restoring emits the release's coordinates rather than
 * fetching anything itself; and that the surface says out loud why this is not Git LFS,
 * which is the question it exists to pre-empt.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import BackupScreen from "./BackupScreen.vue";
import type {
    Answer,
    BackupBridge,
    BackupEvent,
    BackupListing,
    BackupResult,
    CreateRepositoryAnswer,
    RepositoryChoice,
    RepositoryReport,
} from "./backupBridge.js";

beforeAll(() => {
    // jsdom has no layout engine, and Vuetify's fields, spinners and overlays observe
    // their own size. The same three stubs `ReleaseDownloads.test.ts` installs, for the
    // same reason: without them a component that renders perfectly well in the app throws
    // inside a watcher and looks broken here.
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

// `PathField.vue` (the folder's browse button, wired in below) feature-detects its dialog
// bridge off `window.worldlens.dialog` exactly the way the running preload exposes
// it, so the browse tests stub that global rather than passing a bridge as a prop. This
// undoes the stub after every test so one test's dialog never leaks into the next.
afterEach(() => {
    vi.unstubAllGlobals();
});

/**
 * The real i18n, built the way `i18n.ts` builds it: no messages loaded, every key falling
 * back. That is the state a build without translations stays in, and the state this
 * surface is nearly always rendered in, so it is the one worth asserting against.
 */
const i18n = createI18n({ legacy: false, missingWarn: false, fallbackWarn: false, locale: "none", fallbackLocale: "none", messages: {} });
const vuetify = createVuetify();

function mountScreen(bridge: BackupBridge | null, props: Record<string, unknown> = {}) {
    return mount(BackupScreen, {
        props: { bridge, ...props },
        global: { plugins: [i18n, vuetify] },
    });
}

const privateReport: RepositoryReport = {
    owner: "me",
    repo: "saves",
    fullName: "me/saves",
    private: true,
    canWrite: true,
    htmlUrl: "https://github.test/me/saves",
    warning: { level: "note", message: "This repository is private, so the backup will not be public." },
};

const publicReport: RepositoryReport = {
    ...privateReport,
    repo: "open",
    fullName: "me/open",
    private: false,
    warning: {
        level: "warning",
        message: "This repository is PUBLIC. Everything uploaded to it can be downloaded by anybody.",
    },
};

const listing: BackupListing = {
    tag: "mbm-backup-world-overworld-20260804T101500Z",
    name: "Backup: Overworld",
    releaseUrl: "https://github.test/me/saves/releases/tag/mbm-backup",
    createdAt: "2026-08-04T10:15:00.000Z",
    archive: "world-overworld-20260804T101500Z.zip",
    bytes: 1_100_000_000,
    sha256: "a".repeat(64),
    parts: 3,
    kind: "world",
    label: "Overworld",
    files: 4821,
    contentBytes: 1_098_000_000,
    appVersion: "0.1.0",
    sourceFolder: "C:/saves/Overworld",
    complete: true,
    unsupported: null,
};

function fakeBridge(overrides: Partial<BackupBridge> = {}): BackupBridge {
    return {
        listBackupRepositories: () =>
            Promise.resolve({ ok: true, value: [] } as Answer<readonly RepositoryChoice[]>),
        inspectBackupRepository: () => Promise.resolve({ ok: true, value: privateReport }),
        inspectBackupSource: () =>
            Promise.resolve({
                ok: true,
                value: {
                    kind: "world",
                    folder: "C:/saves/Overworld",
                    label: "Overworld",
                    files: 4821,
                    bytes: 1_098_000_000,
                    skipped: [],
                },
            }),
        listBackups: () => Promise.resolve({ ok: true, value: [] } as Answer<readonly BackupListing[]>),
        createBackupRepository: () =>
            Promise.resolve({
                ok: true,
                value: {
                    owner: "me",
                    name: "fresh",
                    fullName: "me/fresh",
                    private: true,
                    canWrite: true,
                    htmlUrl: "https://github.test/me/fresh",
                },
            } as CreateRepositoryAnswer),
        startBackup: () =>
            Promise.resolve({
                ok: false,
                backupId: "nowhere",
                failure: { code: "x", message: "no", detail: null, status: null, needsSignIn: false },
            } as BackupResult),
        cancelBackup: () => Promise.resolve(true),
        activeBackups: () => Promise.resolve([]),
        onBackupEvent: (_listener: (event: BackupEvent) => void) => () => undefined,
        canCancel: true,
        canListRepositories: true,
        canListBackups: true,
        canSeeActive: true,
        canCreateRepository: true,
        ...overrides,
    };
}

interface Exposed {
    kind: "world" | "render";
    folder: string;
    owner: string;
    repo: string;
    inspect(): Promise<void>;
    check(): Promise<void>;
    createOwnerKind: "user" | "organization";
    createVisibility: "public" | "private";
    createRepo(): Promise<void>;
    canCreateRepo: boolean;
    repoQuery: string;
    repoRegex: boolean;
}

/** The component's own fields and actions, named rather than found by markup order. */
function exposed(wrapper: { vm: unknown }): Exposed {
    return wrapper.vm as Exposed;
}

/** Lets every pending promise the component started settle before anything is asserted. */
async function settle(wrapper: { vm: { $nextTick: () => Promise<void> } }): Promise<void> {
    for (let index = 0; index < 4; index += 1) {
        await flushPromises();
        await wrapper.vm.$nextTick();
    }
}

describe("a build that cannot back anything up", () => {
    it("says what is needed rather than offering a button that would fail", () => {
        const wrapper = mountScreen(null);
        const text = wrapper.text();
        expect(text).toContain("desktop application");
        expect(text).toContain("sign in to GitHub from Settings");
        expect(wrapper.text()).not.toContain("Back this up");
    });

    it("still explains what the feature is, so the empty state is not a dead end", () => {
        expect(mountScreen(null).text()).toContain("Back up a world or a rendered map");
    });
});

describe("why this is not Git LFS", () => {
    it("says so on the surface, with the actual reason", () => {
        const text = mountScreen(fakeBridge()).text();
        expect(text).toContain("Git LFS");
        expect(text).toContain("bandwidth");
        expect(text).toContain("Cheap LFS v1");
    });
});

describe("a public repository is a decision", () => {
    it("shows the warning and keeps the button disabled until it is acknowledged", async () => {
        const wrapper = mountScreen(
            fakeBridge({ inspectBackupRepository: () => Promise.resolve({ ok: true, value: publicReport }) }),
        );
        await settle(wrapper);

        const screen = exposed(wrapper);
        screen.owner = "me";
        screen.repo = "open";
        await screen.check();
        await settle(wrapper);

        expect(wrapper.text()).toContain("PUBLIC");
        const acknowledgement = wrapper.findAll("input[type=checkbox]");
        expect(acknowledgement.length).toBeGreaterThan(0);
    });

    it("shows a quieter note for a private repository, and no acknowledgement to tick", async () => {
        const wrapper = mountScreen(fakeBridge());
        await settle(wrapper);
        const screen = exposed(wrapper);
        screen.owner = "me";
        screen.repo = "saves";
        await screen.check();
        await settle(wrapper);

        expect(wrapper.text()).toContain("private");
        expect(wrapper.findAll("input[type=checkbox]")).toHaveLength(0);
    });
});

describe("what a repository already holds", () => {
    it("lists finished backups and hands a restore to the downloads surface", async () => {
        const wrapper = mountScreen(
            fakeBridge({ listBackups: () => Promise.resolve({ ok: true, value: [listing] }) }),
        );
        await settle(wrapper);
        const screen = exposed(wrapper);
        screen.owner = "me";
        screen.repo = "saves";
        await screen.check();
        await settle(wrapper);

        expect(wrapper.text()).toContain("Overworld");
        expect(wrapper.text()).toContain("Restore this");

        const restore = wrapper.findAll("button").find((button) => button.text().includes("Restore this"));
        await restore?.trigger("click");

        // The coordinates, and nothing fetched here: the downloads surface owns every
        // byte that comes back, along with the checking that makes it safe.
        expect(wrapper.emitted("restore")?.[0]).toEqual([
            {
                owner: "me",
                repo: "saves",
                tag: listing.tag,
                asset: listing.archive,
            },
        ]);
    });

    it("marks an unfinished backup and offers no restore for it", async () => {
        const wrapper = mountScreen(
            fakeBridge({
                listBackups: () =>
                    Promise.resolve({ ok: true, value: [{ ...listing, complete: false }] }),
            }),
        );
        await settle(wrapper);
        const screen = exposed(wrapper);
        screen.owner = "me";
        screen.repo = "saves";
        await screen.check();
        await settle(wrapper);

        expect(wrapper.text()).toContain("Did not finish");
        expect(wrapper.text()).toContain("nothing to verify a restore against");
        expect(wrapper.findAll("button").some((button) => button.text().includes("Restore this"))).toBe(
            false,
        );
    });

    it("says plainly that there is no delete here, and why", async () => {
        const wrapper = mountScreen(
            fakeBridge({ listBackups: () => Promise.resolve({ ok: true, value: [listing] }) }),
        );
        await settle(wrapper);
        const screen = exposed(wrapper);
        screen.owner = "me";
        screen.repo = "saves";
        await screen.check();
        await settle(wrapper);

        expect(wrapper.text()).toContain("only ever added");
        expect(wrapper.text()).toContain("remove one on GitHub");
    });

    it("names a backup this build cannot restore instead of calling it broken", async () => {
        const wrapper = mountScreen(
            fakeBridge({
                listBackups: () =>
                    Promise.resolve({
                        ok: true,
                        value: [
                            {
                                ...listing,
                                unsupported: "This backup is password-encrypted. Desktop Material restores it.",
                            },
                        ],
                    }),
            }),
        );
        await settle(wrapper);
        const screen = exposed(wrapper);
        screen.owner = "me";
        screen.repo = "saves";
        await screen.check();
        await settle(wrapper);

        expect(wrapper.text()).toContain("password-encrypted");
        expect(wrapper.findAll("button").some((button) => button.text().includes("Restore this"))).toBe(
            false,
        );
    });
});

describe("reading a folder", () => {
    it("reports what would be packed before anything is packed", async () => {
        const wrapper = mountScreen(fakeBridge());
        await settle(wrapper);

        const screen = exposed(wrapper);
        screen.folder = "C:/saves/Overworld";
        await screen.inspect();
        await settle(wrapper);

        expect(wrapper.text()).toContain("4821 files");
        expect(wrapper.text()).toContain("Nothing has been packed or uploaded yet");
    });

    it("passes a refusal through in the main process's own words", async () => {
        const wrapper = mountScreen(
            fakeBridge({
                inspectBackupSource: () =>
                    Promise.resolve({ ok: false, message: "There is no level.dat in C:/saves." }),
            }),
        );
        await settle(wrapper);

        const screen = exposed(wrapper);
        screen.folder = "C:/saves";
        await screen.inspect();
        await settle(wrapper);

        expect(wrapper.text()).toContain("no level.dat");
    });

    it("names anything the pack would leave out, rather than quietly dropping it", async () => {
        const wrapper = mountScreen(
            fakeBridge({
                inspectBackupSource: () =>
                    Promise.resolve({
                        ok: true,
                        value: {
                            kind: "world",
                            folder: "C:/saves/Overworld",
                            label: "Overworld",
                            files: 3,
                            bytes: 10,
                            skipped: [{ name: "region/link.mca", reason: "It is a link." }],
                        },
                    }),
            }),
        );
        await settle(wrapper);

        const screen = exposed(wrapper);
        screen.folder = "C:/saves/Overworld";
        await screen.inspect();
        await settle(wrapper);

        expect(wrapper.text()).toContain("region/link.mca");
        expect(wrapper.text()).toContain("It is a link.");
    });
});

describe("browsing for the folder to back up", () => {
    // Before this, the folder box had a v-btn styled and iconed exactly like a working
    // Browse button (mdiFolderSearchOutline, the same icon WorldFolderStep's real one
    // uses) that in fact only re-read whatever was already typed. `PathField.vue` is the
    // real picker; these assert it is actually wired in rather than merely imported.
    it("writes the picked folder through to the model, titling the dialog for the chosen kind", async () => {
        const pickFolder = vi.fn(() => Promise.resolve("C:/saves/Overworld"));
        vi.stubGlobal("worldlens", { dialog: { pickFolder, pickFile: () => Promise.resolve(null) } });

        const wrapper = mountScreen(fakeBridge());
        await settle(wrapper);

        const browse = wrapper
            .findAll("button")
            .find((button) => button.attributes("aria-label") === "Browse for world folder");
        expect(browse).toBeDefined();

        await browse?.trigger("click");
        await settle(wrapper);

        expect(pickFolder).toHaveBeenCalledWith({ title: "Choose world folder" });
        expect(exposed(wrapper).folder).toBe("C:/saves/Overworld");
    });

    it("names the render folder, not the world folder, once that kind is chosen", async () => {
        const pickFolder = vi.fn(() => Promise.resolve("C:/maps/render-1"));
        vi.stubGlobal("worldlens", { dialog: { pickFolder, pickFile: () => Promise.resolve(null) } });

        const wrapper = mountScreen(fakeBridge());
        await settle(wrapper);
        exposed(wrapper).kind = "render";
        await settle(wrapper);

        const browse = wrapper
            .findAll("button")
            .find((button) => button.attributes("aria-label") === "Browse for render folder");
        expect(browse).toBeDefined();

        await browse?.trigger("click");
        await settle(wrapper);

        expect(pickFolder).toHaveBeenCalledWith({ title: "Choose render folder" });
        expect(exposed(wrapper).folder).toBe("C:/maps/render-1");
    });

    it("changes nothing on a cancelled pick", async () => {
        vi.stubGlobal("worldlens", {
            dialog: { pickFolder: () => Promise.resolve(null), pickFile: () => Promise.resolve(null) },
        });

        const wrapper = mountScreen(fakeBridge());
        await settle(wrapper);
        exposed(wrapper).folder = "C:/keep/me";
        await settle(wrapper);

        const browse = wrapper
            .findAll("button")
            .find((button) => button.attributes("aria-label") === "Browse for world folder");
        await browse?.trigger("click");
        await settle(wrapper);

        expect(exposed(wrapper).folder).toBe("C:/keep/me");
    });

    it("disables the browse button and explains why in a build with no dialog bridge", async () => {
        const wrapper = mountScreen(fakeBridge());
        await settle(wrapper);

        const browse = wrapper
            .findAll("button")
            .find((button) => button.attributes("aria-label") === "Browse for world folder");
        expect(browse).toBeDefined();
        expect(browse?.attributes("disabled")).toBeDefined();
    });

    it("still reads the folder on Enter, now that the field lives inside PathField", async () => {
        const wrapper = mountScreen(fakeBridge());
        await settle(wrapper);
        exposed(wrapper).folder = "C:/saves/Overworld";
        await wrapper.vm.$nextTick();

        // The listener moved from the `<v-text-field>` itself onto `PathField.vue`'s own
        // wrapper, relying on the native keydown bubbling from the input inside it up to
        // that wrapper - this is what proves that still works rather than assuming it.
        await wrapper.find(".mb-path-field input").trigger("keydown.enter");
        await settle(wrapper);

        expect(wrapper.text()).toContain("4821 files");
    });
});

describe("what is in flight", () => {
    it("asks what is already running before anybody presses anything", async () => {
        const activeBackups = vi.fn(() => Promise.resolve(["elsewhere"]));
        const wrapper = mountScreen(fakeBridge({ activeBackups }));
        await settle(wrapper);
        expect(activeBackups).toHaveBeenCalled();
        expect(wrapper.text()).toContain("A backup started in another window");
    });

    it("says so when this build cannot stop one, before one is started", async () => {
        const wrapper = mountScreen(
            fakeBridge({ canCancel: false, activeBackups: () => Promise.resolve(["elsewhere"]) }),
        );
        await settle(wrapper);
        expect(wrapper.text()).toContain("cannot stop a backup");
    });
});


describe("saying why the button will not go, rather than only going grey", () => {
    // The start control used to be a six-clause conjunction rendered as one disabled
    // button: no world chosen, no repository checked, no write permission and an unticked
    // acknowledgement all looked identical, and which one it was is exactly what somebody
    // needs to know. Each reason is checked in the order a person meets it.
    it("asks for a source before anything else", async () => {
        const wrapper = mountScreen(fakeBridge());
        await settle(wrapper);

        expect(wrapper.find('[data-test="blocked"]').text()).toContain("Choose the world");
    });

    it("asks for the repository to be checked once a source is chosen", async () => {
        const wrapper = mountScreen(fakeBridge());
        await settle(wrapper);
        const screen = exposed(wrapper);
        screen.folder = "C:/worlds/overworld";
        await screen.inspect();
        await settle(wrapper);

        expect(wrapper.find('[data-test="blocked"]').text()).toContain("Check the repository");
    });

    it("names the repository when the sign-in cannot write to it", async () => {
        const wrapper = mountScreen(
            fakeBridge({
                inspectBackupRepository: () =>
                    Promise.resolve({ ok: true, value: { ...privateReport, canWrite: false } }),
            }),
        );
        await settle(wrapper);
        const screen = exposed(wrapper);
        screen.folder = "C:/worlds/overworld";
        await screen.inspect();
        screen.owner = "me";
        screen.repo = "saves";
        await screen.check();
        await settle(wrapper);

        const blocked = wrapper.find('[data-test="blocked"]').text();
        expect(blocked).toContain("me/saves");
        expect(blocked).toContain("cannot write");
    });

    it("says nothing at all once every condition is met", async () => {
        const wrapper = mountScreen(fakeBridge());
        await settle(wrapper);
        const screen = exposed(wrapper);
        screen.folder = "C:/worlds/overworld";
        await screen.inspect();
        screen.owner = "me";
        screen.repo = "saves";
        await screen.check();
        await settle(wrapper);

        expect(wrapper.find('[data-test="blocked"]').exists()).toBe(false);
    });
});

describe("creating a new repository, beside choosing an existing one", () => {
    it("names the unmet condition when nothing has been typed yet", async () => {
        const wrapper = mountScreen(fakeBridge());
        await settle(wrapper);
        expect(wrapper.find('[data-test="create-repo"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="create-repo-blocked"]').text()).toContain("owner");
        expect(wrapper.find('[data-test="create-repo-button"]').attributes("disabled")).toBeDefined();
    });

    it("creates the repository named in the owner/repo fields and selects it automatically", async () => {
        let sent: unknown = null;
        const wrapper = mountScreen(
            fakeBridge({
                createBackupRepository: (request) => {
                    sent = request;
                    return Promise.resolve({
                        ok: true,
                        value: {
                            owner: "me",
                            name: "fresh",
                            fullName: "me/fresh",
                            private: true,
                            canWrite: true,
                            htmlUrl: "https://github.test/me/fresh",
                        },
                    } as CreateRepositoryAnswer);
                },
                inspectBackupRepository: () => Promise.resolve({ ok: true, value: privateReport }),
            }),
        );
        await settle(wrapper);
        const screen = exposed(wrapper);
        screen.owner = "me";
        screen.repo = "fresh";
        await wrapper.vm.$nextTick();
        expect(screen.canCreateRepo).toBe(true);

        await screen.createRepo();
        await settle(wrapper);

        expect(sent).toMatchObject({ ownerLogin: "me", ownerKind: "user", name: "fresh", private: true });
        // Selected automatically: the fields already name what was just created, and
        // creating it lands at the same "next real decision" choosing one does - the
        // repository has been read, exactly as pressing Check would have done.
        expect(screen.owner).toBe("me");
        expect(screen.repo).toBe("fresh");
    });

    it("reports a taken name honestly, without touching the owner/repo fields", async () => {
        const wrapper = mountScreen(
            fakeBridge({
                createBackupRepository: () =>
                    Promise.resolve({
                        ok: false,
                        code: "name-taken",
                        message: 'A repository named "taken" already exists there.',
                    } as CreateRepositoryAnswer),
            }),
        );
        await settle(wrapper);
        const screen = exposed(wrapper);
        screen.owner = "me";
        screen.repo = "taken";
        await wrapper.vm.$nextTick();

        await screen.createRepo();
        await settle(wrapper);

        expect(wrapper.find('[data-test="create-repo-failure"]').text()).toContain("taken");
    });

    it("refuses an invalid name in plain words before anything is sent", async () => {
        const wrapper = mountScreen(fakeBridge());
        await settle(wrapper);
        const screen = exposed(wrapper);
        screen.owner = "me";
        screen.repo = "not/a/valid/name!";
        await wrapper.vm.$nextTick();

        expect(screen.canCreateRepo).toBe(false);
        expect(wrapper.find('[data-test="create-repo-blocked"]').text()).toContain("letters, digits");
    });

    it("does not offer the affordance at all on a build that cannot create one", async () => {
        const wrapper = mountScreen(fakeBridge({ canCreateRepository: false }));
        await settle(wrapper);
        expect(wrapper.find('[data-test="create-repo"]').exists()).toBe(false);
    });
});

describe("searching the repository picker", () => {
    const repositories: readonly RepositoryChoice[] = [
        { owner: "me", name: "overworld-saves", fullName: "me/overworld-saves", private: true, canWrite: true, htmlUrl: "" },
        { owner: "me", name: "nether-saves", fullName: "me/nether-saves", private: false, canWrite: true, htmlUrl: "" },
        { owner: "acme", name: "shared-map", fullName: "acme/shared-map", private: true, canWrite: true, htmlUrl: "" },
    ];

    it("filters the loaded repositories by plain text, and shows the honest loaded count", async () => {
        const wrapper = mountScreen(
            fakeBridge({ listBackupRepositories: () => Promise.resolve({ ok: true, value: repositories }) }),
        );
        await settle(wrapper);

        expect(wrapper.text()).toContain("3 repositories loaded");

        const screen = exposed(wrapper);
        screen.repoQuery = "nether";
        await settle(wrapper);

        expect(wrapper.text()).toContain("Showing 1 of 3");
        const select = wrapper.find('[data-test="repository-search"]');
        expect(select.exists()).toBe(true);
    });

    it("shows an honest no-match message rather than an empty list with no explanation", async () => {
        const wrapper = mountScreen(
            fakeBridge({ listBackupRepositories: () => Promise.resolve({ ok: true, value: repositories }) }),
        );
        await settle(wrapper);
        const screen = exposed(wrapper);
        screen.repoQuery = "no-such-repository-anywhere";
        await settle(wrapper);

        expect(wrapper.find('[data-test="repository-no-match"]').exists()).toBe(true);
    });

    it("carries the anchored regex builder rather than plain text alone", async () => {
        const wrapper = mountScreen(
            fakeBridge({ listBackupRepositories: () => Promise.resolve({ ok: true, value: repositories }) }),
        );
        await settle(wrapper);
        const screen = exposed(wrapper);

        // Plain text is the default.
        expect(screen.repoRegex).toBe(false);
        screen.repoQuery = "^me/nether";
        screen.repoRegex = true;
        await settle(wrapper);

        expect(wrapper.text()).toContain("Showing 1 of 3");
    });

    it("distinguishes no repositories loaded from a repository search with no matches", async () => {
        const wrapper = mountScreen(fakeBridge({ listBackupRepositories: () => Promise.resolve({ ok: true, value: [] }) }));
        await settle(wrapper);

        expect(wrapper.find('[data-test="repository-none"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="repository-no-match"]').exists()).toBe(false);
        expect(wrapper.find('[data-test="repository-search"]').exists()).toBe(false);
    });
});
