import { Marker } from "./markers/Marker";
import { CSS2DObject } from "./util/CSS2DRenderer";
import { animate, htmlToElement } from "./util/Utils";
import type { Animation } from "./util/Utils";
import { BoxGeometry, MeshBasicMaterial, Mesh, Vector2 } from "three";
import type { BufferGeometry, Intersection, Vector3 } from "three";
import { i18n } from "./util/i18n";
import { sanitizeHtml } from "./util/sanitize";
import type { MapInteractionEventDetail } from "./MapViewer";
import type { MarkerClickEvent } from "./markers/ObjectMarker";

export interface PopupMarkerAppState {
    debug: boolean;
}

export class PopupMarker extends Marker {
    appState: PopupMarkerAppState;
    events: EventTarget;

    elementObject: CSS2DObject;
    cube: Mesh;

    animation: Animation | null;

    constructor(id: string, appState: PopupMarkerAppState, events: EventTarget) {
        super(id);

        this.data.type = "popup";
        (this.data as { label?: string }).label = "Last Map Interaction";
        this.data.listed = false;

        this.appState = appState;
        this.events = events;
        this.visible = false;

        this.elementObject = new CSS2DObject(
            htmlToElement(
                `<div id="bm-marker-${this.data.id}" class="bm-marker-${this.data.type}">Test</div>`,
            ),
        );
        this.elementObject.position.set(0.5, 1, 0.5);
        this.elementObject.disableDepthTest = true;
        this.addEventListener("removed", () => {
            if (this.element.parentNode) this.element.parentNode.removeChild(this.element);
        });

        const cubeGeo = new BoxGeometry(1.01, 1.01, 1.01).translate(0.5, 0.5, 0.5);
        const cubeMaterial = new MeshBasicMaterial({
            color: 0xffffff,
            opacity: 0.5,
            transparent: true,
        });
        this.cube = new Mesh(cubeGeo, cubeMaterial);
        this.cube.onClick = (evt) => this.onClick(evt);

        this.add(this.elementObject);
        this.add(this.cube);

        this.animation = null;

        this.events.addEventListener("bluemapMapInteraction", (evt) =>
            window.setTimeout(() => this.onMapInteraction(evt)),
        );

        window.addEventListener("mousedown", this.removeHandler);
        window.addEventListener("touchstart", this.removeHandler, { passive: true });
        window.addEventListener("keydown", this.removeHandler);
        window.addEventListener("mousewheel", this.removeHandler);
    }

    override onClick(_event: MarkerClickEvent): boolean {
        return true;
    }

    static copyToClipboard = (text: string): void => {
        if (navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(text).catch((e) => console.error(e));
        } else {
            function listener(e: ClipboardEvent) {
                e.clipboardData!.setData("text/plain", text);
                e.preventDefault();
            }
            document.addEventListener("copy", listener);
            document.execCommand("copy");
            document.removeEventListener("copy", listener);
        }
    };
    static blockClipboardFormat = (pos: Vector3, isHires: boolean): string =>
        isHires ? `${pos.x} ${pos.y} ${pos.z}` : `${pos.x} ${pos.z}`;
    static chunkClipboardFormat = (pos: Vector3, isHires: boolean): string =>
        isHires ? `${pos.x} ${pos.y} ${pos.z}` : `${pos.x} ${pos.z}`;
    static regionClipboardFormat = (pos: Vector2): string => `r.${pos.x}.${pos.y}.mca`;

    /**
     * Security deviation: upstream builds this popup's HTML as one string with inline
     * onclick-attributes calling the global window.BlueMap. This port builds the same DOM
     * structure element-by-element, attaches "click"-listeners instead of inline handlers,
     * and sanitizes all server-provided strings (translations from the lang-files) before
     * inserting them as HTML.
     */

