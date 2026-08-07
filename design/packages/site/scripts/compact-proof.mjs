#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import process from "node:process";

const [
    widthText,
    heightText,
    scaleText,
    mode = "english",
    output,
    finalState = "collapsed",
    scenario = "home",
] = process.argv.slice(2);
const width = Number.parseInt(widthText ?? "", 10);
const height = Number.parseInt(heightText ?? "", 10);
const scale = Number.parseFloat(scaleText ?? "");
const cdpPort = Number.parseInt(process.env.PAGES_PROOF_CDP_PORT ?? "49229", 10);

if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(scale) ||
    output === undefined ||
    !["english", "cantonese", "bilingual"].includes(mode) ||
    !["collapsed", "expanded"].includes(finalState) ||
    ![
        "home",
        "settings",
        "schedule",
        "search",
        "command",
        "appearance",
        "notifications",
        "changelog",
        "tabs",
        "exports",
    ].includes(scenario)
) {
    throw new Error(
        "usage: compact-proof.mjs <width> <height> <scale> <english|cantonese|bilingual> <output.json> [collapsed|expanded] [home|settings|schedule|search|command|appearance|notifications|changelog|tabs|exports]",
    );
}

const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((response) =>
    response.json(),
);
const target = targets.find(
    (candidate) => candidate.type === "page" && candidate.url.includes("/material-bluemap/"),
);
if (target?.webSocketDebuggerUrl === undefined) {
    throw new Error(`No Pages target is available on CDP port ${cdpPort}.`);
}

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
});

let sequence = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id === undefined) return;
    const waiter = pending.get(message.id);
    if (waiter === undefined) return;
    pending.delete(message.id);
    if (message.error === undefined) waiter.resolve(message.result);
    else waiter.reject(new Error(JSON.stringify(message.error)));
});

function send(method, params = {}) {
    sequence += 1;
    const id = sequence;
    const reply = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    socket.send(JSON.stringify({ id, method, params }));
    return reply;
}

async function evaluate(expression) {
    const result = await send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
    });
    if (result.exceptionDetails !== undefined) {
        throw new Error(result.exceptionDetails.text ?? "Runtime evaluation failed.");
    }
    return result.result.value;
}

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: scale,
    mobile: width <= 720,
    screenWidth: width,
    screenHeight: height,
});

const language = mode === "cantonese" ? "yue" : mode === "bilingual" ? "bilingual" : "en";
await evaluate(`(() => {
    localStorage.clear();
    localStorage.setItem("mbm-site:language.mode", ${JSON.stringify(language)});
    localStorage.setItem("mbm-site:language.funny.en", "5");
    localStorage.setItem("mbm-site:language.funny.yue", "5");
    return true;
})()`);
await send("Page.reload", { ignoreCache: true });
await new Promise((resolve) => setTimeout(resolve, 900));

const interaction = await evaluate(`(() => {
    const toggle = document.querySelector(".mb-sidebar-toggle");
    if (!(toggle instanceof HTMLButtonElement) || toggle.hidden) return { available: false };
    const initial = {
        expanded: toggle.getAttribute("aria-expanded"),
        label: toggle.getAttribute("aria-label"),
    };
    toggle.focus();
    toggle.click();
    const afterFirst = {
        expanded: toggle.getAttribute("aria-expanded"),
        label: toggle.getAttribute("aria-label"),
        focusStayed: document.activeElement === toggle,
    };
    toggle.click();
    const afterSecond = {
        expanded: toggle.getAttribute("aria-expanded"),
        label: toggle.getAttribute("aria-label"),
        focusStayed: document.activeElement === toggle,
    };
    if (${JSON.stringify(finalState)} === "expanded" && toggle.getAttribute("aria-expanded") === "false") {
        toggle.click();
    }
    return {
        available: true,
        initial,
        afterFirst,
        afterSecond,
        final: {
            expanded: toggle.getAttribute("aria-expanded"),
            label: toggle.getAttribute("aria-label"),
            focusStayed: document.activeElement === toggle,
        },
    };
})()`);

