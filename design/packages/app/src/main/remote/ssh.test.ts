/**
 * The SSH argument builder and the classifier that reads what came back.
 *
 * Everything here is a decision about strings, so the whole security model - no password
 * anywhere, strict host key checking, quoting that a remote shell cannot reinterpret - is
 * provable without an SSH client, a key, or a host.
 */

import { describe, expect, it } from "vitest";
import {
    classifySshOutput,
    quoteForRemoteShell,
    quoteRemotePath,
    remoteCommandLine,
    scpArguments,
    scpRemotePath,
    sshArguments,
    sshCommandRunner,
    sshSecurityOptions,
} from "./ssh.js";
import {
    DOCKER_AVAILABLE,
    DOCKER_NOT_FOUND,
    SSH_AUTH_REFUSED,
    SSH_HOST_KEY_CHANGED,
    SSH_HOST_KEY_UNKNOWN,
    SSH_UNREACHABLE,
    fakeRunner,
    output,
    testTarget,
} from "./fakes.js";

const OPTIONS = {
    target: testTarget(),
    knownHostsFile: "C:\\Users\\me\\AppData\\Roaming\\app\\known_hosts",
    userKnownHostsFile: "C:\\Users\\me\\.ssh\\known_hosts",
};

describe("the security options", () => {
    it("makes a password impossible rather than merely unlikely", () => {
        const flags = sshSecurityOptions(OPTIONS).join(" ");
        expect(flags).toContain("BatchMode=yes");
        expect(flags).toContain("PasswordAuthentication=no");
        expect(flags).toContain("KbdInteractiveAuthentication=no");
        expect(flags).toContain("PreferredAuthentications=publickey");
    });

    it("never accepts an unknown host key silently", () => {
        const flags = sshSecurityOptions(OPTIONS).join(" ");
        expect(flags).toContain("StrictHostKeyChecking=yes");
        // `accept-new` would make the first connection to any host succeed, which is
        // exactly the connection a machine-in-the-middle needs to survive.
        expect(flags).not.toContain("accept-new");
        expect(flags).not.toContain("StrictHostKeyChecking=no");
    });

    it("reads both trust stores, quoting each so a path with a space survives", () => {
        const flags = sshSecurityOptions(OPTIONS).join(" ");
        expect(flags).toContain(
            'UserKnownHostsFile="C:\\Users\\me\\AppData\\Roaming\\app\\known_hosts" "C:\\Users\\me\\.ssh\\known_hosts"',
        );
    });

    it("reads only the app's own file when there is no user one", () => {
        const flags = sshSecurityOptions({
            target: testTarget(),
            knownHostsFile: "/app/known_hosts",
        }).join(" ");
        expect(flags).toContain('UserKnownHostsFile="/app/known_hosts"');
    });

    it("adds IdentitiesOnly beside a named key, so the agent cannot use up MaxAuthTries", () => {
        const flags = sshSecurityOptions({
            ...OPTIONS,
            target: testTarget({ identityFile: "/home/me/.ssh/id_ed25519" }),
        }).join(" ");
        expect(flags).toContain("-i /home/me/.ssh/id_ed25519");
        expect(flags).toContain("IdentitiesOnly=yes");
    });

    it("carries no key material, only a path", () => {
        const flags = sshSecurityOptions({
            ...OPTIONS,
            target: testTarget({ identityFile: "/home/me/.ssh/id_ed25519" }),
        }).join(" ");
        expect(flags).not.toContain("PRIVATE KEY");
        // The only place the word appears at all is the option that switches it off.
        expect(flags.match(/password/gi)).toEqual(["Password"]);
        expect(flags).toContain("PasswordAuthentication=no");
    });
});

describe("port flags", () => {
    it("uses ssh's lowercase -p and scp's uppercase -P", () => {
        // One wrong letter and scp ignores the port and connects to 22, which on a host
        // that has moved SSH is a connection refused with no hint that a flag caused it.
        expect(sshArguments(OPTIONS)).toContain("-p");
        expect(sshArguments(OPTIONS)).toContain("2222");
        expect(scpArguments(OPTIONS)).toContain("-P");
        expect(scpArguments(OPTIONS)).toContain("2222");
    });

    it("ends the ssh argv at the destination, so the command follows it", () => {
        expect(sshArguments(OPTIONS).at(-1)).toBe("renderer@render.example");
    });
});