    /**
     * <button class="group" data-tooltip="..." (click -> copy-to-clipboard)> or, for a
     * clipboardText of null, a plain <div class="group"> with no tooltip and no handler.
     *
     * Design deviation: a group that copies to the clipboard is a control, so it is a real
     * <button> rather than upstream's click-handled <div>. That is what makes it focusable,
     * operable with Enter and Space, and announced as a button. The class name, the
     * data-tooltip attribute and the children are unchanged.
     */
    private createGroup(clipboardText: string | null): HTMLElement {
        if (clipboardText === null) {
            const group = document.createElement("div");
            group.className = "group";
            return group;
        }

        const group = document.createElement("button");
        group.type = "button";
        group.className = "group";

        const tooltip = i18n.t("blockTooltip.clipboard");
        group.setAttribute("data-tooltip", tooltip);
        group.addEventListener("click", () => PopupMarker.copyToClipboard(clipboardText));

        // The visible hint is drawn from data-tooltip by a CSS ::before, and generated
        // content is not exposed to assistive technology. The same words go into the
        // button's accessible name, ahead of the coordinates it will copy.
        const hint = document.createElement("span");
        hint.className = "bm-sr-only";
        hint.textContent = tooltip;
        group.appendChild(hint);

        return group;
    }

    /** <div class="label">...</div> */
    private createLabel(labelHtml: string): HTMLDivElement {
        const label = document.createElement("div");
        label.className = "label";
        label.innerHTML = sanitizeHtml(labelHtml);
        return label;
    }

    /** <div class="entry"><span class="label">...</span><span class="value">...</span></div> */
    private createEntry(labelHtml: string, value: unknown): HTMLDivElement {
        const entry = document.createElement("div");
        entry.className = "entry";
        const label = document.createElement("span");
        label.className = "label";
        label.innerHTML = sanitizeHtml(labelHtml);
        const val = document.createElement("span");
        val.className = "value";
        val.textContent = `${value}`;
        entry.append(label, val);
        return entry;
    }

    /** <div class="content">...entries</div> */
    private createContent(...entries: HTMLElement[]): HTMLDivElement {
        const content = document.createElement("div");
        content.className = "content";
        content.append(...entries);
        return content;
    }

