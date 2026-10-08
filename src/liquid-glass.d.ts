export interface LiquidGlassOptions {
  /** 0–100, default 100. SVG renderer only. */
  refraction?: number;
  /** 0–40 CSS pixels, default 0. */
  blur?: number;
  /** 0–100, default 22. */
  light?: number;
  /** Corner radius in CSS pixels, default 24. */
  radius?: number;
  shape?: 'rounded' | 'pill' | 'ellipse';
  /** auto chooses SVG on Blink and CSS elsewhere. */
  mode?: 'auto' | 'svg' | 'css';
  pointer?: boolean;
  /** Map pixels per CSS pixel (0.25–2), default 1. */
  resolution?: number;
}
export interface LiquidGlassInstance {
  readonly element: HTMLElement;
  readonly renderer: 'svg' | 'css';
  readonly options: Readonly<Required<LiquidGlassOptions>>;
  update(options?: LiquidGlassOptions): this;
  refresh(): this;
  destroy(): void;
}
export const defaults: Readonly<Required<LiquidGlassOptions>>;
export function createLiquidGlass(target: string | HTMLElement, options?: LiquidGlassOptions): LiquidGlassInstance;
