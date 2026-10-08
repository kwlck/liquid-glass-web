import { displacementMap } from './geometry.js';

const SVG = 'http://www.w3.org/2000/svg';
const instances = new WeakMap();
let nextId = 0;
export const defaults = Object.freeze({ refraction: 100, blur: 0, light: 22, radius: 24, shape: 'rounded', mode: 'auto', pointer: true, resolution: 1 });

function optionsFrom(current, changes) {
  const value = { ...current, ...changes };
  for (const key of ['refraction', 'blur', 'light', 'radius', 'resolution']) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) throw new TypeError(`${key} must be a finite number`);
  }
  if (!['rounded', 'pill', 'ellipse'].includes(value.shape)) throw new TypeError('shape must be rounded, pill or ellipse');
  if (!['auto', 'svg', 'css'].includes(value.mode)) throw new TypeError('mode must be auto, svg or css');
  if (typeof value.pointer !== 'boolean') throw new TypeError('pointer must be a boolean');
  value.refraction = Math.max(0, Math.min(100, value.refraction));
  value.blur = Math.max(0, Math.min(40, value.blur));
  value.light = Math.max(0, Math.min(100, value.light));
  value.radius = Math.max(0, value.radius);
  value.resolution = Math.max(0.25, Math.min(2, value.resolution));
  return Object.freeze(value);
}

function svgElement(document, tag, attributes = {}) {
  const element = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  return element;
}

/** Attach to an existing card, button or navigation element. No image required. */
export function createLiquidGlass(target, options = {}) {
  const element = typeof target === 'string' ? document.querySelector(target) : target;
  if (!element || element.nodeType !== 1) throw new TypeError('Target must be an existing HTML element');
  if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml') throw new TypeError('Target must be an HTML element');
  if (/^(AREA|BASE|BR|COL|EMBED|HR|IMG|INPUT|LINK|META|PARAM|SOURCE|TRACK|WBR|SELECT|TEXTAREA|TABLE|TR|THEAD|TBODY|TFOOT)$/.test(element.tagName)) throw new TypeError('Target must be a container such as a div, article, nav or button');
  if (instances.has(element)) return instances.get(element).update(options);
  const instance = new LiquidGlass(element, options);
  instances.set(element, instance);
  return instance;
}