    onMapInteraction = (evt: Event): void => {
        const detail = (evt as CustomEvent<MapInteractionEventDetail>).detail;

        let isHires = true;
        let int: Intersection | null | undefined = detail.hiresHit;

        if (detail.lowresHits) {
            for (let i = 0; i < detail.lowresHits.length; i++) {
                if (!int) {
                    isHires = false;
                    int = detail.lowresHits[i];
                } else break;
            }
        }

        if (!int) return;

        this.position
            .copy((int as Intersection & { pointOnLine?: Vector3 }).pointOnLine || int.point)
            .add(detail.ray.direction.clone().multiplyScalar(0.05))
            .floor();

        //this.elementObject.position
        //.copy(evt.detail.intersection.pointOnLine || evt.detail.intersection.point)
        //.sub(this.position);

        this.element.innerHTML = "";

        if (isHires) {
            const group = this.createGroup(PopupMarker.blockClipboardFormat(this.position, true));
            group.append(
                this.createLabel(`${i18n.t("blockTooltip.block")}:`),
                this.createContent(
                    this.createEntry("x: ", this.position.x),
                    this.createEntry("y: ", this.position.y),
                    this.createEntry("z: ", this.position.z),
                ),
            );
            this.element.appendChild(group);
        } else {
            const group = this.createGroup(PopupMarker.blockClipboardFormat(this.position, false));
            group.append(
                this.createLabel(`${i18n.t("blockTooltip.position")}:`),
                this.createContent(
                    this.createEntry("x: ", this.position.x),
                    this.createEntry("z: ", this.position.z),
                ),
            );
            this.element.appendChild(group);
        }

        if (this.appState.debug) {
            const chunkCoords = this.position.clone().divideScalar(16).floor();
            const regionCoords = new Vector2(this.position.x, this.position.z)
                .divideScalar(512)
                .floor();
            const regionFile = `r.${regionCoords.x}.${regionCoords.y}.mca`;

            if (isHires) {
                const group = this.createGroup(PopupMarker.chunkClipboardFormat(chunkCoords, true));
                group.append(
                    this.createLabel(`${i18n.t("blockTooltip.chunk")}:`),
                    this.createContent(
                        this.createEntry("x: ", chunkCoords.x),
                        this.createEntry("y: ", chunkCoords.y),
                        this.createEntry("z: ", chunkCoords.z),
                    ),
                );
                this.element.append(document.createElement("hr"), group);
            } else {
                const group = this.createGroup(
                    PopupMarker.chunkClipboardFormat(chunkCoords, false),
                );
                group.append(
                    this.createLabel(`${i18n.t("blockTooltip.chunk")}:`),
                    this.createContent(
                        this.createEntry("x: ", chunkCoords.x),
                        this.createEntry("z: ", chunkCoords.z),
                    ),
                );
                this.element.append(document.createElement("hr"), group);
            }

            const regionGroup = this.createGroup(PopupMarker.regionClipboardFormat(regionCoords));
            regionGroup.append(
                this.createLabel(`${i18n.t("blockTooltip.region.region")}:`),
                this.createContent(
                    this.createEntry("x: ", regionCoords.x),
                    this.createEntry("z: ", regionCoords.y),
                ),
                this.createContent(
                    this.createEntry(`${i18n.t("blockTooltip.region.file")}: `, regionFile),
                ),
            );
            this.element.append(document.createElement("hr"), regionGroup);
        }

        if (this.appState.debug) {
            const faceIndex = int.faceIndex!;
            const attributes = ((int.object as Mesh).geometry as BufferGeometry).attributes;
            if (attributes.sunlight && attributes.blocklight) {
                const sunlight = attributes.sunlight.array[faceIndex * 3];
                const blocklight = attributes.blocklight.array[faceIndex * 3];

                const group = this.createGroup(null);
                group.append(
                    this.createLabel(`${i18n.t("blockTooltip.light.light")}:`),
                    this.createContent(
                        this.createEntry(`${i18n.t("blockTooltip.light.sun")}: `, sunlight),
                        this.createEntry(`${i18n.t("blockTooltip.light.block")}: `, blocklight),
                    ),
                );
                this.element.append(document.createElement("hr"), group);
            }
        }

        if (this.appState.debug) {
            const files = document.createElement("div");
            files.className = "files";

            if (isHires) {
                const hrPath = (
                    detail.hiresHit?.object?.userData as { tileUrl?: string } | undefined
                )?.tileUrl;
                const pathElement = document.createElement("div");
                pathElement.textContent = `${hrPath}`;
                files.appendChild(pathElement);
            }

            if (detail.lowresHits) {
                for (let i = 0; i < detail.lowresHits.length; i++) {
                    const lrPath = (
                        detail.lowresHits[i]?.object?.userData as { tileUrl?: string } | undefined
                    )?.tileUrl;
                    if (lrPath) {
                        const pathElement = document.createElement("div");
                        pathElement.textContent = lrPath;
                        files.appendChild(pathElement);
                    }
                }
            }

            this.element.append(document.createElement("hr"), files);
        }

        if (this.appState.debug) {
            console.debug("Clicked Position Data:", detail);
        }

        this.open();
    };

    open(): void {
        if (this.animation) this.animation.cancel();

        this.visible = true;
        this.cube.visible = true;

        const targetOpacity = 1;

        this.element.style.opacity = "0";
        this.animation = animate((progress) => {
            this.element.style.opacity = (progress * targetOpacity).toString();
        }, PopupMarker.fadeDurationMs());
    }

    removeHandler = (evt: Event): void => {
        if (evt.composedPath().includes(this.element)) return;
        if (Marker.isFocusNavigationEvent(evt)) return;
        this.close();
    };

    close(): void {
        if (this.animation) this.animation.cancel();

        this.cube.visible = false;

        const startOpacity = parseFloat(this.element.style.opacity);
        this.animation = animate(
            (progress) => {
                this.element.style.opacity = (startOpacity - progress * startOpacity).toString();
            },
            PopupMarker.fadeDurationMs(),
            (finished) => {
                if (finished) this.visible = false;
            },
        );
    }

    /**
     * The popup's fade, in milliseconds. A reduced-motion preference collapses it to zero,
     * which `animate` handles as a single synchronous frame at full progress, so the popup
     * still appears and still disappears - it just does not travel to get there.
     */
    private static fadeDurationMs(): number {
        return Marker.prefersReducedMotion() ? 0 : 300;
    }

    get element(): HTMLDivElement {
        return this.elementObject.element.getElementsByTagName("div")[0]!;
    }

    override dispose(): void {
        super.dispose();

        if (this.element.parentNode) this.element.parentNode.removeChild(this.element);
    }
}
