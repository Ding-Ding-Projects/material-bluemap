import type { Article } from "../types.js";
import { ACTION_ARTWORK_DOC_URL, repoFile } from "../links.js";

export const actionArtwork: Article = {
    id: "action-artwork",
    title: "One realistic image for each high-impact action",
    summary:
        "Cloud setup, local speed, restart, repository publication and destructive config review each use their own bundled image, semantic alt text and responsive frame.",
    category: "application",
    status: "shipped",
    statusNote:
        "Five local PNGs are wired into five exact owning surfaces. A hand-written inventory rejects missing files, filename reuse, empty semantic alternatives and owners that stop rendering their declared artwork; 143 focused owner and copy tests plus the 13-package production build passed. A packaged runtime capture is not claimed by this phase.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "The cloud-render setup, local Speed control, restart-to-install banner, repository backup publication action and config write/delete review each render a different realistic image whose subject matches that operation. The deletion image appears only for a save plan that really deletes files; a write-only save does not borrow destructive imagery.",
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "Artwork explains; controls still act",
                    content:
                        "No image contains a usable-looking button or replaces the real consent, permission check, progress state, restart action or two-key deletion gate. Every action remains an ordinary accessible application control.",
                },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "There is no artwork preference. The files ship locally, work offline and are chosen by explicit inventory keys. The shared renderer uses a wide ordinary frame, a taller compact frame below 560 CSS pixels, centred object-fit cropping and no animation. Localized surfaces supply translated alternative text; the semantic English inventory value is the fallback.",
                },
            ],
        },
        {
            id: "failure-modes",
            title: "Failure modes",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "A missing PNG or reused filename fails the inventory test.",
                        "Removing an artwork key from its owner fails the owner-wiring assertion.",
                        "An empty alternative or broken loading mode fails the mounted component tests.",
                        "An asset that Vite cannot bundle fails the production UI build rather than shipping a guessed URL.",
                    ],
                },
            ],
        },
        {
            id: "security",
            title: "Security considerations",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "The files are inert local raster assets with no network fetch, analytics, script, embedded action or metadata-driven behaviour. Artwork never changes authorization: repository visibility acknowledgement, write permission, update readiness and permanent deletion confirmation are still decided by the existing code paths.",
                },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "ActionArtwork.test.ts names all five actions by hand, checks the files and owners, mounts English fallback and translated alternative text, confirms there are no fake button elements, and pins compact and reduced-motion CSS. Existing owner suites prove their actions still behave, and the production build emits five distinct fingerprinted PNG files.",
                },
            ],
        },
    ],
    suggested: [
        {
            articleId: "render-in-actions",
            reason: "The cloud operation explained by the setup image.",
        },
        {
            articleId: "backups",
            reason: "The pack, checksum and publication flow shown by the repository image.",
        },
        {
            articleId: "destructive-action-gate",
            reason: "The real controls that remain authoritative when config files will be deleted.",
        },
    ],
    sources: [
        { label: "docs/action-artwork.md", href: ACTION_ARTWORK_DOC_URL },
        {
            label: "packages/ui/src/components/actionArtwork",
            href: repoFile("design/packages/ui/src/components/actionArtwork"),
        },
        {
            label: "packages/ui/src/assets/action-artwork",
            href: repoFile("design/packages/ui/src/assets/action-artwork"),
        },
    ],
};
