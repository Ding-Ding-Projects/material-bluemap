import { afterAll, describe, expect, it } from "vitest";
import type { IpcMain, IpcMainInvokeEvent, OpenDialogOptions, OpenDialogReturnValue } from "electron";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
    CONFIG_CHANNELS,
    checkConfigPath,
    defaultConfigDirectory,
    dialectName,
    jdbcSubprotocol,
    noSqlDriver,
    probeSqlConnection,
    readConfigFolder,
    registerConfigHandlers,
    type ConfigFolderContents,
    type OpenDialogHost,
    type SqlDriver,
    type SqlProbeResult,
} from "./ipc.js";

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

/**
 * Just enough of `ipcMain` to register against.
 *
 * The module takes `IpcMain` as a parameter and imports Electron only as a type, so every
 * channel can be exercised exactly as the renderer would reach it with no Electron runtime
 * anywhere near the test - native pickers included, which is the whole reason the dialog
 * is a parameter too.
 */
function fakeIpcMain(): IpcMain & { readonly handlers: Map<string, Handler> } {
    const handlers = new Map<string, Handler>();
    return {
        handlers,
        handle(channel: string, handler: Handler): void {
            if (handlers.has(channel)) throw new Error(`second handler for '${channel}'`);
            handlers.set(channel, handler);
        },
        removeHandler(channel: string): void {
            handlers.delete(channel);
        },
    } as unknown as IpcMain & { readonly handlers: Map<string, Handler> };
}

const noEvent = {} as IpcMainInvokeEvent;

function fakeDialog(answer: OpenDialogReturnValue): OpenDialogHost & { readonly seen: OpenDialogOptions[] } {
    const seen: OpenDialogOptions[] = [];
    return {
        seen,
        showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogReturnValue> {
            seen.push(options);
            return Promise.resolve(answer);
        },
    };
}

const cancelled: OpenDialogReturnValue = { canceled: true, filePaths: [] };

/* -------------------------------------------------------------------------- */
/* Real folders, in a real temporary directory                                */
/* -------------------------------------------------------------------------- */

const created: string[] = [];

async function tempFolder(): Promise<string> {
    const folder = await mkdtemp(join(tmpdir(), "mb-config-"));
    created.push(folder);
    return folder;
}

async function put(folder: string, relative: string, text: string): Promise<string> {
    const path = join(folder, ...relative.split("/"));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text, "utf8");
    return path;
}

async function exists(path: string): Promise<boolean> {
    return await stat(path).then(
        () => true,
        () => false,
    );
}

afterAll(async () => {
    for (const folder of created) await rm(folder, { recursive: true, force: true });
});

/**
 * Whether this machine lets an unprivileged process make links.
 *
 * Windows refuses a file symbolic link without either developer mode or an elevated
 * process, so the link refusals are proved wherever they can be - always on the Linux
 * runner that lints and tests this repository - rather than turned into a test that
 * quietly passes by doing nothing.
 */
function linkSupport(): { directory: boolean; file: boolean } {
    const probe = mkdtempSync(join(tmpdir(), "mb-config-links-"));
    let directory = false;
    let file = false;
    try {
        mkdirSync(join(probe, "target"));
        symlinkSync(join(probe, "target"), join(probe, "dirLink"), "junction");
        directory = true;
    } catch {
        // Not available here; the tests that need it are skipped.
    }
    try {
        writeFileSync(join(probe, "target.conf"), "", "utf8");
        symlinkSync(join(probe, "target.conf"), join(probe, "fileLink.conf"), "file");
        file = true;
    } catch {
        // Same.
    }
    rmSync(probe, { recursive: true, force: true });
    return { directory, file };
}

const LINKS = linkSupport();

/* -------------------------------------------------------------------------- */
/* Registration                                                               */
/* -------------------------------------------------------------------------- */

interface Registered {
    readonly ipcMain: IpcMain & { readonly handlers: Map<string, Handler> };
    readonly dialog: OpenDialogHost & { readonly seen: OpenDialogOptions[] };
    call(channel: (typeof CONFIG_CHANNELS)[number], ...args: unknown[]): Promise<unknown>;
}

