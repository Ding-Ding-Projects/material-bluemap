import { copyFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

/** Every regular file under `root`, keyed by its forward-slashed path relative to `root`. */
export async function listFiles(root: string): Promise<Map<string, string>> {
    const files = new Map<string, string>();

    const walk = async (directory: string): Promise<void> => {
        let entries;
        try {
            entries = await readdir(directory, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) await walk(path);
            else if (entry.isFile()) files.set(relative(root, path).split(sep).join("/"), path);
        }
    };

    await walk(root);
    return files;
}

/** Copies a file, creating the destination's parent directories first. */
export async function copyInto(source: string, destination: string): Promise<void> {
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
}

export async function exists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

export async function readIfPresent(path: string): Promise<Buffer | null> {
    try {
        return await readFile(path);
    } catch {
        return null;
    }
}
