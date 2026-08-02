export class KeyCombination {
    static CTRL = 0;
    static SHIFT = 1;
    static ALT = 2;

    code: string;
    ctrl: boolean;
    shift: boolean;
    alt: boolean;

    constructor(code: string, ...modifiers: number[]) {
        this.code = code;
        this.ctrl =
            modifiers.includes(KeyCombination.CTRL) ||
            this.code === "CtrlLeft" ||
            this.code === "CtrlRight";
        this.shift =
            modifiers.includes(KeyCombination.SHIFT) ||
            this.code === "ShiftLeft" ||
            this.code === "ShiftRight";
        this.alt =
            modifiers.includes(KeyCombination.ALT) ||
            this.code === "AltLeft" ||
            this.code === "AltRight";
    }

    testDown(evt: KeyboardEvent): boolean {
        return (
            this.code === evt.code &&
            this.ctrl === evt.ctrlKey &&
            this.shift === evt.shiftKey &&
            this.alt === evt.altKey
        );
    }

    testUp(evt: KeyboardEvent): boolean {
        return this.code === evt.code;
    }

    static oneDown(evt: KeyboardEvent, ...combinations: KeyCombination[]): boolean {
        for (const combination of combinations) {
            if (combination.testDown(evt)) return true;
        }
        return false;
    }

    static oneUp(evt: KeyboardEvent, ...combinations: KeyCombination[]): boolean {
        for (const combination of combinations) {
            if (combination.testUp(evt)) return true;
        }
        return false;
    }
}
