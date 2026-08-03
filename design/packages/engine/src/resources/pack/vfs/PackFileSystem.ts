/**
 * Virtual-file-system abstraction for reading resource-/data-pack sources.
 *
 * Upstream reads packs through java.nio's FileSystem API, where a zip or jar can be
 * mounted and browsed like a directory ({@code FileSystems.newFileSystem(zipPath)}) and a
 * {@code Path} carries its file-system with it. Node has no such facility, so the ported
 * pack-loading code is written against this minimal posix-style VFS with a
 * directory-backed ({@link DirFileSystem}) and a zip-backed ({@link ZipFileSystem})
 * implementation; {@link PackPath} plays the role of java.nio's {@code Path}.
 */

/** result of {@link PackFileSystem#stat} — the subset of file-attributes the pack-loader needs */
export interface PackFileStats {
    /** true if the path is a regular file (upstream: Files#isRegularFile) */
    file: boolean;
    /** true if the path is a directory (upstream: Files#isDirectory) */
    directory: boolean;
    /** (uncompressed) size of the file in bytes, 0 for directories */
    size: number;
}

/**
 * A browsable file-tree (a directory or a mounted zip/jar), addressed by posix-style
 * relative paths ("" is the root, separator "/", e.g. "data/minecraft/dimension_type").
 */
export interface PackFileSystem {
    /** human-readable location of this file-system, used in log-messages */
    getName(): string;

    /**
     * The real (OS) file-system path of the given path, or null if this file-system is
     * not backed by the OS file-system (e.g. inside a zip).
     */
    getOsPath(path: string): string | null;

    /** stats of the given path, or null if nothing exists there */
    stat(path: string): Promise<PackFileStats | null>;

    /**
     * The names of the direct children of the given directory path
     * (empty if the path is not an existing directory)
     */
    list(path: string): Promise<string[]>;

    /** reads the file at the given path fully into memory */
    read(path: string): Promise<Buffer>;

    /** releases any resources held by this file-system (upstream: FileSystem#close) */
    close(): Promise<void>;
}

/**
 * Normalizes a posix-style relative path: collapses empty, "." and ".." segments
 * ("" is the root).
 */
export function normalizePath(path: string): string {
    const segments: string[] = [];
    for (const segment of path.split("/")) {
        if (segment === "" || segment === ".") continue;
        if (segment === "..") {
            segments.pop();
            continue;
        }
        segments.push(segment);
    }
    return segments.join("/");
}

/**
 * A path within a {@link PackFileSystem} (upstream: java.nio.file.Path — only the
 * operations the pack-loading code uses are provided).
 */
export class PackPath {
    readonly fileSystem: PackFileSystem;
    readonly path: string;

    constructor(fileSystem: PackFileSystem, path: string) {
        this.fileSystem = fileSystem;
        this.path = normalizePath(path);
    }

    /** upstream: Path#resolve */
    resolve(other: string): PackPath {
        return new PackPath(this.fileSystem, this.path === "" ? other : this.path + "/" + other);
    }

    /**
     * upstream: Path#relativize — returns the posix-style relative path from this path to
     * {@code other}; only the descendant-case is supported (which is all the pack-loader
     * uses), anything else throws (upstream: IllegalArgumentException).
     */
    relativize(other: PackPath): string {
        if (other.fileSystem !== this.fileSystem)
            throw new Error("'other' is a path of a different file-system");
        if (this.path === "") return other.path;
        if (other.path === this.path) return "";
        if (!other.path.startsWith(this.path + "/"))
            throw new Error("cannot relativize '" + other.path + "' against '" + this.path + "'");
        return other.path.substring(this.path.length + 1);
    }

    /** upstream: Path#getFileName (the last path-segment; "" for the root) */
    getFileName(): string {
        const separatorIndex = this.path.lastIndexOf("/");
        return separatorIndex === -1 ? this.path : this.path.substring(separatorIndex + 1);
    }

    async stat(): Promise<PackFileStats | null> {
        return this.fileSystem.stat(this.path);
    }

    /** upstream: Files#exists */
    async exists(): Promise<boolean> {
        return (await this.stat()) !== null;
    }

    /** upstream: Files#isDirectory */
    async isDirectory(): Promise<boolean> {
        return (await this.stat())?.directory ?? false;
    }

    /** upstream: Files#isRegularFile */
    async isRegularFile(): Promise<boolean> {
        return (await this.stat())?.file ?? false;
    }

    /** upstream: Files#readAllBytes */
    async readBytes(): Promise<Buffer> {
        return this.fileSystem.read(this.path);
    }

    /** upstream: Files#newBufferedReader + read fully (packs are read as utf-8 json) */
    async readText(): Promise<string> {
        return (await this.readBytes()).toString("utf-8");
    }

    /** upstream: Files#list — the direct children of this directory */
    async list(): Promise<PackPath[]> {
        return (await this.fileSystem.list(this.path)).map((name) => this.resolve(name));
    }

    /**
     * upstream: Path#toRealPath — verifies existence (OS-symlinks are already resolved
     * when a {@link DirFileSystem}-root is created, see Pack#loadResourcePath).
     */
    async toRealPath(): Promise<PackPath> {
        if (!(await this.exists())) throw new Error("NoSuchFile: " + this.toString());
        return this;
    }

    toString(): string {
        return this.fileSystem.getOsPath(this.path) ?? this.fileSystem.getName() + "!/" + this.path;
    }
}
