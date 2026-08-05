import { describe, expect, it } from "vitest";

import { encodePowerShellCommand, powershellRemoteCommand, quoteForPowerShell } from "./windowsShell.js";

describe("quoteForPowerShell", () => {
    it("wraps a plain value in single quotes", () => {
        expect(quoteForPowerShell("D:\\servers\\world")).toBe("'D:\\servers\\world'");
    });

    it("doubles an embedded single quote, the PowerShell escape rather than a backslash one", () => {
        expect(quoteForPowerShell("Steve's World")).toBe("'Steve''s World'");
    });

    it("leaves a double quote alone, because it is not special inside single quotes", () => {
        expect(quoteForPowerShell('a "b" c')).toBe('\'a "b" c\'');
    });

    it("round-trips a path with a space in it", () => {
        expect(quoteForPowerShell("D:\\Minecraft Server\\world")).toBe("'D:\\Minecraft Server\\world'");
    });
});

describe("encodePowerShellCommand", () => {
    it("produces Base64 of UTF-16LE text, decodable back to the original script", () => {
        const script = "Write-Output 'hello'";
        const encoded = encodePowerShellCommand(script);
        expect(encoded).toMatch(/^[A-Za-z0-9+/]+=*$/);
        expect(Buffer.from(encoded, "base64").toString("utf16le")).toBe(script);
    });

    it("survives characters a login shell would otherwise choke on", () => {
        const script = "Write-Output ('a && b; $(rm -rf /) \" \\' \\\\')";
        const encoded = encodePowerShellCommand(script);
        // The whole point: no space, quote or shell metacharacter in the encoded form.
        expect(encoded).toMatch(/^[A-Za-z0-9+/]+=*$/);
        expect(Buffer.from(encoded, "base64").toString("utf16le")).toBe(script);
    });
});

describe("powershellRemoteCommand", () => {
    it("builds a command line whose only variable part is pure Base64", () => {
        const line = powershellRemoteCommand("Write-Output hi");
        expect(line).toMatch(
            /^powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand [A-Za-z0-9+/]+=*$/,
        );
    });

    it("contains no whitespace, quote or shell metacharacter after the fixed prefix", () => {
        const line = powershellRemoteCommand("Get-ChildItem 'C:\\Users\\Steve\\ Saves'");
        const encoded = line.split(" ").pop();
        expect(encoded).toBeDefined();
        expect(encoded).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });
});