function register(options?: {
    readonly dataDir?: string;
    readonly answer?: OpenDialogReturnValue;
    readonly sqlDriver?: SqlDriver | null;
}): Registered {
    const ipcMain = fakeIpcMain();
    const dialog = fakeDialog(options?.answer ?? cancelled);
    registerConfigHandlers(ipcMain, {
        dataDir: options?.dataDir ?? join(tmpdir(), "userData"),
        dialog,
        ...(options?.sqlDriver === undefined
            ? {}
            : { sqlDriver: (): Promise<SqlDriver | null> => Promise.resolve(options.sqlDriver ?? null) }),
    });
    return {
        ipcMain,
        dialog,
        async call(channel, ...args): Promise<unknown> {
            const handler = ipcMain.handlers.get(channel);
            if (handler === undefined) throw new Error(`${channel} was not registered`);
            return await Promise.resolve(handler(noEvent, ...args));
        },
    };
}

/** The rejection a call produced, so its message can be read rather than merely counted. */
async function refusal(run: Promise<unknown>): Promise<Error> {
    const thrown = await run.then(
        () => new Error("the handler resolved instead of rejecting"),
        (error: unknown) => error,
    );
    expect(thrown).toBeInstanceOf(Error);
    return thrown as Error;
}

describe("registerConfigHandlers", () => {
    it("registers exactly the channels it names, and takes them off again", () => {
        const ipcMain = fakeIpcMain();
        const dialog = fakeDialog(cancelled);

        const config = registerConfigHandlers(ipcMain, { dataDir: "/userData", dialog });
        expect([...ipcMain.handlers.keys()]).toEqual([...CONFIG_CHANNELS]);

        // `ipcMain.handle` throws on a channel that already has a handler, so a `dispose`
        // that missed one would turn a reopened window into a crash.
        config.dispose();
        expect(ipcMain.handlers.size).toBe(0);
        expect(() => registerConfigHandlers(ipcMain, { dataDir: "/userData", dialog })).not.toThrow();
    });

    it("answers every channel configHost.ts probes for, so the bridge is never half wired", () => {
        const { ipcMain } = register();

        // `createBridgeConfigHost` returns null unless all seven are functions. A channel
        // missing here is a preload method that rejects on first use, which is exactly the
        // state that probe exists to refuse.
        expect([...ipcMain.handlers.keys()].sort()).toEqual([
            "config:deleteFiles",
            "config:pickDirectory",
            "config:pickFile",
            "config:readFolder",
            "config:suggestFolder",
            "config:testSqlConnection",
            "config:writeFiles",
        ]);
    });

    it("suggests a config folder under the userData it was given", async () => {
        const { call } = register({ dataDir: join(tmpdir(), "some-userData") });

        expect(await call("config:suggestFolder")).toBe(join(tmpdir(), "some-userData", "config"));
        expect(defaultConfigDirectory("/data")).toBe(join("/data", "config"));
    });

    it("refuses an argument that is not text rather than coercing it into a path", async () => {
        const { call } = register();

        const thrown = await refusal(call("config:readFolder", 17));
        expect(thrown.message).toBe("A config folder has to be given as text.");
    });
});

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

