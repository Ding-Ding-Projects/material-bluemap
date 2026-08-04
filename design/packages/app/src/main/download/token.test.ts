/**
 * Tests for which token a download runs under.
 *
 * The behaviour worth pinning here is an ORDER and a REFUSAL TO THROW, and both exist
 * because of the same failure: signing in inside the application used to do nothing for a
 * private release. The downloader read `GH_TOKEN` and only `GH_TOKEN`, so the sign-in
 * screen said "signed in as ..." while the download said "release not found" — two true
 * statements about entirely unconnected things, with nothing on screen to suggest the
 * credential just approved on a phone was being ignored.
 *
 * So: the sign-in wins when there is one, the environment still works when there is not
 * (a CI runner has no sign-in and never will), and every way of failing to get a token
 * degrades to the next source rather than escaping. A twenty-gigabyte public world must
 * not stop because a credential nobody asked it to use could not be renewed.
 */

import { describe, expect, it } from "vitest";
import { releaseTokenSource, type SignedInSession } from "./token.js";

/** a session that answers with the given token */
function signedIn(token: string): SignedInSession {
    return { accessToken: () => Promise.resolve({ ok: true as const, token }) };
}

/** a session that is signed out, which is an answer rather than a failure */
const signedOut: SignedInSession = {
    accessToken: () => Promise.resolve({ ok: false as const }),
};

describe("releaseTokenSource", () => {
    describe("the order of the three sources", () => {
        it("prefers the signed-in account over the environment", async () => {
            const token = releaseTokenSource({
                session: signedIn("from-the-sign-in"),
                environment: () => "from-the-environment",
            });

            expect(await token()).toBe("from-the-sign-in");
        });

        it("falls back to the environment when nobody is signed in", async () => {
            // the CI case, and the exported-a-token-in-a-shell case: both worked before
            // this file existed and must keep working
            const token = releaseTokenSource({
                session: signedOut,
                environment: () => "from-the-environment",
            });

            expect(await token()).toBe("from-the-environment");
        });

        it("reads the environment when there is no session at all", async () => {
            const token = releaseTokenSource({
                session: null,
                environment: () => "from-the-environment",
            });

            expect(await token()).toBe("from-the-environment");
        });

        it("answers null when neither source has one", async () => {
            // not an error: a public release needs no token and must never be made to
            const token = releaseTokenSource({ session: signedOut, environment: () => undefined });

            expect(await token()).toBeNull();
        });
    });

    describe("an empty string is not a token", () => {
        it("treats an empty environment variable as unset", async () => {
            // `GH_TOKEN=` in a shell profile is somebody unsetting it. Treating it as a
            // token present-but-blank is worse than useless: it picks the API asset URL,
            // which is the one route that needs authentication, then sends no credential.
            const token = releaseTokenSource({ session: null, environment: () => "" });

            expect(await token()).toBeNull();
        });

        it("falls through an empty signed-in token to the environment", async () => {
            const token = releaseTokenSource({
                session: signedIn(""),
                environment: () => "from-the-environment",
            });

            expect(await token()).toBe("from-the-environment");
        });
    });

    describe("nothing here throws", () => {
        it("degrades a rejecting session to the environment", async () => {
            // `accessToken` reports its refusals by returning them, so a rejection is
            // something unexpected below it — and the download it happened during is not
            // the place to surface that. The sign-in surface is.
            const token = releaseTokenSource({
                session: { accessToken: () => Promise.reject(new Error("the store is locked")) },
                environment: () => "from-the-environment",
            });

            expect(await token()).toBe("from-the-environment");
        });

        it("degrades a rejecting session with no environment to null", async () => {
            const token = releaseTokenSource({
                session: { accessToken: () => Promise.reject(new Error("the store is locked")) },
                environment: () => undefined,
            });

            expect(await token()).toBeNull();
        });
    });

    describe("the token is asked for again every time", () => {
        it("sees a sign-in that happened after the source was built", async () => {
            // the case this whole file exists for: somebody who signs in a minute after
            // the window opened. A value captured once at startup would be wrong for them
            // for ever.
            let current: SignedInSession = signedOut;
            const token = releaseTokenSource({
                // read through the getter so the test can change it mid-flight, the way
                // the application's own session changes when somebody signs in
                get session() {
                    return current;
                },
                environment: () => undefined,
            });

            expect(await token()).toBeNull();

            current = signedIn("signed-in-later");
            expect(await token()).toBe("signed-in-later");
        });

        it("asks the session again on every call, so a renewed token is seen", async () => {
            // `accessToken` renews a token that is close to expiring, so the answer is
            // only good for the operation that asked for it
            const handed: string[] = [];
            let issued = 0;
            const token = releaseTokenSource({
                session: {
                    accessToken: () => {
                        issued += 1;
                        return Promise.resolve({ ok: true as const, token: `token-${issued}` });
                    },
                },
            });

            handed.push((await token()) ?? "");
            handed.push((await token()) ?? "");

            expect(handed).toEqual(["token-1", "token-2"]);
        });
    });
});