describe("quoting for the remote shell", () => {
    it("survives a folder name a person would actually have", () => {
        expect(quoteForRemoteShell("/srv/Saves, old (2)")).toBe("'/srv/Saves, old (2)'");
    });

    it("survives the characters that would otherwise start a second command", () => {
        expect(quoteForRemoteShell("a; rm -rf /")).toBe("'a; rm -rf /'");
        expect(quoteForRemoteShell("$(whoami)")).toBe("'$(whoami)'");
        expect(quoteForRemoteShell("`id`")).toBe("'`id`'");
    });

    it("closes and reopens the quote around a single quote, which is the only escape", () => {
        expect(quoteForRemoteShell("it's")).toBe("'it'\\''s'");
    });

    it("quotes every word of a command line", () => {
        expect(remoteCommandLine(["docker", "run", "--name", "a b"])).toBe(
            "'docker' 'run' '--name' 'a b'",
        );
    });

    it("leaves a leading tilde outside the quotes so the shell still expands it", () => {
        // Quoted whole, the render would stage into a directory literally called `~`.
        expect(quoteRemotePath("~/renders")).toBe("~/'renders'");
        expect(quoteRemotePath("~")).toBe("~");
        expect(quoteRemotePath("/srv/x")).toBe("'/srv/x'");
    });

    it("quotes the remote half of an scp path, which a remote shell also reads", () => {
        expect(scpRemotePath(testTarget(), "/srv/a b/c")).toBe("renderer@render.example:'/srv/a b/c'");
    });
});

describe("classifySshOutput", () => {
    it("tells a missing ssh apart from a missing host", () => {
        expect(classifySshOutput(output({ ok: false, spawnError: "ENOENT" }))).toBe("ssh-missing");
        expect(classifySshOutput(SSH_UNREACHABLE)).toBe("unreachable");
    });

    it("reports a changed key as changed even though ssh prints both banners", () => {
        // Reported as "unknown", the interface would offer a button to trust a key that
        // has just changed under somebody.
        expect(classifySshOutput(SSH_HOST_KEY_CHANGED)).toBe("host-key-changed");
    });

    it("reports a first meeting as unknown", () => {
        expect(classifySshOutput(SSH_HOST_KEY_UNKNOWN)).toBe("host-key-unknown");
    });

    it("reports a refused key as a key problem, not a network one", () => {
        expect(classifySshOutput(SSH_AUTH_REFUSED)).toBe("auth-refused");
    });

    it("reports success as success", () => {
        expect(classifySshOutput(output({ stdout: "/home/renderer" }))).toBe("ok");
    });

    it("reports an ordinary non-zero remote exit as the remote command failing", () => {
        expect(classifySshOutput(output({ ok: false, exitCode: 2, stderr: "no such file" }))).toBe(
            "remote-failed",
        );
    });

    it("does not read the remote command's own words as an SSH failure", () => {
        // `docker version` refused by its own daemon prints "permission denied". Read as an
        // authentication failure, "add this account to the docker group" becomes "your key
        // was rejected" - two problems with nothing in common. The exit code decides whose
        // failure it is; the text only decides which one.
        expect(
            classifySshOutput(
                output({
                    ok: false,
                    exitCode: 1,
                    stderr: "permission denied while trying to connect to the Docker daemon socket",
                }),
            ),
        ).toBe("remote-failed");
    });
});

describe("sshCommandRunner", () => {
    it("runs the command on the other machine, quoted", async () => {
        const fake = fakeRunner([{ when: /docker/, answer: DOCKER_AVAILABLE }]);
        const remote = sshCommandRunner({ ...OPTIONS, runner: fake.runner });
        await remote("docker", ["version", "--format", "{{json .}}"]);

        const call = fake.calls[0];
        expect(call?.command).toBe("ssh");
        expect(call?.args.at(-1)).toBe("'docker' 'version' '--format' '{{json .}}'");
    });

    it("turns a remote 'command not found' into the same answer a missing local binary gives", async () => {
        // This is what lets `runtime/docker.ts` be reused verbatim: without it, "Docker is
        // not installed on that host" would arrive as "exit code 127" and send somebody to
        // debug Docker rather than to install it.
        const fake = fakeRunner([{ when: /docker/, answer: DOCKER_NOT_FOUND }]);
        const remote = sshCommandRunner({ ...OPTIONS, runner: fake.runner });
        const answer = await remote("docker", ["version"]);
        expect(answer.spawnError).toBe("ENOENT");
    });

    it("marks a failure of ssh itself apart from a failure of the remote command", async () => {
        const fake = fakeRunner([{ when: /ssh/, answer: SSH_UNREACHABLE }]);
        const remote = sshCommandRunner({ ...OPTIONS, runner: fake.runner });
        const answer = await remote("docker", ["version"]);
        // Anything that treats these as one thing reports a dead server as a broken Docker.
        expect(answer.spawnError).toBe("SSH");
    });

    it("passes a success straight through", async () => {
        const fake = fakeRunner([{ when: /docker/, answer: DOCKER_AVAILABLE }]);
        const remote = sshCommandRunner({ ...OPTIONS, runner: fake.runner });
        const answer = await remote("docker", ["version"]);
        expect(answer.ok).toBe(true);
        expect(answer.spawnError).toBeNull();
    });
});