describe("config:readFolder", () => {
    it("reads the folder, its maps and its storages, in one sorted listing", async () => {
        const folder = await tempFolder();
        await put(folder, "core.conf", "accept-download: true");
        await put(folder, "webapp.conf", "enabled: true");
        await put(folder, "maps/overworld.conf", 'world: "world"');
        await put(folder, "storages/file.conf", 'storage-type: "file"');

        const { call } = register();
        const answer = (await call("config:readFolder", folder)) as ConfigFolderContents;

        expect(answer.folder).toBe(folder);
        expect(answer.files.map((file) => file.path)).toEqual([
            "core.conf",
            "maps/overworld.conf",
            "storages/file.conf",
            "webapp.conf",
        ]);
        expect(answer.files.find((file) => file.path === "maps/overworld.conf")?.text).toBe('world: "world"');
    });

    it("sends plain structured-cloneable objects", async () => {
        const folder = await tempFolder();
        await put(folder, "core.conf", "accept-download: true");

        const answer = (await register().call("config:readFolder", folder)) as ConfigFolderContents;

        // Electron structured-clones what crosses and refuses what it cannot. A getter, a
        // class instance or a Buffer reaching this point is a channel that throws at the
        // boundary rather than one that sends slightly too much.
        expect(() => structuredClone(answer)).not.toThrow();
    });

    it("keeps a config file it does not model, so the editor can say it left it alone", async () => {
        const folder = await tempFolder();
        await put(folder, "core.conf", "");
        await put(folder, "packs.json", "{}");
        await put(folder, "notes.txt", "not a config file");
        await put(folder, "bluemap.log", "");

        const answer = (await register().call("config:readFolder", folder)) as ConfigFolderContents;

        expect(answer.files.map((file) => file.path)).toEqual(["core.conf", "packs.json"]);
    });

    it("does not descend past maps and storages", async () => {
        const folder = await tempFolder();
        await put(folder, "maps/overworld.conf", "");
        await put(folder, "web/data/something.conf", "");
        await put(folder, "maps/nested/deeper.conf", "");

        const answer = (await register().call("config:readFolder", folder)) as ConfigFolderContents;

        expect(answer.files.map((file) => file.path)).toEqual(["maps/overworld.conf"]);
    });

    it("strips a byte-order mark, which HOCON reads as part of the first key", async () => {
        const folder = await tempFolder();
        await put(folder, "core.conf", "\ufeffaccept-download: true");

        const answer = (await register().call("config:readFolder", folder)) as ConfigFolderContents;

        expect(answer.files[0]?.text).toBe("accept-download: true");
    });

    it("says there is no folder rather than answering with an empty one", async () => {
        const folder = join(await tempFolder(), "not-created");

        const thrown = await refusal(register().call("config:readFolder", folder));
        expect(thrown.message).toBe(`There is nothing at ${folder}.`);
    });

    it("refuses a relative folder rather than reading beside the process", async () => {
        const thrown = await refusal(register().call("config:readFolder", "config"));
        expect(thrown.message).toContain("is not a full path");
    });

    it("refuses an empty folder name", async () => {
        const thrown = await refusal(register().call("config:readFolder", "   "));
        expect(thrown.message).toBe("No config folder was given, so there was nothing to open.");
    });

    it.skipIf(!LINKS.directory)("does not follow a maps folder that is really a link", async () => {
        const folder = await tempFolder();
        const elsewhere = await tempFolder();
        await put(elsewhere, "secret.conf", "somewhere else entirely");
        await put(folder, "core.conf", "");
        symlinkSync(elsewhere, join(folder, "maps"), "junction");

        const answer = (await register().call("config:readFolder", folder)) as ConfigFolderContents;

        expect(answer.files.map((file) => file.path)).toEqual(["core.conf"]);
    });

    it.skipIf(!LINKS.file)("does not read a config file that is really a link", async () => {
        const folder = await tempFolder();
        const elsewhere = await tempFolder();
        const target = await put(elsewhere, "elsewhere.conf", "somewhere else entirely");
        symlinkSync(target, join(folder, "core.conf"), "file");

        const answer = (await register().call("config:readFolder", folder)) as ConfigFolderContents;

        expect(answer.files).toEqual([]);
    });
});

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