class LiquidGlass {
  constructor(element, options) {
    this.element = element;
    this.options = optionsFrom(defaults, options);
    this.document = element.ownerDocument;
    this.window = this.document.defaultView;
    this.destroyed = false;
    this.frame = 0;
    this.pointerFrame = 0;
    this.savedStyles = new Map();
    this.hadClass = element.classList.contains('lg-host');
    this.savedRenderer = element.getAttribute('data-lg-renderer');
    this.layer = this.document.createElement('span');
    this.sheen = this.document.createElement('span');
    this.layer.className = 'lg-layer';
    this.sheen.className = 'lg-sheen';
    this.layer.setAttribute('aria-hidden', 'true');
    this.sheen.setAttribute('aria-hidden', 'true');
    // Avoid wrapping or moving content, preserving listeners and focus order.
    element.prepend(this.layer);
    element.append(this.sheen);
    element.classList.add('lg-host');
    const computed = this.window.getComputedStyle(element);
    if (computed.position === 'static') this.setStyle('position', 'relative');
    if (computed.zIndex === 'auto') this.setStyle('z-index', '0');

    this.id = `liquid-glass-${++nextId}`;
    this.svg = svgElement(this.document, 'svg', { 'aria-hidden': 'true', width: 0, height: 0 });
    this.svg.style.cssText = 'position:absolute;pointer-events:none;overflow:hidden;';
    this.filter = svgElement(this.document, 'filter', { id: this.id, filterUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' });
    this.image = svgElement(this.document, 'feImage', { result: 'map', preserveAspectRatio: 'none' });
    this.displacement = svgElement(this.document, 'feDisplacementMap', { in: 'SourceGraphic', in2: 'map', xChannelSelector: 'R', yChannelSelector: 'G', result: 'refracted' });
    this.blur = svgElement(this.document, 'feGaussianBlur', { in: 'refracted', stdDeviation: 0 });
    this.filter.append(this.image, this.displacement, this.blur);
    const defs = svgElement(this.document, 'defs');
    defs.append(this.filter);
    this.svg.append(defs);
    // Keep references in the same document/root as the surface.
    const root = element.getRootNode();
    (root.nodeType === 11 ? root : this.document.body).append(this.svg);
    this.canvas = this.document.createElement('canvas');
    this.onPointer = (event) => {
      if (!this.options.pointer || this.window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const rect = element.getBoundingClientRect();
      this.pointer = { x: (event.clientX - rect.left) / (rect.width || 1) * 100, y: (event.clientY - rect.top) / (rect.height || 1) * 100 };
      if (!this.pointerFrame) this.pointerFrame = this.window.requestAnimationFrame(() => {
        this.pointerFrame = 0;
        this.setStyle('--lg-pointer-x', `${this.pointer.x}%`);
        this.setStyle('--lg-pointer-y', `${this.pointer.y}%`);
      });
    };
    element.addEventListener('pointermove', this.onPointer, { passive: true });
    this.onResize = () => this.refresh();
    if (this.window.ResizeObserver) {
      this.observer = new this.window.ResizeObserver(this.onResize);
      this.observer.observe(element);
    } else this.window.addEventListener('resize', this.onResize);
    this.applyOptions();
    this.refresh();
  }

  setStyle(name, value) {
    if (!this.savedStyles.has(name)) this.savedStyles.set(name, { value: this.element.style.getPropertyValue(name), priority: this.element.style.getPropertyPriority(name) });
    this.element.style.setProperty(name, value);
  }

  get renderer() { return this.element.getAttribute('data-lg-renderer'); }

  applyOptions() {
    const options = this.options;
    // CSS.supports(url(...)) only checks syntax, not actual rendering. Auto
    // conservatively enables the SVG backdrop path on desktop/Android Blink.
    const ua = this.window.navigator.userAgent;
    const blink = /Chrome|Chromium|Edg\//.test(ua) && !/iPhone|iPad|iPod/.test(ua);
    const renderer = options.mode === 'svg' || (options.mode === 'auto' && blink) ? 'svg' : 'css';
    this.element.setAttribute('data-lg-renderer', renderer);
    this.setStyle('--lg-filter', `url("#${this.id}")`);
    this.setStyle('--lg-blur', `${options.blur}px`);
    this.setStyle('--lg-light', String(options.light / 100));
    this.displacement.setAttribute('scale', String(options.refraction / 100 * 86));
    this.blur.setAttribute('stdDeviation', String(options.blur / 2));
    if (!options.pointer) {
      this.window.cancelAnimationFrame(this.pointerFrame);
      this.pointerFrame = 0;
      this.setStyle('--lg-pointer-x', '25%');
      this.setStyle('--lg-pointer-y', '10%');
    }
  }

  update(changes = {}) {
    if (this.destroyed) throw new Error('This glass instance has been destroyed');
    const before = this.options;
    this.options = optionsFrom(before, changes);
    this.applyOptions();
    if (before.radius !== this.options.radius || before.shape !== this.options.shape || before.resolution !== this.options.resolution || before.mode !== this.options.mode) this.refresh();
    return this;
  }

  refresh() {
    if (this.destroyed || this.frame) return this;
    this.frame = this.window.requestAnimationFrame(() => {
      this.frame = 0;
      const width = this.element.offsetWidth;
      const height = this.element.offsetHeight;
      if (!width || !height) return; // ResizeObserver wakes hidden elements later.
      const { shape, radius, resolution } = this.options;
      this.setStyle('--lg-radius', shape === 'ellipse' ? '50%' : `${shape === 'pill' ? Math.min(width, height) / 2 : Math.min(radius, width / 2, height / 2)}px`);
      if (this.renderer === 'css') return;
      // Bound memory/cost for large panels. Never allocate a viewport-sized map.
      const density = Math.min(resolution, 1024 / width, 1024 / height);
      const map = displacementMap(width, height, radius, shape, density);
      this.canvas.width = map.width;
      this.canvas.height = map.height;
      const context = this.canvas.getContext('2d');
      if (!context) { this.element.setAttribute('data-lg-renderer', 'css'); return; }
      const data = context.createImageData(map.width, map.height);
      data.data.set(map.pixels);
      context.putImageData(data, 0, 0);
      for (const node of [this.filter, this.image]) {
        node.setAttribute('x', '0'); node.setAttribute('y', '0');
        node.setAttribute('width', String(width)); node.setAttribute('height', String(height));
      }
      this.image.setAttribute('href', this.canvas.toDataURL());
    });
    return this;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.window.cancelAnimationFrame(this.frame);
    this.window.cancelAnimationFrame(this.pointerFrame);
    this.observer?.disconnect();
    this.window.removeEventListener('resize', this.onResize);
    this.element.removeEventListener('pointermove', this.onPointer);
    this.layer.remove(); this.sheen.remove(); this.svg.remove();
    for (const [name, saved] of this.savedStyles) {
      if (saved.value) this.element.style.setProperty(name, saved.value, saved.priority);
      else this.element.style.removeProperty(name);
    }
    if (!this.hadClass) this.element.classList.remove('lg-host');
    if (this.savedRenderer === null) this.element.removeAttribute('data-lg-renderer');
    else this.element.setAttribute('data-lg-renderer', this.savedRenderer);
    instances.delete(this.element);
  }
}
