import type { IconType } from "./icons";
/**
 * The `<media-icon>` component dynamically loads and renders our icons. See our
 * [media icons catalog](https://www.vidstack.io/media-icons) to preview them all. Do note, the
 * icon `type` can be dynamically changed.
 *
 * @example
 * ```html
 * <media-icon type="play"></media-icon>
 * <media-icon type="pause"></media-icon>
 * ```
 */
export declare class MediaIconElement extends HTMLElement {
    static tagName: string;
    static get observedAttributes(): string[];
    private _svg;
    private _type;
    /**
     * The type of icon. You can find a complete and searchable list on our website - see our
     * [media icons catalog](https://www.vidstack.io/media-icons?lib=html).
     */
    get type(): IconType | null;
    set type(type: IconType | null);
    attributeChangedCallback(name: string, _: unknown, newValue: string | null): void;
    connectedCallback(): void;
    private _createSVG;
    private _loadIcon;
    private _onTypeChange;
    private _onPathsChange;
}
declare global {
    interface HTMLElementTagNameMap {
        "media-icon": MediaIconElement;
    }
}