describe("config:writeFiles", () => {
    it("creates the folder and writes what it was given", async () => {
        const root = join(await tempFolder(), "fresh");

        await register().call("config:writeFiles", root, [
            { path: "core.conf", text: "accept-download: true" },
            { path: "maps/overworld.conf", text: 'world: "world"' },
            { path: "storages/file.conf", text: 'storage-type: "file"' },
        ]);

        expect(await readFile(join(root, "core.conf"), "utf8")).toBe("accept-download: true");
        expect(await readFile(join(root, "maps", "overworld.conf"), "utf8")).toBe('world: "world"');
        expect(await readFile(join(root, "storages", "file.conf"), "utf8")).toBe('storage-type: "file"');
    });

    it("writes every map of a batch into the folder the first one created", async () => {
        const root = join(await tempFolder(), "fresh");

        await register().call("config:writeFiles", root, [
            { path: "maps/overworld.conf", text: "first" },
            { path: "maps/nether.conf", text: "second" },
            { path: "storages/file.conf", text: "third" },
            { path: "storages/sql.conf", text: "fourth" },
        ]);

        // The listing of what is already there is taken once, before anything is written,
        // so every file after the first in a folder finds a directory the listing does not
        // mention. Reading that as "something is in the way" would refuse a save of two
        // maps at once, which is most of them.
        expect(await readFile(join(root, "maps", "nether.conf"), "utf8")).toBe("second");
        expect(await readFile(join(root, "storages", "sql.conf"), "utf8")).toBe("fourth");
    });

    it("replaces a file that is already there", async () => {
        const folder = await tempFolder();
        await put(folder, "maps/overworld.conf", "old");

        await register().call("config:writeFiles", folder, [{ path: "maps/overworld.conf", text: "new" }]);

        expect(await readFile(join(folder, "maps", "overworld.conf"), "utf8")).toBe("new");
    });

    it("writes a whole save or none of it", async () => {
        const folder = await tempFolder();

        const thrown = await refusal(
            register().call("config:writeFiles", folder, [
                { path: "core.conf", text: "written first" },
                { path: "../escaped.conf", text: "and then this" },
            ]),
        );

        expect(thrown.message).toContain("points outside the config folder");
        // The editor marks a save as done when this resolves. A batch that wrote half of
        // itself and then refused would leave it believing the refusal undid the rest.
        expect(await exists(join(folder, "core.conf"))).toBe(false);
    });

    describe("refuses a path that is not a config file inside the folder", () => {
        const refused: readonly [string, string][] = [
            ["../escaped.conf", "points outside the config folder"],
            ["maps/../../escaped.conf", "points outside the config folder"],
            ["..\\escaped.conf", "points outside the config folder"],
            ["/etc/bluemap/core.conf", "is a full path"],
            ["C:\\Windows\\core.conf", "is a full path"],
            ["\\\\server\\share\\core.conf", "is a full path"],
            ["./core.conf", 'contains a "." step'],
            ["maps//overworld.conf", "has an empty folder name"],
            ["maps/C:overworld.conf", "names a drive or a stream"],
            ["core.conf:stream", "names a drive or a stream"],
            ["web/index.html", "is not a config file"],
            ["level.dat", "is not a config file"],
            ["maps/overworld.txt", "is not a config file"],
            ["secrets.conf", "is not one of the config files this editor writes"],
            ["web/data.conf", "is not somewhere this editor writes"],
            ["maps/nested/overworld.conf", "nested deeper than a BlueMap config folder goes"],
            ["maps/CON.conf", "Windows reserves for a device"],
            ["", "empty path"],
        ];

        for (const [path, expected] of refused) {
            it(`refuses ${path === "" ? "an empty path" : path}`, async () => {
                const folder = await tempFolder();

                const thrown = await refusal(
                    register().call("config:writeFiles", folder, [{ path, text: "no" }]),
                );

                expect(thrown.message).toContain(expected);
            });
        }
    });

    it("refuses to write anything past the file count a config folder has", async () => {
        const folder = await tempFolder();
        const files = Array.from({ length: 600 }, (_unused, index) => ({
            path: `maps/map-${String(index)}.conf`,
            text: "",
        }));

        const thrown = await refusal(register().call("config:writeFiles", folder, files));

        expect(thrown.message).toContain("more than the 512");
        expect(await exists(join(folder, "maps"))).toBe(false);
    });

    it("refuses a file bigger than a config file gets", async () => {
        const folder = await tempFolder();

        const thrown = await refusal(
            register().call("config:writeFiles", folder, [
                { path: "core.conf", text: "x".repeat(5 * 1024 * 1024) },
            ]),
        );

        expect(thrown.message).toContain("larger than the");
    });

    it("refuses a list that is not a list of files", async () => {
        const folder = await tempFolder();

        expect((await refusal(register().call("config:writeFiles", folder, "core.conf"))).message).toBe(
            "The files to write have to be given as a list.",
        );
        expect(
            (await refusal(register().call("config:writeFiles", folder, [{ path: "core.conf" }]))).message,
        ).toBe("The text of file 1 has to be given as text.");
    });

    it("writes into the maps folder that is really there, whatever it is spelled", async () => {
        const folder = await tempFolder();
        await mkdir(join(folder, "Maps"));

        await register().call("config:writeFiles", folder, [{ path: "maps/overworld.conf", text: "in there" }]);

        // Windows opens `Maps` and `maps` as the same directory. Creating a second one
        // beside it would split a person's maps across two folders, only one of which
        // BlueMap loads.
        expect(await readFile(join(folder, "Maps", "overworld.conf"), "utf8")).toBe("in there");
        expect(await exists(join(folder, "maps", "overworld.conf"))).toBe(true);
    });

    it.skipIf(!LINKS.directory)("refuses to write through a maps folder that is a link", async () => {
        const folder = await tempFolder();
        const elsewhere = await tempFolder();
        symlinkSync(elsewhere, join(folder, "maps"), "junction");

        const thrown = await refusal(
            register().call("config:writeFiles", folder, [{ path: "maps/overworld.conf", text: "no" }]),
        );

        expect(thrown.message).toContain("is a link rather than a folder");
        expect(await exists(join(elsewhere, "overworld.conf"))).toBe(false);
    });

    it.skipIf(!LINKS.file)("refuses to write through a config file that is a link", async () => {
        const folder = await tempFolder();
        const elsewhere = await tempFolder();
        const target = await put(elsewhere, "elsewhere.conf", "untouched");
        symlinkSync(target, join(folder, "core.conf"), "file");

        const thrown = await refusal(
            register().call("config:writeFiles", folder, [{ path: "core.conf", text: "no" }]),
        );

        expect(thrown.message).toContain("is a link rather than a file");
        expect(await readFile(target, "utf8")).toBe("untouched");
    });

    it("refuses to make a maps folder where a file of that name sits", async () => {
        const folder = await tempFolder();
        await put(folder, "maps", "a file, not a folder");

        const thrown = await refusal(
            register().call("config:writeFiles", folder, [{ path: "maps/overworld.conf", text: "no" }]),
        );

        expect(thrown.message).toContain("is a file rather than a folder");
    });
});

