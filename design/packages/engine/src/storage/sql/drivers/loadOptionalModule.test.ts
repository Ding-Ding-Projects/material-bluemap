import { describe, expect, it } from "vitest";
import { MissingSqlDriverError } from "../Database.js";
import { loadOptionalModule } from "./loadOptionalModule.js";

describe("loadOptionalModule", () => {
    it("resolves the real module when the package is installed", async () => {
        const mod = await loadOptionalModule<{ default: unknown }>("sql.js", "sql.js", "SQLite");
        expect(typeof mod.default).toBe("function");
    });

    it("throws MissingSqlDriverError, naming the package and the dialect, when the package is absent", async () => {
        const packageName = "a-package-that-genuinely-does-not-exist-anywhere-in-this-repo";
        await expect(loadOptionalModule(packageName, packageName, "Some Dialect")).rejects.toThrow(
            MissingSqlDriverError,
        );

        try {
            await loadOptionalModule(packageName, packageName, "Some Dialect");
            expect.unreachable("expected loadOptionalModule to reject");
        } catch (ex) {
            expect(ex).toBeInstanceOf(MissingSqlDriverError);
            const error = ex as MissingSqlDriverError;
            expect(error.message).toContain(packageName);
            expect(error.message).toContain("Some Dialect");
            expect(error.message.toLowerCase()).toContain("install");
            // the underlying module-resolution error is preserved for diagnostics,
            // but it must not be the *only* thing a caller sees
            expect(error.cause).toBeDefined();
        }
    });
});