const scenarioResult = await evaluate(`(() => {
    const click = (selector) => {
        const target = document.querySelector(selector);
        if (!(target instanceof HTMLElement)) return false;
        target.click();
        return true;
    };
    const selected = ${JSON.stringify(scenario)};
    let opened = true;
    if (selected === "settings" || selected === "schedule" || selected === "appearance" || selected === "exports") {
        opened = click("#tab-settings");
        if (selected === "schedule") {
            opened = click("#mb-tab-automation") && opened;
            opened = click("button[data-i18n-key='schedule.add']") && opened;
        }
        if (selected === "appearance") {
            opened = click("#mb-tab-appearance") && opened;
            opened = click("#mb-panel-appearance .mb-element-item button") && opened;
        }
        if (selected === "exports") opened = click("#mb-tab-data") && opened;
    } else if (selected === "search") opened = click("#tab-search");
    else if (selected === "notifications") opened = click("#tab-notifications");
    else if (selected === "changelog") opened = click("#tab-changelog");
    else if (selected === "tabs") opened = click(".tab-bar__actions .md-icon-button");
    else if (selected === "command") {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "F", code: "KeyF", ctrlKey: true, shiftKey: true, bubbles: true }));
        opened = true;
    }
    const selectors = {
        home: "#panel-home",
        settings: "#mb-panel-general",
        schedule: "[data-schedule-surface='rules']",
        search: "#panel-search",
        command: ".mb-command-palette:not([hidden])",
        appearance: ".mbm-panel:not([hidden]), .md-surface-overlay",
        notifications: "#panel-notifications",
        changelog: "#panel-changelog",
        tabs: ".md-surface-overlay, .mbm-panel:not([hidden])",
        exports: "#mb-panel-data",
    };
    const target = document.querySelector(selectors[selected]);
    target?.scrollIntoView({ block: "start", inline: "nearest" });
    return {
        scenario: selected,
        opened,
        selector: selectors[selected],
        targetPresent: target instanceof HTMLElement,
        targetVisible: target instanceof HTMLElement && !target.hidden && getComputedStyle(target).display !== "none" && target.getBoundingClientRect().width > 0,
    };
})()`);
await new Promise((resolve) => setTimeout(resolve, 180));

const metrics = await evaluate(`(() => {
    const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return !element.hidden && style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const controls = [...document.querySelectorAll("button, input, select, textarea, [role='button'], [role='tab'], [role='radio'], [role='switch']")]
        .filter(visible);
    const clippedControls = controls.flatMap((element) => {
        const rect = element.getBoundingClientRect();
        // A document page is expected to scroll vertically. The defect this gate catches is
        // a control escaping the viewport sideways, or clipping its own label.
        const outside = rect.left < -1 || rect.right > innerWidth + 1;
        const clipped = element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1;
        const intentionalScroller = (() => {
            for (let node = element.parentElement; node !== null; node = node.parentElement) {
                const style = getComputedStyle(node);
                if (["auto", "scroll"].includes(style.overflowX) && node.scrollWidth > node.clientWidth + 1) return true;
            }
            return false;
        })();
        if ((!outside || intentionalScroller) && !clipped) return [];
        return [{
            label: element.getAttribute("aria-label") || element.textContent?.trim().replace(/\\s+/g, " ").slice(0, 80) || element.tagName,
            outside,
            clipped,
            intentionalScroller,
            rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
        }];
    });
    const undersized = controls.flatMap((element) => {
        const proxy = element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)
            ? (element.parentElement?.matches(".mbm-check, .mbm-switch, .mbm-flags") === true
                ? element.parentElement
                : element.closest("label, .mbm-check, .mbm-switch, .mbm-flags, .mb-command-palette__setting, .mb-property-row"))
            : null;
        const target = proxy ?? element;
        const rect = target.getBoundingClientRect();
        // Layout engines can report a spec-compliant 44px box as 43.99994 after
        // device transforms. Half a CSS pixel is rounding tolerance, not a smaller target.
        if (rect.width >= 43.5 && rect.height >= 43.5) return [];
        return [{
            label: element.getAttribute("aria-label") || element.textContent?.trim().replace(/\\s+/g, " ").slice(0, 80) || element.tagName,
            width: rect.width,
            height: rect.height,
            measuredTarget: target === element ? "control" : target.className || target.tagName,
            inputType: element instanceof HTMLInputElement ? element.type : null,
            className: element.className,
            parentClassName: element.parentElement?.className ?? null,
        }];
    });
    const overflowingElements = [...document.body.querySelectorAll("*")].flatMap((element) => {
        if (!(element instanceof HTMLElement) || !visible(element)) return [];
        const rect = element.getBoundingClientRect();
        if (rect.left >= -0.1 && rect.right <= document.documentElement.clientWidth + 0.1) return [];
        let scrollOwner = null;
        for (let node = element.parentElement; node !== null; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (["auto", "scroll"].includes(style.overflowX) && node.scrollWidth > node.clientWidth + 1) {
                scrollOwner = node.id || node.className || node.tagName;
                break;
            }
        }
        return [{
            tag: element.tagName,
            id: element.id,
            className: element.className,
            left: rect.left,
            right: rect.right,
            width: rect.width,
            classification: scrollOwner === null ? "accidental" : "intentional-horizontal-scroller",
            scrollOwner,
        }];
    });
    const toggle = document.querySelector(".mb-sidebar-toggle");
    const navigation = document.querySelector("#site-primary-navigation");
    const workspace = document.querySelector(".mb-shell-workspace");
    const textWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let englishNodes = 0;
    for (let node = textWalker.nextNode(); node !== null; node = textWalker.nextNode()) {
        const parent = node.parentElement;
        if (parent === null || parent.closest(".i18n-secondary") !== null || !visible(parent)) continue;
        if ((node.textContent ?? "").trim().length > 0) englishNodes += 1;
    }
    const cantoneseNodes = [...document.querySelectorAll(".i18n-secondary")].filter(visible).length;
    return {
        viewport: { width: innerWidth, height: innerHeight, scale: devicePixelRatio },
        compact: matchMedia("(width <= 720px)").matches,
        documentOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        bodyOverflowX: document.body.scrollWidth - document.body.clientWidth,
        workspace: {
            placement: workspace?.getAttribute("data-tab-placement") ?? null,
            sidebarCollapsed: workspace?.getAttribute("data-sidebar-collapsed") ?? null,
        },
        navigation: {
            hidden: navigation instanceof HTMLElement ? navigation.hidden : null,
            toggleVisible: toggle instanceof HTMLElement ? visible(toggle) : false,
            expanded: toggle?.getAttribute("aria-expanded") ?? null,
            label: toggle?.getAttribute("aria-label") ?? null,
            controls: toggle?.getAttribute("aria-controls") ?? null,
            controlledElementExists: toggle instanceof HTMLElement && toggle.getAttribute("aria-controls") !== null
                ? document.getElementById(toggle.getAttribute("aria-controls")) instanceof HTMLElement
                : false,
        },
        language: { mode: document.documentElement.dataset.language ?? null, englishNodes, cantoneseNodes },
        clippedControls,
        undersized,
        overflowingElements,
    };
})()`);