/* -------------------------------------------------------------------------- */
/* Deleting                                                                   */
/* -------------------------------------------------------------------------- */

describe("config:deleteFiles", () => {
    it("deletes the files it was given and leaves the rest", async () => {
        const folder = await tempFolder();
        await put(folder, "core.conf", "");
        await put(folder, "maps/overworld.conf", "");
        await put(folder, "maps/nether.conf", "");

        await register().call("config:deleteFiles", folder, ["maps/overworld.conf"]);

        expect(await exists(join(folder, "maps", "overworld.conf"))).toBe(false);
        expect(await exists(join(folder, "maps", "nether.conf"))).toBe(true);
        expect(await exists(join(folder, "core.conf"))).toBe(true);
    });

    it("treats a file that is already gone as gone", async () => {
        const folder = await tempFolder();
        await mkdir(join(folder, "maps"));

        await expect(
            register().call("config:deleteFiles", folder, ["maps/overworld.conf", "storages/file.conf"]),
        ).resolves.toBeUndefined();
    });

    it("treats a folder that is not there as holding nothing", async () => {
        const folder = join(await tempFolder(), "never-created");

        await expect(
            register().call("config:deleteFiles", folder, ["maps/overworld.conf"]),
        ).resolves.toBeUndefined();
    });

    it("refuses a path that escapes the folder, before deleting any of the batch", async () => {
        const folder = await tempFolder();
        await put(folder, "maps/overworld.conf", "");

        const thrown = await refusal(
            register().call("config:deleteFiles", folder, ["maps/overworld.conf", "../../elsewhere.conf"]),
        );

        expect(thrown.message).toContain("points outside the config folder");
        expect(await exists(join(folder, "maps", "overworld.conf"))).toBe(true);
    });

    it.skipIf(!LINKS.file)("refuses to unlink something that is not a config file", async () => {
        const folder = await tempFolder();
        const elsewhere = await tempFolder();
        const target = await put(elsewhere, "elsewhere.conf", "untouched");
        await mkdir(join(folder, "maps"));
        symlinkSync(target, join(folder, "maps", "overworld.conf"), "file");

        const thrown = await refusal(register().call("config:deleteFiles", folder, ["maps/overworld.conf"]));

        expect(thrown.message).toContain("is a link rather than a config file");
        expect(await readFile(target, "utf8")).toBe("untouched");
    });
});

