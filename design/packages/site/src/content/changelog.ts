/** The site's changelog is parsed from the repository record, never retyped in the UI. */
import rawChangelog from "../../../../../CHANGELOG.md?raw";
import { parseChangelog } from "./changelogParser.js";
import type { ParsedChangeEntry } from "./changelogParser.js";
export type ChangeEntry = ParsedChangeEntry;

export const changelogEntries: readonly ChangeEntry[] = parseChangelog(rawChangelog);
