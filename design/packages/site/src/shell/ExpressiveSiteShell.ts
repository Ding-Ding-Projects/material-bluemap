import type { I18n } from "../i18n/I18n.js";
import { icon } from "../platform/dom.js";
import type { SidebarNavigation } from "./SidebarNavigation.js";
import { applySidebarNavigation } from "./SidebarNavigation.js";
import type { TabModel } from "../tabs/TabModel.js";

export interface ExpressiveShellActions {
    readonly home: () => void;
    readonly search: () => void;
    readonly settings: () => void;
    readonly notifications: () => void;
    readonly palette: () => void;
}

export interface ExpressiveShellOptions {
    readonly root: HTMLElement;
    readonly i18n: I18n;
    readonly tabs: TabModel;
    readonly sidebar: SidebarNavigation;
    readonly tabBar: HTMLElement;
    readonly panels: HTMLElement;
    readonly footer: HTMLElement;
    readonly actions: ExpressiveShellActions;
}

/**
 * The Pages site's application shell.
 *
 * The previous entry point assembled a brand button, a tab strip and a main element directly
 * beside one another. That kept the controls working, but it also made the page hierarchy an
 * accident of append order. This class owns the complete M3 shell as one unit: top app bar,
 * adaptive navigation surface, bounded content canvas and persistent footer. Its only state is
 * the state already owned by TabModel and SidebarNavigation, so rebuilding the DOM does not
 * invent a second preference store.
 */
export class ExpressiveSiteShell {
    readonly element: HTMLElement;
    readonly appBar: HTMLElement;
    readonly navigation: HTMLElement;
    readonly main: HTMLElement;
    readonly skipLink: HTMLAnchorElement;

    private readonly options: ExpressiveShellOptions;
    private readonly toggle: HTMLButtonElement;
    private readonly navigationScrim: HTMLButtonElement;
    private scrolled = false;

    constructor(options: ExpressiveShellOptions) {
        this.options = options;

        this.skipLink = document.createElement("a");
        this.skipLink.className = "md-skip-link";
        this.skipLink.href = "#mb-main-content";
        options.i18n.bindText(this.skipLink, "shell.skipToContent");

        this.element = document.createElement("div");
        this.element.className = "mb-app-shell";

        this.appBar = document.createElement("header");
        this.appBar.className = "mb-app-bar";
        this.appBar.setAttribute("role", "banner");
        this.appBar.append(this.createBrand(), this.createProductCopy(), this.createQuickActions());

        this.navigation = document.createElement("nav");
        this.navigation.className = "mb-shell-topbar";
        this.navigation.setAttribute("aria-label", "Site pages");

        this.toggle = this.createNavigationToggle();
        options.tabBar.id = "site-primary-navigation";
        this.navigation.append(this.toggle, options.tabBar);

        this.main = document.createElement("main");
        this.main.className = "mb-main";
        this.main.id = "mb-main-content";
        this.main.tabIndex = -1;
        this.main.appendChild(options.panels);

        const frame = document.createElement("div");
        frame.className = "mb-shell-workspace";
        frame.append(this.navigation, this.main);

        this.navigationScrim = document.createElement("button");
        this.navigationScrim.className = "mb-navigation-scrim";
        this.navigationScrim.type = "button";
        this.navigationScrim.tabIndex = -1;
        this.navigationScrim.setAttribute("aria-label", "Close navigation");
        this.navigationScrim.addEventListener("click", () => options.sidebar.setCollapsed(true));

        this.element.append(this.appBar, frame, this.navigationScrim, options.footer);
        options.root.append(this.skipLink, this.element);

        const sync = (): void => this.syncLayout(frame);
        options.tabs.subscribe(sync);
        options.sidebar.subscribe(sync);
        options.i18n.subscribe(sync);
        sync();
        this.watchElevation();
    }