/* -------------------------------------------------------------------------- */
/* The pickers                                                                */
/* -------------------------------------------------------------------------- */

describe("the pickers", () => {
    it("asks for a directory and answers with the one that was chosen", async () => {
        const chosen = join(tmpdir(), "chosen");
        const { call, dialog } = register({ answer: { canceled: false, filePaths: [chosen] } });

        const answer = await call("config:pickDirectory", { title: "Choose a config folder", startIn: tmpdir() });

        expect(answer).toBe(chosen);
        expect(dialog.seen[0]?.title).toBe("Choose a config folder");
        expect(dialog.seen[0]?.properties).toEqual(["openDirectory", "createDirectory"]);
        expect(dialog.seen[0]?.defaultPath).toBe(tmpdir());
    });

    it("answers null when the picker was cancelled", async () => {
        const { call } = register({ answer: cancelled });

        expect(await call("config:pickDirectory", { title: "Choose" })).toBeNull();
        expect(await call("config:pickFile", { title: "Choose" })).toBeNull();
    });

    it("ignores a starting folder that is not a full path", async () => {
        const { call, dialog } = register();

        await call("config:pickDirectory", { title: "Choose", startIn: "somewhere/relative" });

        // Electron resolves a relative default against the working directory, which for a
        // packaged app is wherever it happened to be launched from.
        expect(dialog.seen[0]?.defaultPath).toBeUndefined();
    });

    it("turns extensions into a filter, with a way past it", async () => {
        const { call, dialog } = register();

        await call("config:pickFile", { title: "Choose a driver", extensions: [".jar", "zip", "  "] });

        expect(dialog.seen[0]?.properties).toEqual(["openFile"]);
        expect(dialog.seen[0]?.filters).toEqual([
            { name: "JAR, ZIP files", extensions: ["jar", "zip"] },
            { name: "All files", extensions: ["*"] },
        ]);
    });

    it("sets no filter when no extension was asked for", async () => {
        const { call, dialog } = register();

        await call("config:pickFile", { title: "Choose anything" });

        expect(dialog.seen[0]?.filters).toBeUndefined();
    });

    it("refuses a picker with no title rather than opening an unnamed window", async () => {
        const thrown = await refusal(register().call("config:pickFile", {}));
        expect(thrown.message).toBe("The picker's title has to be given as text.");
    });
});

/* -------------------------------------------------------------------------- */
/* The SQL probe                                                              */
/* -------------------------------------------------------------------------- */

const PROBE = {
    connectionUrl: "jdbc:mysql://localhost:3306/bluemap?permitMysqlScheme",
    properties: { user: "root", password: "hunter2" },
    dialect: null,
    driverJar: null,
    driverClass: null,
};

