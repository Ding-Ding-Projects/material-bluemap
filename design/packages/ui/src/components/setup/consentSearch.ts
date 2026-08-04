/**
 * Every label the consent settings row renders, so the settings page's own search finds
 * it.
 *
 * The settings surface already carries one search bar with its regex builder attached
 * (`MenuSearchBar` plus `MenuRegexBuilder`), and a second field inside the same page
 * would be a second builder quietly competing with the first for the same query. So this
 * row does not grow its own: it publishes what it can be found by, and the page that
 * owns the search bar folds these strings into the list it already matches against and
 * gates the row on the result.
 *
 * The strings come from the live catalogue at the current language mode and funny
 * levels, so searching for a word that is on screen finds the row that is on screen. A
 * fixed English list would fail the moment somebody switched to Cantonese, which is the
 * exact case where being able to find a setting matters most.
 */

import { flat } from "./setupI18n.js";

export function consentSearchLabels(): string[] {
    return [
        flat("consent.settingsTitle"),
        flat("consent.status.accepted"),
        flat("consent.status.declined"),
        flat("consent.field.answered"),
        flat("consent.field.document"),
        flat("consent.field.appVersion"),
        flat("action.openEula"),
        flat("action.acceptNow"),
        flat("action.withdraw"),
        flat("consent.why"),
        flat("consent.ifAccept"),
        flat("consent.ifDecline"),
        // The licence viewer folded into this row. Somebody who remembers reading the
        // document here should be able to find the row by typing "licence".
        flat("action.readLicence"),
        flat("eula.title"),
        flat("eula.navigationOnly"),
    ];
}
