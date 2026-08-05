/**
 * The content model the site shell renders.
 *
 * Content is structured data, never HTML strings. The shell walks these blocks and
 * builds real DOM nodes with `textContent`, so nothing here can inject markup and
 * nothing needs a Markdown parser at runtime. It also means every piece of copy is
 * type-checked, and the search index can extract plain text without guessing.
 *
 * Nothing in this file describes a surface that does not exist. Where an article
 * documents something that is specified but not built, its `status` says so and the
 * shell is expected to render that status visibly.
 */

/* -------------------------------------------------------------------------- */
/* Inline content                                                             */
/* -------------------------------------------------------------------------- */

/** A run of text, optionally marked up. One shape per rendered element. */
export type Inline =
    | string
    | { readonly code: string }
    | { readonly strong: string }
    | { readonly em: string }
    | {
          readonly link: string;
          readonly href: string;
          /** True when the link leaves the site. The shell adds the usual affordances. */
          readonly external?: boolean;
      };

/** Either a single run or a sequence of them. */
export type InlineContent = Inline | readonly Inline[];

/* -------------------------------------------------------------------------- */
/* Block content                                                              */
/* -------------------------------------------------------------------------- */

export interface ParagraphBlock {
    readonly kind: "paragraph";
    readonly content: InlineContent;
}

export interface ListBlock {
    readonly kind: "list";
    readonly ordered?: boolean;
    readonly items: readonly InlineContent[];
}

export interface TableBlock {
    readonly kind: "table";
    /** Rendered as the table's caption element, so it reaches assistive technology. */
    readonly caption: string;
    readonly columns: readonly string[];
    readonly rows: readonly (readonly InlineContent[])[];
}

export interface CodeBlock {
    readonly kind: "code";
    /** Used for the label above the block. No syntax highlighting is applied. */
    readonly language: string;
    readonly code: string;
    readonly caption?: string;
}

/** A term-and-explanation pair list, for configuration and option reference. */
export interface DefinitionsBlock {
    readonly kind: "definitions";
    readonly items: readonly { readonly term: string; readonly description: InlineContent }[];
}

export type CalloutTone =
    /** Neutral background information. */
    | "note"
    /** Something that will bite the reader if they miss it. */
    | "warning"
    /** This is specified but not built. Never used for shipped behaviour. */
    | "not-implemented";

export interface CalloutBlock {
    readonly kind: "callout";
    readonly tone: CalloutTone;
    readonly title: string;
    readonly content: InlineContent;
}

export type Block = ParagraphBlock | ListBlock | TableBlock | CodeBlock | DefinitionsBlock | CalloutBlock;

/* -------------------------------------------------------------------------- */
/* Articles                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * How much of an article's subject actually exists. The shell renders this as a
 * visible badge, because a documentation site that reads identically for shipped and
 * unbuilt features is a site that misleads by default.
 */
/**
 * The badge word for each status is voiced, not modelled here: `packages/site/src/i18n/
 * strings.ts`'s `status.*` FIXED entries are the one source of truth, rendered through
 * `main.ts`'s `STATUS_LABEL_KEYS`. A second, unvoiced copy of the same four words used to
 * live here as `FEATURE_STATUS_LABELS`, read only in English regardless of the visitor's
 * chosen language -- removed rather than kept in step by hand.
 */
export type FeatureStatus =
    /** Built, on the default branch, and covered by tests that run in CI. */
    | "shipped"
    /** Code is ported and unit tested, but the phase exit criteria have not run. */
    | "ported-unverified"
    /** Written down in a contract or the plan. No implementation exists. */
    | "specified";

/** See `FeatureStatus`'s own comment: the section heading word is voiced via `category.*`. */
export type ArticleCategory = "application" | "engine" | "delivery" | "contracts";

/**
 * The five sections every feature article carries. Keeping them as fixed ids rather
 * than free text means a reader learns the shape once, and a missing section is a
 * test failure rather than something nobody notices.
 */
export const REQUIRED_SECTION_IDS = [
    "behaviour",
    "configuration",
    "failure-modes",
    "security",
    "verification",
] as const;

export type RequiredSectionId = (typeof REQUIRED_SECTION_IDS)[number];

export interface ArticleSection {
    readonly id: string;
    readonly title: string;
    readonly blocks: readonly Block[];
}