describe("config:testSqlConnection", () => {
    it("says plainly that this build cannot open the connection, and never that it did", async () => {
        const answer = (await register().call("config:testSqlConnection", PROBE)) as SqlProbeResult;

        expect(answer.ok).toBe(false);
        expect(answer.message).toContain("cannot open a mysql connection");
        expect(answer.detail).toContain("A JDBC driver is a Java library");
        expect(() => structuredClone(answer)).not.toThrow();
    });

    it("never repeats the URL or the properties back, because both carry the password", async () => {
        const answer = (await register().call("config:testSqlConnection", PROBE)) as SqlProbeResult;

        expect(`${answer.message} ${answer.detail ?? ""}`).not.toContain("hunter2");
        expect(`${answer.message} ${answer.detail ?? ""}`).not.toContain("jdbc:mysql://");
    });

    it("names the driver jar as BlueMap's to load, not this app's", async () => {
        const answer = (await register().call("config:testSqlConnection", {
            ...PROBE,
            driverJar: "bluemap/mariadb-java-client-3.0.7.jar",
        })) as SqlProbeResult;

        expect(answer.detail).toContain("bluemap/mariadb-java-client-3.0.7.jar");
        expect(answer.detail).toContain("BlueMap's own JVM");
    });

    it("reports a URL that is not a JDBC URL before looking for a driver", async () => {
        const answer = (await register().call("config:testSqlConnection", {
            ...PROBE,
            connectionUrl: "mysql://localhost/bluemap",
        })) as SqlProbeResult;

        expect(answer.ok).toBe(false);
        expect(answer.message).toContain("not a JDBC connection URL");
    });

    it("reports an empty URL as nothing to connect to", async () => {
        const answer = (await register().call("config:testSqlConnection", { ...PROBE, connectionUrl: "  " })) as SqlProbeResult;

        expect(answer.ok).toBe(false);
        expect(answer.message).toBe("No connection URL was given, so there was nothing to connect to.");
    });

    it("reports what a driver said when there is one, and only then reports a success", async () => {
        const seen: unknown[] = [];
        const driver: SqlDriver = {
            name: "a test driver",
            connect: (target) => {
                seen.push(target);
                return Promise.resolve();
            },
        };

        const answer = (await register({ sqlDriver: driver }).call(
            "config:testSqlConnection",
            PROBE,
        )) as SqlProbeResult;

        expect(answer.ok).toBe(true);
        expect(answer.message).toContain("Connected to the mysql database");
        expect(answer.detail).toBe("Opened with a test driver.");
        expect(seen).toEqual([
            {
                url: "jdbc:mysql://localhost:3306/bluemap?permitMysqlScheme",
                dialect: "mysql",
                properties: { user: "root", password: "hunter2" },
            },
        ]);
    });

    it("repeats a driver's own failure, flattened onto one line", async () => {
        const driver: SqlDriver = {
            name: "a test driver",
            connect: () =>
                Promise.reject(new Error("Access denied for user 'root'@'localhost'\n  (using password: YES)")),
        };

        const answer = (await register({ sqlDriver: driver }).call(
            "config:testSqlConnection",
            PROBE,
        )) as SqlProbeResult;

        expect(answer.ok).toBe(false);
        expect(answer.message).toBe("Access denied for user 'root'@'localhost' (using password: YES)");
        expect(answer.detail).toBe("Reported by a test driver, connecting as mysql.");
    });

    it("drops a property that is not text rather than handing it to a driver", async () => {
        const seen: unknown[] = [];
        const driver: SqlDriver = {
            name: "a test driver",
            connect: (target) => {
                seen.push(target.properties);
                return Promise.resolve();
            },
        };

        await register({ sqlDriver: driver }).call("config:testSqlConnection", {
            ...PROBE,
            properties: { user: "root", timeout: 30, nested: { password: "x" } },
        });

        expect(seen).toEqual([{ user: "root" }]);
    });
});