const proof = {
    generatedAt: new Date().toISOString(),
    requested: { width, height, scale, mode, finalState, scenario },
    interaction,
    scenario: scenarioResult,
    metrics,
};
await writeFile(output, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
socket.close();

const failures = [];
if (
    metrics.viewport.width !== width ||
    metrics.viewport.height !== height ||
    Math.abs(metrics.viewport.scale - scale) > 0.001
)
    failures.push("viewport");
if (width <= 720 && !metrics.compact) failures.push("compact-breakpoint");
if (metrics.documentOverflowX !== 0 || metrics.bodyOverflowX !== 0)
    failures.push("horizontal-overflow");
if (metrics.clippedControls.length !== 0) failures.push("clipped-controls");
if (metrics.undersized.length !== 0) failures.push("undersized-controls");
if (metrics.overflowingElements.some((element) => element.classification === "accidental"))
    failures.push("accidental-offscreen-elements");
if (width <= 720 && !interaction.available) failures.push("sidebar-toggle-missing");
if (width <= 720 && metrics.navigation.toggleVisible !== true)
    failures.push("sidebar-toggle-hidden");
if (
    interaction.available &&
    (interaction.afterFirst.focusStayed !== true || interaction.afterSecond.focusStayed !== true)
)
    failures.push("focus-return");
if (
    interaction.available &&
    interaction.final.expanded !== (finalState === "expanded" ? "true" : "false")
)
    failures.push("sidebar-final-state");
if (interaction.available && metrics.navigation.hidden !== (finalState === "collapsed"))
    failures.push("navigation-hidden-state");
if (
    interaction.available &&
    (metrics.navigation.controls !== "site-primary-navigation" ||
        !metrics.navigation.controlledElementExists)
)
    failures.push("sidebar-aria-controls");
if (!scenarioResult.opened || !scenarioResult.targetPresent || !scenarioResult.targetVisible)
    failures.push(`scenario-${scenario}`);
if (
    mode === "bilingual" &&
    (metrics.language.englishNodes === 0 || metrics.language.cantoneseNodes === 0)
)
    failures.push("bilingual-nodes");
if (failures.length > 0)
    throw new Error(`Compact proof failed: ${failures.join(", ")}. See ${output}.`);

console.log(JSON.stringify({ output, viewport: metrics.viewport, interaction, failures }, null, 2));
