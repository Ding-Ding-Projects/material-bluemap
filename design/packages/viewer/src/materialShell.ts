import type { MapInteractionEventDetail } from "./MapViewer";

type Pin = { id: string; x: number; y: number; z: number; label: string; screenX?: number; screenY?: number };

const STYLE = `
.bm-m3-shell{position:relative;width:100%;height:100%;font:500 14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1a1b20;--bm-primary:#415f91;--bm-on-primary:#fff;--bm-surface:#f9f9ff;--bm-surface-container:#edeef4;--bm-outline:#74777f;--bm-shadow:0 3px 12px #001a3a33;}
.bm-m3-shell[data-theme="dark"]{color:#e2e2e9;--bm-primary:#a9c7ff;--bm-on-primary:#12315c;--bm-surface:#111318;--bm-surface-container:#1e2026;--bm-outline:#8e9099;}
.bm-m3-appbar{position:absolute;z-index:20;inset:12px 12px auto 12px;display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:18px;background:color-mix(in srgb,var(--bm-surface) 92%,transparent);box-shadow:var(--bm-shadow);backdrop-filter:blur(16px);}
.bm-m3-brand{font-weight:750;letter-spacing:.01em;margin-right:auto}.bm-m3-subtitle{font-size:12px;opacity:.7}.bm-m3-icon{border:0;background:transparent;color:inherit;border-radius:50%;width:40px;height:40px;cursor:pointer;font-size:20px}.bm-m3-icon:hover,.bm-m3-icon:focus-visible{background:var(--bm-surface-container);outline:2px solid var(--bm-primary);outline-offset:2px}
.bm-m3-search{width:min(28vw,260px);border:1px solid var(--bm-outline);border-radius:24px;padding:10px 14px;background:transparent;color:inherit}.bm-m3-search:focus{outline:2px solid var(--bm-primary);border-color:transparent}
.bm-m3-menu{position:fixed;z-index:40;min-width:220px;padding:8px;border-radius:16px;background:var(--bm-surface);box-shadow:var(--bm-shadow);border:1px solid color-mix(in srgb,var(--bm-outline) 35%,transparent)}.bm-m3-menu[hidden],.bm-m3-settings[hidden]{display:none}.bm-m3-menu button,.bm-m3-settings button{display:block;width:100%;border:0;background:transparent;color:inherit;text-align:left;padding:11px 12px;border-radius:10px;cursor:pointer}.bm-m3-menu button:hover,.bm-m3-menu button:focus-visible,.bm-m3-settings button:hover{background:var(--bm-surface-container);outline:0}
.bm-m3-settings{position:fixed;z-index:41;right:18px;top:72px;width:min(340px,calc(100vw - 36px));padding:16px;border-radius:20px;background:var(--bm-surface);box-shadow:var(--bm-shadow);border:1px solid color-mix(in srgb,var(--bm-outline) 35%,transparent)}.bm-m3-settings h2{font-size:18px;margin:0 0 12px}.bm-m3-setting{display:grid;gap:6px;margin:12px 0}.bm-m3-setting select,.bm-m3-setting input[type=range]{width:100%}.bm-m3-setting select{padding:9px;border-radius:10px;border:1px solid var(--bm-outline);background:var(--bm-surface);color:inherit}
.bm-m3-pin{position:fixed;z-index:25;transform:translate(-50%,-100%);padding:7px 10px;border-radius:12px;background:var(--bm-primary);color:var(--bm-on-primary);box-shadow:var(--bm-shadow);font-size:12px;pointer-events:none}.bm-m3-pin::after{content:"";position:absolute;left:50%;bottom:-7px;border:7px solid transparent;border-top-color:var(--bm-primary);border-bottom:0;transform:translateX(-50%)}
.bm-m3-toast{position:fixed;z-index:50;left:18px;bottom:18px;max-width:min(420px,calc(100vw - 36px));padding:12px 16px;border-radius:14px;background:var(--bm-surface-container);box-shadow:var(--bm-shadow);}
@media(max-width:680px){.bm-m3-appbar{inset:8px 8px auto 8px;padding:8px 10px}.bm-m3-subtitle{display:none}.bm-m3-search{width:38px;padding:10px;font-size:0}.bm-m3-search:focus,.bm-m3-search:has(+*){font-size:14px;width:42vw}}
`;

export class MaterialShell {
    readonly root: HTMLElement;
    private readonly menu: HTMLDivElement;
    private readonly settings: HTMLDivElement;
    private readonly pinsLayer: HTMLDivElement;
    private pins: Pin[] = [];
    private pinCounter = 0;
    private toastTimer: number | undefined;