describe("probeSqlConnection", () => {
    it("asks for the dialect the file names rather than the one the URL implies", async () => {
        const asked: string[] = [];

        await probeSqlConnection(
            { ...PROBE, dialect: "bluemap:mariadb" },
            (dialect) => {
                asked.push(dialect);
                return Promise.resolve(null);
            },
        );

        // BlueMap resolves the namespace itself, and picks the dialect from the URL only
        // when the file leaves the key unset. Testing a different one than the render will
        // use is worse than not testing at all.
        expect(asked).toEqual(["mariadb"]);
    });

    it("falls back to the URL's own driver name when no dialect is set", async () => {
        const asked: string[] = [];

        await probeSqlConnection({ ...PROBE, connectionUrl: "jdbc:postgresql://db/bluemap" }, (dialect) => {
            asked.push(dialect);
            return Promise.resolve(null);
        });

        expect(asked).toEqual(["postgresql"]);
    });

    it("reports a lookup that threw without pretending the connection was refused", async () => {
        const answer = await probeSqlConnection(PROBE, () => Promise.reject(new Error("module not found")));

        expect(answer.ok).toBe(false);
        expect(answer.message).toBe("The mysql driver could not be loaded.");
        expect(answer.detail).toBe("module not found");
    });

    it("finds nothing at all in this build", async () => {
        expect(await noSqlDriver("mysql")).toBeNull();
    });
});

describe("jdbcSubprotocol", () => {
    it("reads the driver name out of the shapes a JDBC URL comes in", () => {
        expect(jdbcSubprotocol("jdbc:mysql://localhost:3306/bluemap")).toBe("mysql");
        expect(jdbcSubprotocol("jdbc:postgresql://db/bluemap")).toBe("postgresql");
        expect(jdbcSubprotocol("jdbc:sqlite:/var/lib/bluemap.db")).toBe("sqlite");
        expect(jdbcSubprotocol("  JDBC:MariaDB://db/bluemap  ")).toBe("mariadb");
        expect(jdbcSubprotocol("jdbc:sqlserver://db;databaseName=bluemap")).toBe("sqlserver");
    });

    it("answers null for text that is not a JDBC URL", () => {
        expect(jdbcSubprotocol("mysql://localhost/bluemap")).toBeNull();
        expect(jdbcSubprotocol("jdbc:")).toBeNull();
        // No host and no database, so treating it as a URL would only move the failure.
        expect(jdbcSubprotocol("jdbc:mysql")).toBeNull();
        expect(jdbcSubprotocol("")).toBeNull();
    });
});

describe("dialectName", () => {
    it("drops the namespace BlueMap resolves itself", () => {
        expect(dialectName("bluemap:mysql")).toBe("mysql");
        expect(dialectName("MySQL")).toBe("mysql");
        expect(dialectName("  mariadb  ")).toBe("mariadb");
    });
});

/* -------------------------------------------------------------------------- */
/* The path rule on its own                                                   */
/* -------------------------------------------------------------------------- */

describe("checkConfigPath", () => {
    it("accepts every shape the options GUI writes", () => {
        for (const path of [
            "core.conf",
            "webapp.conf",
            "webserver.conf",
            "plugin.conf",
            "core.json",
            "maps/overworld.conf",
            "maps/My World 2.conf",
            "storages/file.conf",
            "storages/sql.json",
        ]) {
            expect(checkConfigPath(path)).toEqual({ ok: true, path });
        }
    });

    it("answers with the canonical spelling of the folder", () => {
        expect(checkConfigPath("Maps/overworld.conf")).toEqual({ ok: true, path: "maps/overworld.conf" });
        expect(checkConfigPath("maps\\overworld.conf")).toEqual({ ok: true, path: "maps/overworld.conf" });
    });

    it("refuses a name that is only a suffix", () => {
        expect(checkConfigPath("maps/.conf").ok).toBe(false);
    });

    it("says which files the folder itself holds when it refuses one", () => {
        const checked = checkConfigPath("something.conf");
        expect(checked.ok).toBe(false);
        expect(checked.ok ? "" : checked.reason).toContain("core, webapp, webserver, plugin");
    });

    it("refuses a control character, which no file system will take anyway", () => {
        expect(checkConfigPath("maps/over\u0000world.conf").ok).toBe(false);
    });
});

describe("readConfigFolder", () => {
    it("reports a size it will not open rather than a file it silently skipped", async () => {
        const folder = await tempFolder();
        await put(folder, "core.conf", "x".repeat(5 * 1024 * 1024));

        const thrown = await refusal(readConfigFolder(folder));

        // Skipping it would show the editor a folder with no core.conf, and then let it
        // offer to create the one that is sitting right there.
        expect(thrown.message).toContain("larger than the");
    });
});
