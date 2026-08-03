import * as yauzl from "yauzl-promise";
import {
    PackPath,
    normalizePath,
    type PackFileStats,
    type PackFileSystem,
} from "./PackFileSystem.js";

/**
 * A {@link PackFileSystem} over a zip/jar file (upstream: the jdk.zipfs FileSystem
 * created by {@code FileSystems.newFileSystem(zipPath)}).
 *
 * The zip's central directory is read once up-front into an index (path → entry,
 * directory → child-names), so stat/list are in-memory lookups and read is a random
 * access decompression of a single entry via yauzl.
 *
 * A ZipFileSystem can be opened from an OS-file or from an in-memory buffer — the latter
 * allows opening zips nested inside other zips (fabric-mod "jar-in-jar" files).
 */
export class ZipFileSystem implements PackFileSystem {
    private readonly name: string;
    private readonly zipFile: yauzl.ZipFile;
    /** normalized entry-path → central-directory entry */
    private readonly files: Map<string, yauzl.Entry>;
    /** normalized directory-path ("" = root) → child-names in central-directory order */
    private readonly directories: Map<string, Set<string>>;

    private constructor(
        name: string,
        zipFile: yauzl.ZipFile,
        files: Map<string, yauzl.Entry>,
        directories: Map<string, Set<string>>,
    ) {
        this.name = name;
        this.zipFile = zipFile;
        this.files = files;
        this.directories = directories;
    }

    /** opens a zip-file from the OS file-system */
    static async openFile(osPath: string): Promise<ZipFileSystem> {
        return ZipFileSystem.index(osPath, await yauzl.open(osPath));
    }

    /** opens a zip-file held in memory (e.g. a zip nested inside another zip) */
    static async fromBuffer(buffer: Buffer, name: string): Promise<ZipFileSystem> {
        return ZipFileSystem.index(name, await yauzl.fromBuffer(buffer));
    }

    /**
     * Opens the (zip-)file at the given {@link PackPath} — directly from the OS
     * file-system where possible, through an in-memory buffer otherwise (nested zips).
     */
    static async open(root: PackPath): Promise<ZipFileSystem> {
        const osPath = root.fileSystem.getOsPath(root.path);
        if (osPath !== null) return ZipFileSystem.openFile(osPath);
        return ZipFileSystem.fromBuffer(await root.readBytes(), root.toString());
    }

    private static async index(name: string, zipFile: yauzl.ZipFile): Promise<ZipFileSystem> {
        const files = new Map<string, yauzl.Entry>();
        const directories = new Map<string, Set<string>>();
        directories.set("", new Set());

        const addDirectory = (path: string): void => {
            if (directories.has(path)) return;
            directories.set(path, new Set());
            registerChild(path);
        };

        const registerChild = (path: string): void => {
            const separatorIndex = path.lastIndexOf("/");
            const parent = separatorIndex === -1 ? "" : path.substring(0, separatorIndex);
            const childName = separatorIndex === -1 ? path : path.substring(separatorIndex + 1);
            addDirectory(parent);
            directories.get(parent)?.add(childName);
        };

        try {
            for (const entry of await zipFile.readEntries()) {
                const filename = entry.filename;
                const path = normalizePath(filename);
                if (path === "") continue;

                if (filename.endsWith("/")) {
                    // explicit directory-entry
                    addDirectory(path);
                } else {
                    files.set(path, entry);
                    registerChild(path);
                }
            }
        } catch (ex) {
            await zipFile.close().catch(() => undefined);
            throw ex;
        }

        return new ZipFileSystem(name, zipFile, files, directories);
    }

    getName(): string {
        return this.name;
    }

    getOsPath(_path: string): string | null {
        return null;
    }

    async stat(path: string): Promise<PackFileStats | null> {
        const normalized = normalizePath(path);
        const entry = this.files.get(normalized);
        if (entry !== undefined)
            return { file: true, directory: false, size: entry.uncompressedSize };
        if (this.directories.has(normalized)) return { file: false, directory: true, size: 0 };
        return null;
    }

    async list(path: string): Promise<string[]> {
        const children = this.directories.get(normalizePath(path));
        return children === undefined ? [] : [...children];
    }

    async read(path: string): Promise<Buffer> {
        const normalized = normalizePath(path);
        const entry = this.files.get(normalized);
        if (entry === undefined)
            throw new Error("NoSuchFile: " + this.name + "!/" + normalized);

        const stream = await entry.openReadStream();
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(chunk as Buffer);
        return Buffer.concat(chunks);
    }

    async close(): Promise<void> {
        await this.zipFile.close();
    }

    /**
     * upstream: FileSystem#getRootDirectories — a zip file-system has exactly one root
     */
    getRootDirectories(): PackPath[] {
        return [new PackPath(this, "")];
    }
}