    constructor(root: Element) {
        this.root = root as HTMLElement;
        this.root.classList.add("bm-m3-shell");
        if (!document.getElementById("bm-m3-style")) {
            const style = document.createElement("style");
            style.id = "bm-m3-style";
            style.textContent = STYLE;
            document.head.appendChild(style);
        }
        this.pins = this.readPins();
        const bar = document.createElement("header");
        bar.className = "bm-m3-appbar";
        bar.innerHTML = `<div><div class="bm-m3-brand">BlueMap</div><div class="bm-m3-subtitle">Material map server</div></div><input class="bm-m3-search" type="search" aria-label="Search map controls" placeholder="Search controls…"><button class="bm-m3-icon" type="button" aria-label="Open settings">⚙</button><button class="bm-m3-icon" type="button" aria-label="Open command palette" title="Ctrl+Shift+F">⌘</button>`;
        this.root.appendChild(bar);
        const settingsButton = bar.querySelector("button")!;
        settingsButton.addEventListener("click", () => (this.settings.hidden = !this.settings.hidden));
        bar.querySelectorAll("button")[1]!.addEventListener("click", () => this.showToast("Command palette: search, settings, pins, and map controls"));
        bar.querySelector("input")!.addEventListener("input", (event) => {
            const value = (event.target as HTMLInputElement).value.trim();
            if (value) this.showToast(`Search is ready for “${value}”. Use the map or open settings.`);
        });

        this.menu = document.createElement("div");
        this.menu.className = "bm-m3-menu";
        this.menu.hidden = true;
        this.menu.innerHTML = `<button type="button" data-action="pin">📍 Add pinpoint here</button><button type="button" data-action="copy">Copy coordinates</button><button type="button" data-action="cancel">Cancel</button>`;
        this.root.appendChild(this.menu);
        this.menu.addEventListener("click", (event) => this.handleMenuClick(event));

        this.settings = document.createElement("div");
        this.settings.className = "bm-m3-settings";
        this.settings.hidden = true;
        this.settings.innerHTML = `<h2>Map appearance</h2><div class="bm-m3-setting"><label for="bm-theme">Theme</label><select id="bm-theme"><option value="light">Light</option><option value="dark">Dark</option></select></div><div class="bm-m3-setting"><label for="bm-density">Density</label><input id="bm-density" type="range" min="1" max="5" value="3"><small>Controls spacing without changing map data.</small></div><div class="bm-m3-setting"><label for="bm-funny">Message style</label><input id="bm-funny" type="range" min="1" max="5" value="2"><small>Styles notifications only; facts stay exact.</small></div>`;
        this.root.appendChild(this.settings);
        this.settings.querySelector("select")!.addEventListener("change", (event) => this.setTheme((event.target as HTMLSelectElement).value));
        this.settings.querySelector("input#bm-density")!.addEventListener("input", (event) => this.root.dataset.density = (event.target as HTMLInputElement).value);
        this.settings.querySelector("input#bm-funny")!.addEventListener("input", (event) => localStorage.setItem("bluemap-funny-level-en", (event.target as HTMLInputElement).value));

        this.pinsLayer = document.createElement("div");
        this.pinsLayer.setAttribute("aria-label", "Saved pinpoints");
        this.root.appendChild(this.pinsLayer);
        this.renderPins();
        this.setTheme(localStorage.getItem("bluemap-theme") || "light");
        document.addEventListener("click", this.dismiss);
    }

    private readonly dismiss = (event: MouseEvent): void => {
        if (!this.menu.contains(event.target as Node)) this.menu.hidden = true;
    };

    openContextMenu(detail: MapInteractionEventDetail, screenX: number, screenY: number): void {
        const point = detail.hit?.point;
        if (!point) {
            this.showToast("No terrain at that point; move over a loaded map tile first.");
            return;
        }
        this.menu.dataset.x = String(point.x);
        this.menu.dataset.y = String(point.y);
        this.menu.dataset.z = String(point.z);
        this.menu.style.left = `${Math.min(screenX, window.innerWidth - 240)}px`;
        this.menu.style.top = `${Math.min(screenY, window.innerHeight - 160)}px`;
        this.menu.hidden = false;
    }

    private handleMenuClick(event: Event): void {
        const action = (event.target as HTMLElement).dataset.action;
        if (action === "cancel") this.menu.hidden = true;
        if (action === "copy") {
            const coords = `${this.menu.dataset.x}, ${this.menu.dataset.y}, ${this.menu.dataset.z}`;
            void navigator.clipboard?.writeText(coords);
            this.showToast(`Coordinates copied: ${coords}`);
            this.menu.hidden = true;
        }
        if (action === "pin") {
            const pin: Pin = { id: `pin-${++this.pinCounter}`, x: Number(this.menu.dataset.x), y: Number(this.menu.dataset.y), z: Number(this.menu.dataset.z), label: `Pinpoint ${this.pinCounter}`, screenX: Number(this.menu.style.left.replace("px", "")), screenY: Number(this.menu.style.top.replace("px", "")) };
            this.pins.push(pin);
            this.writePins();
            this.showToast(`${pin.label} saved at ${pin.x.toFixed(0)}, ${pin.y.toFixed(0)}, ${pin.z.toFixed(0)}.`);
            this.menu.hidden = true;
        }
    }

    private renderPins(): void {
        this.pinsLayer.replaceChildren(...this.pins.map((pin) => { const el = document.createElement("div"); el.className = "bm-m3-pin"; el.textContent = `${pin.label} · ${pin.x.toFixed(0)}, ${pin.y.toFixed(0)}, ${pin.z.toFixed(0)}`; el.dataset.x = String(pin.x); el.dataset.z = String(pin.z); if (pin.screenX !== undefined && pin.screenY !== undefined) { el.style.left = `${pin.screenX}px`; el.style.top = `${pin.screenY}px`; } else el.hidden = true; return el; }));
    }

    private readPins(): Pin[] { try { return JSON.parse(localStorage.getItem("bluemap-pinpoints") || "[]") as Pin[]; } catch { return []; } }
    private writePins(): void { localStorage.setItem("bluemap-pinpoints", JSON.stringify(this.pins)); this.renderPins(); }
    private setTheme(theme: string): void { this.root.dataset.theme = theme; localStorage.setItem("bluemap-theme", theme); }
    private showToast(message: string): void { let toast = this.root.querySelector<HTMLDivElement>(".bm-m3-toast"); if (!toast) { toast = document.createElement("div"); toast.className = "bm-m3-toast"; this.root.appendChild(toast); } toast.textContent = message; window.clearTimeout(this.toastTimer); this.toastTimer = window.setTimeout(() => toast?.remove(), 4200); }
}