/** A pointer to another article, with the reason a reader would follow it. */
export interface SuggestedArticle {
    readonly articleId: string;
    /** Why this comes next: a prerequisite, a related feature, the next step. */
    readonly reason: string;
}

/** A file or issue in the repository that backs a claim in the article. */
export interface SourceRef {
    readonly label: string;
    readonly href: string;
}

export interface Article {
    readonly id: string;
    readonly title: string;
    /** One sentence. Shown on cards and in search results, and indexed for search. */
    readonly summary: string;
    readonly category: ArticleCategory;
    readonly status: FeatureStatus;
    /** One line saying precisely what the status means for this subject. */
    readonly statusNote: string;
    readonly sections: readonly ArticleSection[];
    /** Never empty: an article that ends without a next step is a dead end. */
    readonly suggested: readonly SuggestedArticle[];
    readonly sources: readonly SourceRef[];
}

/* -------------------------------------------------------------------------- */
/* Landing page                                                               */
/* -------------------------------------------------------------------------- */

/** A link out of the landing page, to an article or to a file in the repository. */
export interface HomeLink {
    readonly label: string;
    readonly href: string;
}

/**
 * A headline figure.
 *
 * Every one of these has to be countable by a reader who does not trust it, which is why
 * `detail` is required rather than optional: a number with no stated source is a number
 * nobody can check, and this page has no business printing one.
 */
export interface HomeStat {
    readonly value: string;
    readonly label: string;
    readonly detail: string;
}

/**
 * One of the two engines that can turn a world into tiles.
 *
 * `runsToday` is the load-bearing field. There are two engines in this project and only
 * one of them renders; a page that lists both without saying which is which lets a reader
 * conclude the TypeScript one is finished, which it is not.
 */
export interface EngineRow {
    readonly id: string;
    readonly name: string;
    /** Short role line, e.g. "Renders your world today". */
    readonly role: string;
    readonly runsToday: boolean;
    readonly body: InlineContent;
    /** The article that documents this engine in full. Always resolves. */
    readonly articleId: string;
    /**
     * Overrides the button's label.
     *
     * Both engines are documented in one article, and two buttons carrying the same
     * article title read as the same destination for no reason. The label may say what
     * the reader will find; it may not name an article that is not the one it opens.
     */
    readonly linkLabel?: string;
}

/**
 * One capability card.
 *
 * `status` and `statusNote` are the same pair the articles carry, for the same reason: a
 * landing page whose cards read identically for shipped and unbuilt work misleads by
 * default, and a badge nobody explains is decoration.
 */
export interface HomeFeature {
    readonly title: string;
    readonly body: string;
    readonly status: FeatureStatus;
    readonly statusNote: string;
    /** The article this card opens. Always resolves to a real article. */
    readonly articleId: string;
    /** Repository documents that go further than the article does. */
    readonly reading?: readonly HomeLink[];
}

export interface HomeFeatureGroup {
    readonly id: string;
    readonly title: string;
    readonly lede: string;
    readonly features: readonly HomeFeature[];
}

/** A titled band of the landing page, so section headings are type-checked copy too. */
export interface HomeSectionCopy {
    readonly title: string;
    readonly lede: string;
}

/** See `FeatureStatus`'s own comment: the `status` badge word is voiced via `phase.*`. */
export interface PhaseRow {
    readonly phase: string;
    readonly scope: string;
    readonly status: "done" | "in-progress" | "pending";
    readonly note?: string;
}

export interface HomeContent {
    readonly title: string;
    readonly tagline: string;
    /** One sentence in the hero, above the download button. */
    readonly summary: string;
    readonly intro: readonly Block[];

    /**
     * A step-by-step path for a reader who has never heard of BlueMap before landing here.
     * The intro above explains what the project is; this says what to actually do about it,
     * in the same three-fact order the desktop app's own first-run welcome step uses
     * (`packages/ui/src/components/setup/setupStrings.ts`'s `welcome.*` keys), reworded for
     * a website visitor rather than someone already inside the app. Keeping the two in step
     * is deliberate: the honest-expectations disclosure at the end of both is the same fact,
     * said once and not left to drift into two different claims.
     */
    readonly gettingStartedSection: HomeSectionCopy;
    readonly gettingStarted: readonly Block[];

