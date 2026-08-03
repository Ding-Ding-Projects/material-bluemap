import DOMPurify from "dompurify";

/**
 * Sanitizes server-provided HTML (marker labels/detail, html markers, popups) before it
 * is inserted into the DOM. Upstream injects this HTML raw; sanitizing is an intentional
 * security deviation of the port (see docs/porting-conventions.md).
 */
export function sanitizeHtml(html: string): string {
    return DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true, svg: true },
        FORBID_TAGS: ["style"],
    });
}
