import type { Article } from "../types.js";
import { BACKUP_DOC_URL, LARGE_WORLDS_DOC_URL, repoFile } from "../links.js";

export const backups: Article = {
    id: "backups",
    title: "Backing up a world or a rendered map to GitHub",
    summary:
        "A world or a render packed into one deterministic archive, cut into parts, and published as the assets of a new GitHub release with a pointer file naming every part and its digest. Git LFS was rejected on cost, by name.",
    category: "application",
    status: "shipped",
    statusNote:
        "A real backup, a real cancel-and-resume and a real restore have all now run against real github.com: packing a small world, publishing it as a release, resuming it under its original archive name after a genuine mid-upload cancel, and restoring both the fresh and the resumed release back to a byte-for-byte match of the source folder, against a throwaway public repository kept as evidence. That live run found and fixed a real bug on the way. GitHub answers the same 422 status for a genuine taken-tag collision and for \"this repository has no commits yet\", and the code used to assume every 422 meant the first, telling somebody backing up to a brand-new repository to retry forever. Restoring also needed a real engine that did not exist before this pass: the claim that restoring reused the downloads surface was never true, since that surface only understands a different split format and cannot read a Cheap LFS release at all, so main/backup/restore.ts now does the job for real, proven by round-tripping a genuine backup through it byte for byte as well as against real GitHub. Twelve test files cover the feature end to end. What remains is one integration step, not a verification gap: the Restore button in the app still only opens Downloads and asks the person to fetch the release by hand, because the new engine is not yet wired to a channel, a bridge method or that button.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "A rendered map is hours of work and a Minecraft world is not reproducible at all, so ",
                        "both are worth keeping somewhere that is not the machine they live on. The Backups ",
                        "screen packs the folder into one archive, cuts it into parts, and publishes the parts ",
                        "as the assets of a ",
                        { strong: "new GitHub release" },
                        ", with a small pointer file beside them naming every part and its SHA-256.",
                    ],
                },
                {
                    kind: "list",
                    ordered: true,
                    items: [
                        [
                            { strong: "Read the folder." },
                            " Count the files, total the bytes, and name anything the pack will leave out ",
                            "with the reason, so a count that differs from a file manager's is explained ",
                            "rather than silent. Symbolic links are skipped and never followed: a world folder ",
                            "with a link pointing at a home directory would otherwise pack that home directory ",
                            "into something somebody is about to publish.",
                        ],
                        [
                            { strong: "Read the repository." },
                            " Its visibility is read from GitHub rather than guessed from its name, and ",
                            "whether this account may actually write to it is checked before anything is ",
                            "packed.",
                        ],
                        [
                            { strong: "Pack, deterministically." },
                            " One streamed Zip64 archive, hashed as it is written, with entries sorted by ",
                            "their UTF-8 bytes rather than a locale collation, fixed timestamps, fixed modes, ",
                            "and no compression. The same folder packs to the same bytes on any machine. ",
                            "Storing rather than deflating is deliberate: a render is mostly PNG tiles and a ",
                            "world is mostly already-compressed region files.",
                        ],
                        [
                            { strong: "Split, publish, upload." },
                            " 500 MiB parts, each with its own digest, then a new release under a unique tag, ",
                            "then every part, then the sidecar, then the pointer.",
                        ],
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "The pointer goes last, on purpose",
                    content: [
                        "It is the completion marker. A release with a pointer is a backup that finished, and ",
                        "a release with parts and no pointer is an upload that stopped part-way. Doing it the ",
                        "other way round would make the release look complete while the parts were still ",
                        "going up, which produces the single worst failure this feature could have: a backup ",
                        "somebody trusts that restores as an unverifiable fragment on the day they need it.",
                    ],
                },
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "What can be backed up",
                            description:
                                "A world, checked by a level.dat directly inside it, or a render workspace, checked by a render.json or a web folder. Picking the folder above a world is the most common mistake and the most expensive, so the refusal names the folder and says what was looked for rather than spending an hour packing the wrong tree.",
                        },
                        {
                            term: "A public repository is a loud warning",
                            description:
                                "Everything uploaded can be downloaded by anybody, with no account and no link, and a world carries builds, coordinates and whatever anyone left in a chest. The backup will not proceed until the acknowledgement is ticked, and the main process refuses an unacknowledged public repository as well, because a guard that lives only in the renderer is not a guard.",
                        },
                        {
                            term: "A private repository is a quieter note",
                            description:
                                "Private is not the same as free: a private repository's releases still count against the account's storage limits. The note says cheap rather than free instead of promising anything.",
                        },
                        {
                            term: "Restoring has its own engine now",
                            description:
                                "It does not reuse the downloads surface, whatever an earlier version of this article said: that surface only understands a different split format and cannot read a Cheap LFS release at all. main/backup/restore.ts reads the pointer, fetches every part, verifies each one and the whole file, and unpacks it, proven byte-for-byte against a real backup on real GitHub. Choosing Restore in the app does not reach it yet - that one wiring step is what remains.",
                        },
                        {
                            term: "Stopping is safe",
                            description:
                                "A cancelled backup keeps everything it has packed and everything it has uploaded, and starting again against the same tag carries on rather than starting over. A resumed upload skips a part only when an asset of that exact name and exact size is already on the release.",
                        },
                        {
                            term: "Backups are append-only",
                            description:
                                "Every backup is its own new release under its own unique tag. Nothing edits a release, deletes one, deletes an asset or replaces an asset's bytes, and a tag that already exists is refused rather than adopted. There is therefore no delete button, which is a decision rather than an omission: a backup somebody no longer wants is removed on GitHub, where what is being removed is in front of them.",
                        },
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The resume rule is stated precisely rather than overclaimed. Each part's asset name ",
                        "carries the first sixteen hex characters of that part's own SHA-256, and the archive ",
                        "is deterministic, so an asset under that name is one whose content hashed to that ",
                        "value when it was uploaded. That is what makes name-and-size a digest match rather ",
                        "than a guess. ",
                        { strong: "GitHub publishes no checksum of its own for a release asset" },
                        ", and the alternative is downloading every part back to hash it, which on a resumed ",
                        "20 GB upload costs more than uploading it again. A part whose stored size does not ",
                        "match is re-uploaded rather than trusted.",
                    ],
                },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "There is nothing to configure. Everything that could have been a setting is decided ",
                        "by the pointer format or by the cost model that produced the feature.",
                    ],
                },
                {
                    kind: "table",
                    caption: "The four fixed decisions, and why each is not a setting",
                    columns: ["Thing", "Value", "Why it is fixed"],
                    rows: [
                        [
                            "Part size",
                            "500 MiB",
                            "The canonical Cheap LFS write size. Changing it would produce pointers that differ from the sibling application's for no benefit, and a failed part re-transfers its whole size, so a part near the 2 GB ceiling turns one dropped connection into gigabytes of repeated upload.",
                        ],
                        [
                            "Compression",
                            "None",
                            "The payload is already-compressed tiles and region files, so compression buys single-digit percentages while spending CPU on every byte of a multi-gigabyte pack.",
                        ],
                        [
                            "Release visibility",
                            "Prerelease",
                            "A backup quietly becoming the repository's latest release would break installer links and release feeds.",
                        ],
                        [
                            "Where it is staged",
                            "Under the chosen map storage folder",
                            "It follows the storage folder chosen during setup, so a backup does not fill a disk somebody deliberately moved away from.",
                        ],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The GitHub sign-in is the application's own, configured in Settings. A backup needs an ",
                        "account with push access to the chosen repository, and a refusal that is probably a ",
                        "missing scope says so rather than reporting a bare 403.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "Git LFS was rejected on cost, by name",
                    content: [
                        "A free GitHub account gets one gigabyte of LFS storage and one gigabyte of bandwidth ",
                        "a month, and that bandwidth is metered against every restore rather than only every ",
                        "upload. A world or a rendered map is routinely several gigabytes, so one backup ",
                        "exhausts the storage tier outright and every restore of it is billed again. Release ",
                        "assets have a different cost model: free on a public repository, capped per asset ",
                        "rather than in total, and not metered against an LFS quota. The only thing they ",
                        "cannot do is hold one file larger than the cap, which is the problem this project ",
                        "already solved when it built the part splitter and the download path that rejoins ",
                        "them.",
                    ],
                },
            ],
        },
        {
            id: "failure-modes",
            title: "Failure modes",
            blocks: [
                {
                    kind: "table",
                    caption: "What is reported, and what is left behind",
                    columns: ["What happens", "What is reported", "What is left behind"],
                    rows: [
                        ["Nobody is signed in", "Sign in from Settings, before any network call is made", "Nothing; no request was sent"],
                        ["The folder is not the kind it was offered as", "The folder's path and what was looked for, before any network call", "Nothing"],
                        ["The folder is empty", "A refusal saying an empty backup is worse than none, because it looks like one", "Nothing"],
                        ["The account cannot write to the repository", "Named, with the repository", "Nothing; no release was created"],
                        ["The repository is public and unacknowledged", "The warning, and that nothing was uploaded", "Nothing"],
                        ["The tag already exists", "A refusal saying nothing was changed and the existing release was left alone", "Nothing"],
                        ["The token is refused", "The refusal, plus a route to sign in again at the surface where it happened", "Whatever had uploaded"],
                        ["The connection drops mid-upload", "The failure, and the row offers to carry on", "The staged archive, the parts, and every asset already uploaded"],
                        ["Cancelled", "That everything already packed and uploaded is kept", "The same"],
                        ["The pack is cancelled or fails", "The failure", "Nothing: a partial archive is deleted, because a half-written zip looks exactly like a finished one to anything that only checks the name"],
                    ],
                },
                {
                    kind: "list",
                    items: [
                        "An upload that never finished has no pointer, so there is nothing to verify a restore against. It is listed anyway, because hiding it would leave somebody hunting for a backup they thought they made, and it is marked unfinished with no restore button and a note saying that backing the same folder up again carries it on.",
                        "Every failure is reported in the main process's own words. Nothing is retried silently, and no failure is reported as a success.",
                        "A pointer using the compressed or password-encrypted part forms is recognised and named as unsupported here rather than reported as corrupt, because somebody holding an encrypted backup needs to be told this build has no password path, not that their file is broken.",
                    ],
                },
            ],
        },
        {
            id: "security",
            title: "Security considerations",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "The token never crosses to the renderer. The main process holds the GitHub session and resolves a token per operation, nothing on the bridge carries a credential in either direction, and a test walks every channel's answer asserting the token does not appear in it.",
                        "Publishing a world is publishing everything in it. A save carries coordinates, builds, inventories and anything a guest left behind, and once it is up, deleting the release later does not recall what was already downloaded. That is why the public warning blocks rather than informs.",
                        "Links are not followed. A link inside a world folder is skipped and named, so a backup cannot be talked into packing a home directory.",
                        "Everything read back off a release is untrusted input. Anybody with write access to that repository could have replaced the sidecar or the pointer, so both are size-bounded before they are fetched and every field is proved before a listing shows any of it. Anything doubtful makes the whole record unreadable rather than a half-populated row, and part names are treated as plain file names rather than resolved against a directory unchecked.",
                        "Every restored payload is hashed on arrival and must equal the pointer's digest and byte size before it may replace anything.",
                        "No encryption is written here. A backup on a public repository is public, and this feature does not pretend to offer a password path it does not have.",
                        "Nothing existing is ever changed. The append-only rule is not a convention: the functions that would break it are not in the module, and a test watches every request across a full backup and a resume, asserting the only methods used are GET and POST.",
                    ],
                },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                {
                    kind: "table",
                    caption: "What each test file holds",
                    columns: ["File", "What it pins"],
                    rows: [
                        [
                            { code: "main/backup/pointer.test.ts" },
                            "The canonical v1 regular expressions, copied verbatim out of the sibling application's own pointer module, applied to what this writer produces; the five-line single-asset form; the part-sum rule; encrypted and deflated pointers named as unsupported rather than broken.",
                        ],
                        [
                            { code: "main/backup/archive.test.ts" },
                            "The same folder packs to the same digest twice; what is written opens in this project's own zip reader and unpacks into an identical tree; a cancelled pack leaves nothing behind.",
                        ],
                        [
                            { code: "main/backup/source.test.ts" },
                            "A world without a level.dat is refused; the folder above a world is refused by name; an empty folder is refused; tags and archive names are safe for a tag, a file name and a URL at once.",
                        ],
                        [
                            { code: "main/backup/sidecar.test.ts" },
                            "Every field proved before a listing trusts it; a bad version, kind, digest or count makes the record null.",
                        ],
                        [
                            { code: "main/backup/github.test.ts" },
                            "Only repositories with push access are offered; a genuine taken-tag 422 (matched by GitHub's own structured error code) says nothing was changed; an empty-repository 422 - the same status, a different body - is told apart and named correctly rather than reported as a taken tag; an upload streams rather than buffering; no method other than GET or POST is ever sent.",
                        ],
                        [
                            { code: "main/backup/runner.test.ts" },
                            "A whole backup against real folders and a fake GitHub: the pointer's parts hash to what landed and rejoin to the promised archive; the pointer goes up last; a public repository is refused unacknowledged and uploads nothing; a resume skips digest-matched parts and re-uploads a truncated one; a cancel mid-part keeps what was already up and never leaves a pointer.",
                        ],
                        [
                            { code: "main/backup/restore.ts / restore.test.ts" },
                            "The engine that actually restores a backup: reads the pointer, fetches every part, verifies each one and the whole file, unpacks it. A real BackupRunner upload round-tripped through it byte-for-byte, including the single-asset form; a stopped upload with parts but no pointer is refused as incomplete rather than restored; a corrupted part is caught before anything unpacks; cancellation is reported as cancellation, not failure.",
                        ],
                        [
                            { code: "main/backup/backup.realGithub.test.ts" },
                            "Skipped unless MBM_TEST_BACKUP_LIVE=1 is set. Packs, publishes, cancels mid-upload, resumes under the same tag, and restores - twice, once fresh and once resumed - against real api.github.com and uploads.github.com, with the restored folder checked byte-for-byte against the original both times.",
                        ],
                        [
                            { code: "main/backup/ipc.test.ts" },
                            "Exactly the named channels are registered and removed; the token appears in no answer; being signed out is an answer rather than a crash.",
                        ],
                        [
                            { code: "components/backup/backups.test.ts" },
                            "Events land in the right row; a refusal with no id is reported beside the form rather than as a phantom row; reading a repository clears the previous answer first.",
                        ],
                        [
                            { code: "components/backup/BackupRunCard.test.ts" },
                            "The upload progress card renders the phase, the byte counts and the estimate a running backup reports.",
                        ],
                        [
                            { code: "components/backup/BackupScreen.test.ts" },
                            "A build with no bridge says what is needed; the public warning and its acknowledgement render; restoring emits the release's coordinates and fetches nothing itself; an unfinished backup offers no restore.",
                        ],
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "Proven against real github.com, and a real bug it found",
                    content: [
                        "A small multi-part world was packed, published, cancelled mid-upload, resumed under ",
                        "its original archive name, and restored - both the fresh release and the resumed one ",
                        "- against a throwaway public repository kept as evidence, with the restored folder ",
                        "checked byte-for-byte against the source. That run found a real defect on the way: ",
                        "GitHub answers the same 422 status for a genuine taken-tag collision and for ",
                        "\"this repository has no commits yet\", and the code used to assume every 422 meant ",
                        "the first, telling somebody backing up to a brand-new repository to retry forever. ",
                        "Fixed by reading GitHub's own structured error code rather than the status alone. ",
                        "The largest archive packed in any test, including the live one, is still a few ",
                        "megabytes: the Zip64 records are written for every entry rather than only for large ",
                        "ones precisely so the four-gigabyte boundary is not a code path that only runs on ",
                        "archives nobody can afford to test with, but that boundary has not been crossed with ",
                        "real data here.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "One integration step remains: the Restore button itself",
                    content: [
                        "Restoring now has a real engine, ",
                        { code: "main/backup/restore.ts" },
                        ", proven against real GitHub. What is not yet true is that pressing ",
                        { strong: "Restore this" },
                        " in the app reaches it: the button still only opens Downloads and asks the person ",
                        "to fetch the release by hand, because the engine is not yet wired to an IPC channel, ",
                        "a bridge method or the button - and, as it happens, the downloads surface it used to ",
                        "hand off to cannot read a Cheap LFS release at all, so that handoff was never going ",
                        "to work either. That wiring is the one piece of this feature that remains.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "The interoperability claim is about the grammar, and only the grammar",
                    content: [
                        "The pointer format is not this project's. It is Cheap LFS v1, a shipped subsystem of ",
                        "the sibling application Desktop Material, and this feature speaks it rather than ",
                        "inventing a rival so that a backup made by either application is readable by the ",
                        "other. What is verified is that every pointer this writer produces satisfies the ",
                        "canonical regular expressions and head-field rules, copied verbatim out of that ",
                        "application's own pointer module and applied line by line - and, now, that this ",
                        "project's own writer and this project's own restorer agree with each other and with ",
                        "real GitHub. What is ",
                        { strong: "not" },
                        " claimed is that a backup made here restores through Desktop Material's own restore ",
                        "path end to end, or the other way round. That needs that application running against ",
                        "a real release, which this suite cannot do, and asserting it from a passing regular ",
                        "expression would be a claim about software this repository does not build.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Nothing is added to a pointer, either. Everything this application knows about a ",
                        "backup that the format does not carry lives in a separate sidecar asset on the same ",
                        "release, because a pointer with an extra field would not parse in the application it ",
                        "was copied from, which is the whole property being traded on. The long form, ",
                        "including the pointer grammar and what a backup looks like on a release, is in ",
                        { link: "docs/backup.md", href: BACKUP_DOC_URL, external: true },
                        ".",
                    ],
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "release-downloads",
            reason: "A different split format on the same idea - why it cannot read a backup's own parts, and what it restores instead.",
        },
        {
            articleId: "github-sign-in",
            reason: "The account a backup runs under, and the credential that never reaches the renderer.",
        },
        {
            articleId: "release-pipeline",
            reason: "The splitter and manifest this reuses, and the other place the project publishes assets.",
        },
        {
            articleId: "render-in-actions",
            reason: "The other place this project puts a world on GitHub, and what that does and does not protect.",
        },
    ],

    sources: [
        { label: "docs/backup.md", href: BACKUP_DOC_URL },
        { label: "docs/large-worlds.md", href: LARGE_WORLDS_DOC_URL },
        {
            label: "packages/app/src/main/backup",
            href: repoFile("design/packages/app/src/main/backup"),
        },
        {
            label: "packages/ui/src/components/backup",
            href: repoFile("design/packages/ui/src/components/backup"),
        },
    ],
};