    readonly statsSection: HomeSectionCopy;
    readonly stats: readonly HomeStat[];
    readonly statsNote: InlineContent;

    readonly enginesSection: HomeSectionCopy;
    readonly engines: readonly EngineRow[];
    readonly enginesNote: InlineContent;

    readonly showcaseSection: HomeSectionCopy;
    /** Said under the gallery: what these images are and are not. */
    readonly showcaseCaveat: string;
    readonly showcaseMoreLabel: string;
    /** Shown in place of the gallery when no committed capture resolved. */
    readonly showcaseUnavailable: string;

    readonly featuresSection: HomeSectionCopy;
    readonly featureGroups: readonly HomeFeatureGroup[];

    readonly notYetSection: HomeSectionCopy;
    readonly notYet: readonly string[];

    readonly phasesSection: HomeSectionCopy;
    readonly phases: readonly PhaseRow[];
    readonly phaseNote: InlineContent;

    readonly buildSection: HomeSectionCopy;
    readonly buildIt: readonly Block[];

    readonly readingSection: HomeSectionCopy;
    readonly furtherReading: readonly HomeLink[];
}

/* -------------------------------------------------------------------------- */
/* Release download                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The installer the Home page offers.
 *
 * Every field here comes from the GitHub releases API at build time, via
 * `scripts/fetch-release.mjs`. No URL is ever constructed by string concatenation:
 * `url` is the `browser_download_url` the API returned for an asset that was proved
 * to exist on a published, non-draft release.
 */
export interface ReleaseInstaller {
    /** Asset filename exactly as published. */
    readonly assetName: string;
    /** The immutable release asset URL, taken verbatim from the API response. */
    readonly url: string;
    readonly sizeBytes: number;
    /** Human platform name, e.g. "Windows 10 and 11". */
    readonly platform: string;
    /** CPU architecture as published, e.g. "x64". */
    readonly arch: string;
    /** Installer technology, e.g. "Squirrel.Windows". */
    readonly format: string;
}

export interface ReleaseInfo {
    readonly tag: string;
    /** The app version inside the tag, e.g. "0.1.0". */
    readonly version: string;
    readonly publishedAt: string;
    readonly releaseUrl: string;
    readonly installer: ReleaseInstaller;
}

/**
 * Either a verified release or a stated reason there is none. There is deliberately
 * no third state: the download button renders only when `available` is true, so a
 * failed or unverified fetch produces an absent button and an explanation, never a
 * guessed URL.
 */
export type ReleaseAvailability =
    | { readonly available: true; readonly generatedAt: string; readonly release: ReleaseInfo }
    | { readonly available: false; readonly generatedAt: string; readonly reason: string };

/* -------------------------------------------------------------------------- */
/* Screenshots                                                                */
/* -------------------------------------------------------------------------- */

export type ColourScheme = "light" | "dark" | "system";

/**
 * One capture from the app's Playwright harness.
 *
 * `windowSize`, `displayScale` and `colourScheme` are read from the harness manifest
 * and the capture's own filename, which the harness composes from the same constants
 * it drives the app with. Nothing here is a guess: a capture whose configuration
 * cannot be determined is published with `configurationKnown: false` and captioned
 * as such.
 */
export interface ScreenshotCapture {
    /** File name inside the published screenshots directory. */
    readonly file: string;
    /** Short title, derived from the capture name. */
    readonly title: string;
    readonly windowSize: string;
    readonly displayScale: string;
    readonly colourScheme: ColourScheme;
    readonly configurationKnown: boolean;
    readonly widthPx: number;
    readonly heightPx: number;
    readonly byteSize: number;
    /** Accessible description naming the surface and its configuration. */
    readonly alt: string;
}

export interface ScreenshotProvenance {
    /** The workflow run the artifact was downloaded from. */
    readonly runId: string;
    readonly runUrl: string;
    readonly commit: string;
    readonly capturedBy: string;
    readonly method: string;
}

export type ScreenshotAvailability =
    | {
          readonly available: true;
          readonly generatedAt: string;
          /** Directory the images were copied into, relative to the site root. */
          readonly publicPath: string;
          readonly provenance: ScreenshotProvenance;
          readonly captures: readonly ScreenshotCapture[];
      }
    | { readonly available: false; readonly generatedAt: string; readonly reason: string };
