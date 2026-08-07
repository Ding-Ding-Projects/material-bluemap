/**
 * Tests for which application the app signs in as.
 *
 * The kind is the part worth pinning down. An App and an OAuth App are configured with
 * two strings that look alike and behave differently: one takes a scope list and one
 * ignores it, one issues a token that expires and one does not. A fork that points at
 * its own application and gets the kind wrong produces a sign-in that appears to work
 * and grants nothing, so the resolution rules are explicit rather than clever.
 */

import { describe, expect, it } from "vitest";
import {
    GITHUB_APP_CLIENT_ID,
    GITHUB_OAUTH_CLIENT_ID,
    clientKindFromId,
    resolveClient,
    resolveClientSecret,
    scopesForClient,
    tokenSourceForClient,
} from "./config.js";

describe("resolveClient", () => {
    it("signs in with the OAuth application by default", () => {
        expect(resolveClient({})).toEqual({ id: GITHUB_OAUTH_CLIENT_ID, kind: "oauth" });
    });

    it("ignores a declared kind that no id was given for", () => {
        // A kind says what sort of application an id is; it does not say which
        // application to use. Applying `app` to the built-in OAuth id would send an
        // App-shaped request - no scope at all - to a client that needs one, and sign
        // somebody in with no permissions and nothing on screen to explain it.
        expect(resolveClient({ MATERIAL_BLUEMAP_GITHUB_CLIENT_KIND: "app" })).toEqual({
            id: GITHUB_OAUTH_CLIENT_ID,
            kind: "oauth",
        });
    });

    it("selects the GitHub App when its id and kind are both given", () => {
        expect(
            resolveClient({
                MATERIAL_BLUEMAP_GITHUB_CLIENT_ID: GITHUB_APP_CLIENT_ID,
                MATERIAL_BLUEMAP_GITHUB_CLIENT_KIND: "app",
            }),
        ).toEqual({ id: GITHUB_APP_CLIENT_ID, kind: "app" });
    });

    it("reads the Worldlens variables and gives them precedence over legacy aliases", () => {
        expect(
            resolveClient({
                WORLDLENS_GITHUB_CLIENT_ID: "Iv0000000000000001",
                WORLDLENS_GITHUB_CLIENT_KIND: "app",
                MATERIAL_BLUEMAP_GITHUB_CLIENT_ID: "Ov0000000000000002",
                MATERIAL_BLUEMAP_GITHUB_CLIENT_KIND: "oauth",
            }),
        ).toEqual({ id: "Iv0000000000000001", kind: "app" });
    });

    it("takes a fork's own client id, and its declared kind", () => {
        expect(
            resolveClient({
                MATERIAL_BLUEMAP_GITHUB_CLIENT_ID: "  custom-client  ",
                MATERIAL_BLUEMAP_GITHUB_CLIENT_KIND: "app",
            }),
        ).toEqual({ id: "custom-client", kind: "app" });
    });

    it("reads the kind from GitHub's own id prefixes when it was not declared", () => {
        expect(clientKindFromId("Iv23liPCatYTLpipKJYS")).toBe("app");
        expect(clientKindFromId("Ov23liJJhHYC2YP1iTFN")).toBe("oauth");
        expect(clientKindFromId("something-else")).toBeNull();

        expect(resolveClient({ MATERIAL_BLUEMAP_GITHUB_CLIENT_ID: "Iv0000000000000000" })).toEqual({
            id: "Iv0000000000000000",
            kind: "app",
        });
    });

    it("assumes oauth for an unrecognisable id, which is the safer guess", () => {
        // Guessing `app` would omit the scope list an OAuth App genuinely needs and sign
        // somebody in with no permissions at all; guessing `oauth` sends a scope an App
        // ignores. Only one of those two mistakes is recoverable without a support thread.
        expect(resolveClient({ MATERIAL_BLUEMAP_GITHUB_CLIENT_ID: "zz-unknown" })).toEqual({
            id: "zz-unknown",
            kind: "oauth",
        });
    });

    it("reports no client at all rather than pretending, when a build has none", () => {
        expect(resolveClient({}, { id: "", kind: "app" })).toBeNull();
    });

    it("ignores an empty override rather than treating it as a client id", () => {
        expect(resolveClient({ MATERIAL_BLUEMAP_GITHUB_CLIENT_ID: "   " })).toEqual({
            id: GITHUB_OAUTH_CLIENT_ID,
            kind: "oauth",
        });
    });
});

describe("scopes and sources", () => {
    it("asks for nothing on behalf of a GitHub App", () => {
        expect(scopesForClient("app")).toEqual([]);
        expect(scopesForClient("oauth")).toEqual(["public_repo", "workflow", "read:user"]);
    });

    it("records which kind of token a client issues", () => {
        expect(tokenSourceForClient("app")).toBe("github-app");
        expect(tokenSourceForClient("oauth")).toBe("oauth-app");
    });
});

describe("resolveClientSecret", () => {
    it("is null unless a build genuinely has one", () => {
        expect(resolveClientSecret({})).toBeNull();
        expect(resolveClientSecret({ MATERIAL_BLUEMAP_GITHUB_CLIENT_SECRET: "  " })).toBeNull();
        expect(resolveClientSecret({ MATERIAL_BLUEMAP_GITHUB_CLIENT_SECRET: "s3cret" })).toBe(
            "s3cret",
        );
    });

    it("prefers the current Worldlens secret variable over its legacy alias", () => {
        expect(
            resolveClientSecret({
                WORLDLENS_GITHUB_CLIENT_SECRET: "current",
                MATERIAL_BLUEMAP_GITHUB_CLIENT_SECRET: "legacy",
            }),
        ).toBe("current");
    });
});
