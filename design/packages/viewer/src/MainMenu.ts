import { i18n } from "./util/i18n";

export interface MenuPage {
    id: string;
    readonly title: string;
    [key: string]: unknown;
}

export class MainMenu {
    static NULL_PAGE: MenuPage = {
        id: "-",
        title: "-",
    };

    isOpen: boolean;
    pageStack: MenuPage[];

    constructor() {
        this.isOpen = false;
        this.pageStack = [];
    }

    currentPage(): MenuPage {
        if (this.pageStack.length === 0) return MainMenu.NULL_PAGE;
        return this.pageStack[this.pageStack.length - 1]!;
    }

    openPage(
        id: string = "root",
        title: string | (() => string) = () => i18n.t("menu.title"),
        data: object = {},
    ): void {
        if (!this.isOpen) {
            this.pageStack.splice(0, this.pageStack.length);
            this.isOpen = true;
        }

        if (typeof title === "function") {
            this.pageStack.push({
                id: id,
                get title() {
                    return title();
                },
                ...data,
            });
        } else {
            this.pageStack.push({
                id: id,
                title: title,
                ...data,
            });
        }
    }

    closePage(): void {
        this.pageStack.splice(this.pageStack.length - 1, 1);

        if (this.pageStack.length < 1) {
            this.isOpen = false;
        }
    }

    reOpenPage(): void {
        if (this.pageStack.length === 0) {
            this.openPage();
        } else if (this.pageStack[0]!.id !== "root") {
            this.pageStack.splice(0, this.pageStack.length);
            this.openPage();
        } else {
            this.isOpen = true;
        }
    }

    closeAll(): void {
        this.isOpen = false;
    }
}
