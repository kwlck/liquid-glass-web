import { createLiquidGlass } from '../src/liquid-glass.js';
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
document.querySelector('#run').addEventListener('click', async () => {
  const results = [];
  const instances = [];
  const fixture = document.querySelector('#fixture');
  const check = (condition, description) => { if (!condition) throw new Error(description); results.push('PASS ' + description); };
  fixture.replaceChildren();
  try {
    const card = document.createElement('article');
    const action = document.createElement('button');
    action.textContent = 'Native button'; card.append(action); fixture.append(card);
    card.style.setProperty('--lg-light', '.8');
    card.style.position = 'relative'; card.style.zIndex = '4';
    const before = card.getAttribute('style');
    let clicks = 0; action.addEventListener('click', () => clicks++);
    const glass = createLiquidGlass(card); instances.push(glass);
    await nextFrame();
    check(glass.options.refraction === 100 && glass.options.blur === 0 && glass.options.light === 22, 'Material defaults are 100 / 0 / 22');
    check(card.querySelectorAll('.lg-layer').length === 1, 'One backdrop layer per instance');
    check(card.style.getPropertyValue('--lg-radius') === '24px', 'Default radius follows the actual element');
    action.click(); check(clicks === 1 && action.parentNode === card, 'Native children and event handlers are preserved');
    check(createLiquidGlass(card, { light: 40 }) === glass && card.querySelectorAll('.lg-layer').length === 1, 'Repeated mount updates the same instance');
    const other = document.createElement('article'); other.textContent = 'Second surface'; fixture.append(other);
    const second = createLiquidGlass(other, { shape: 'ellipse' }); instances.push(second);
    await nextFrame();
    check(card.style.getPropertyValue('--lg-filter') !== other.style.getPropertyValue('--lg-filter'), 'Multiple instances have unique SVG filters');
    check(other.style.getPropertyValue('--lg-radius') === '50%', 'Ellipse receives matching CSS geometry');
    let invalid = false; try { glass.update({ radius: NaN }); } catch { invalid = true; }
    check(invalid && glass.options.radius === 24, 'Invalid updates are rejected without changing options');
    card.style.width = '120px'; glass.update({ radius: 999 }); await nextFrame();
    const expected = Math.min(999, card.offsetWidth / 2, card.offsetHeight / 2) + 'px';
    check(card.style.getPropertyValue('--lg-radius') === expected, 'Resizing clamps radius to the new element size');
    glass.update({ mode: 'css', blur: 8 }); await nextFrame();
    check(glass.renderer === 'css' && card.style.getPropertyValue('--lg-blur') === '8px', 'CSS fallback is explicitly selectable');
    glass.update({ mode: 'svg', shape: 'pill' }); await nextFrame();
    check(glass.renderer === 'svg' && document.querySelector('feImage').getAttribute('href').startsWith('data:image/png'), 'SVG mode generates a displacement texture');
    glass.destroy(); glass.destroy();
    card.style.removeProperty('width');
    check(card.getAttribute('style') === before && !card.hasAttribute('data-lg-renderer') && !card.classList.contains('lg-host'), 'Destroy restores prior styles, classes and attributes');
    check(card.childNodes.length === 1 && card.firstChild === action, 'Destroy preserves original content');
    let destroyed = false; try { glass.update({ light: 2 }); } catch { destroyed = true; }
    check(destroyed, 'Updating a destroyed instance fails clearly');
    const remounted = createLiquidGlass(card); instances.push(remounted);
    check(remounted !== glass, 'A destroyed element can be mounted again');
    second.destroy(); remounted.destroy();
    check(document.querySelectorAll('filter[id^="liquid-glass-"]').length === 0, 'All filter resources are released');
    let rejected = false; try { createLiquidGlass(document.createElement('input')); } catch { rejected = true; }
    check(rejected, 'Unsupported void elements are rejected');
    results.push('\nAll browser integration checks passed.');
  } catch (error) { results.push('FAIL ' + error.message); }
  finally { instances.forEach((instance) => instance.destroy()); }
  document.querySelector('#result').textContent = results.join('\n');
});
