import { describe, expect, it } from "vitest";
import { MainMenu } from "./MainMenu";
import { i18n, setI18nAdapter, setLanguage } from "./util/i18n";

describe("MainMenu", () => {
    it("starts closed with an empty page-stack and returns NULL_PAGE", () => {
        const menu = new MainMenu();

        expect(menu.isOpen).toBe(false);
        expect(menu.pageStack).toEqual([]);
        expect(menu.currentPage()).toBe(MainMenu.NULL_PAGE);
        expect(MainMenu.NULL_PAGE).toEqual({ id: "-", title: "-" });
    });

    it("opens pages and tracks the current page", () => {
        const menu = new MainMenu();

        menu.openPage();
        expect(menu.isOpen).toBe(true);
        expect(menu.currentPage().id).toBe("root");

        menu.openPage("settings", "Settings");
        expect(menu.currentPage().id).toBe("settings");
        expect(menu.currentPage().title).toBe("Settings");
    });

    it("evaluates function-titles lazily via a getter", () => {
        const menu = new MainMenu();

        let title = "first";
        menu.openPage("page", () => title);
        expect(menu.currentPage().title).toBe("first");

        title = "second";
        expect(menu.currentPage().title).toBe("second");
    });

    it("passes extra data into the page object", () => {
        const menu = new MainMenu();

        menu.openPage("page", "Title", { extra: 42 });
        expect(menu.currentPage()["extra"]).toBe(42);
    });

    it("closes pages one by one and closes the menu with the last page", () => {
        const menu = new MainMenu();

        menu.openPage();
        menu.openPage("sub", "Sub");

        menu.closePage();
        expect(menu.isOpen).toBe(true);
        expect(menu.currentPage().id).toBe("root");

        menu.closePage();
        expect(menu.isOpen).toBe(false);
        expect(menu.currentPage()).toBe(MainMenu.NULL_PAGE);
    });

    it("reOpenPage restores the previous stack or resets to root", () => {
        const menu = new MainMenu();

        // empty stack -> opens root
        menu.reOpenPage();
        expect(menu.isOpen).toBe(true);
        expect(menu.currentPage().id).toBe("root");

        // closed but stack starts with root -> just re-opens
        menu.openPage("sub", "Sub");
        menu.closeAll();
        expect(menu.isOpen).toBe(false);
        menu.reOpenPage();
        expect(menu.isOpen).toBe(true);
        expect(menu.currentPage().id).toBe("sub");

        // stack not starting with root -> resets to root
        const menu2 = new MainMenu();
        menu2.openPage("other", "Other");
        menu2.closeAll();
        menu2.reOpenPage();
        expect(menu2.pageStack).toHaveLength(1);
        expect(menu2.currentPage().id).toBe("root");
    });

    it("uses the i18n seam for the default root title", async () => {
        const menu = new MainMenu();
        menu.openPage();

        // default identity adapter returns the key
        expect(menu.currentPage().title).toBe("menu.title");

        const languages: string[] = [];
        setI18nAdapter(
            {
                locale: { value: "en" },
                t: (key) => `translated:${key}`,
            },
            async (lang) => {
                languages.push(lang);
            },
        );
        try {
            expect(menu.currentPage().title).toBe("translated:menu.title");
            expect(i18n.locale.value).toBe("en");
            await setLanguage("de");
            expect(languages).toEqual(["de"]);
        } finally {
            // restore the default identity adapter for other tests
            setI18nAdapter({ locale: { value: "none" }, t: (key) => key }, async () => {});
        }
    });
});