    private createBrand(): HTMLButtonElement {
        const brand = document.createElement("button");
        brand.className = "mb-brand";
        brand.type = "button";
        this.options.i18n.bindAttr(brand, "aria-label", "site.brandAria");
        brand.addEventListener("click", this.options.actions.home);

        const mark = document.createElement("span");
        mark.className = "mb-brand-mark";
        mark.setAttribute("aria-hidden", "true");
        mark.append(
            Object.assign(document.createElement("span"), { className: "mb-brand-mark__lens" }),
            Object.assign(document.createElement("span"), { className: "mb-brand-mark__voxel" }),
            Object.assign(document.createElement("span"), { className: "mb-brand-mark__glint" }),
        );

        const word = document.createElement("span");
        word.className = "mb-brand-word";
        word.textContent = "worldlens";
        brand.append(mark, word);
        return brand;
    }

    private createProductCopy(): HTMLElement {
        const copy = document.createElement("div");
        copy.className = "mb-app-bar__copy";
        const context = document.createElement("span");
        context.className = "mb-app-bar__context";
        context.textContent = "Minecraft world cartography";
        const tagline = document.createElement("span");
        tagline.className = "mb-app-bar__tagline";
        this.options.i18n.bindText(tagline, "shell.tagline");
        copy.append(context, tagline);
        return copy;
    }

    private createQuickActions(): HTMLElement {
        const actions = document.createElement("div");
        actions.className = "mb-app-bar__actions";
        actions.setAttribute("aria-label", "Quick actions");
        actions.append(
            this.quickAction("search", "Search every page", this.options.actions.search),
            this.quickAction(
                "notifications",
                "Notification history",
                this.options.actions.notifications,
            ),
            this.quickAction("tune", "Settings", this.options.actions.settings),
            this.quickAction(
                "search",
                "Command palette (Ctrl+Shift+F)",
                this.options.actions.palette,
                "mb-app-bar__palette-action",
            ),
        );
        return actions;
    }

    private quickAction(
        iconName: Parameters<typeof icon>[0],
        label: string,
        run: () => void,
        extraClass = "",
    ): HTMLButtonElement {
        const button = document.createElement("button");
        button.className = `md-icon-button mb-app-bar__action ${extraClass}`.trim();
        button.type = "button";
        button.setAttribute("aria-label", label);
        button.title = label;
        button.appendChild(icon(iconName));
        button.addEventListener("click", run);
        return button;
    }

    private createNavigationToggle(): HTMLButtonElement {
        const toggle = document.createElement("button");
        toggle.className = "md-icon-button mb-sidebar-toggle";
        toggle.type = "button";
        toggle.setAttribute("aria-controls", "site-primary-navigation");
        toggle.addEventListener("click", () => this.options.sidebar.toggle());
        return toggle;
    }

    private syncLayout(frame: HTMLElement): void {
        const placement = this.options.tabs.placement;
        const applied = applySidebarNavigation(
            {
                workspace: frame,
                topbar: this.navigation,
                navigation: this.options.tabBar,
                toggle: this.toggle,
            },
            placement,
            this.options.sidebar.collapsed,
            {
                collapse: this.options.i18n.t("shell.collapseNavigation"),
                expand: this.options.i18n.t("shell.expandNavigation"),
            },
        );
        this.toggle.replaceChildren(
            icon(applied.chevron === "right" ? "chevronRight" : "chevronLeft"),
        );
        this.element.dataset["navigationOpen"] = applied.collapsed ? "false" : "true";
        this.element.dataset["tabPlacement"] = placement;
        this.navigationScrim.hidden = applied.collapsed || !this.compactViewport();
    }

    private compactViewport(): boolean {
        return typeof window !== "undefined" && window.matchMedia("(width <= 720px)").matches;
    }

    private watchElevation(): void {
        if (typeof window === "undefined") return;
        let queued = false;
        const apply = (): void => {
            queued = false;
            const next = window.scrollY > 0;
            if (next === this.scrolled) return;
            this.scrolled = next;
            this.appBar.dataset["scrolled"] = next ? "true" : "false";
        };
        window.addEventListener(
            "scroll",
            () => {
                if (queued) return;
                queued = true;
                window.requestAnimationFrame(apply);
            },
            { passive: true },
        );
        apply();
    }
}
