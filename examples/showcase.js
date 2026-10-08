import { createLiquidGlass } from '../src/liquid-glass.js';

const $ = (selector) => document.querySelector(selector);
const card = createLiquidGlass('#glass-card', { radius: 32 });
createLiquidGlass('#glass-nav', { shape: 'pill' });
createLiquidGlass('#glass-pill', { shape: 'pill' });
createLiquidGlass('#glass-orb', { shape: 'ellipse' });

function rendererLabel() {
  $('#renderer').textContent = card.renderer === 'svg' ? 'Renderer: SVG · live backdrop refraction' : 'Renderer: CSS · translucent fallback';
  $('#refraction').disabled = card.renderer === 'css';
  $('#radius').disabled = $('#shape').value !== 'rounded';
}
for (const name of ['radius', 'refraction', 'blur', 'light']) {
  $(`#${name}`).addEventListener('input', (event) => {
    const value = Number(event.target.value);
    card.update({ [name]: value });
    $(`#${name}-value`).textContent = value + (name === 'radius' || name === 'blur' ? ' px' : '%');
  });
}
$('#shape').addEventListener('change', (event) => { card.update({ shape: event.target.value }); rendererLabel(); });
$('#fallback').addEventListener('change', (event) => { card.update({ mode: event.target.checked ? 'css' : 'auto' }); rendererLabel(); });
let compact = false;
$('#resize').addEventListener('click', () => { compact = !compact; $('#glass-card').style.width = compact ? '230px' : ''; });
$('#reset').addEventListener('click', () => {
  card.update({ refraction: 100, blur: 0, light: 22, radius: 32, shape: 'rounded', mode: 'auto' });
  for (const [name, value] of Object.entries({ refraction: 100, blur: 0, light: 22, radius: 32 })) {
    $(`#${name}`).value = value;
    $(`#${name}-value`).textContent = value + (name === 'radius' || name === 'blur' ? ' px' : '%');
  }
  $('#shape').value = 'rounded'; $('#fallback').checked = false;
  compact = false; $('#glass-card').style.width = '';
  rendererLabel();
});
let clicks = 0;
for (const id of ['card-action', 'nav-action', 'glass-pill']) {
  $(`#${id}`).addEventListener('click', () => { $('#feedback').textContent = `Still a real button. Clicked ${++clicks} time${clicks === 1 ? '' : 's'}.`; });
}
$('#glass-orb').addEventListener('click', () => $('#playground').classList.toggle('alternate'));
rendererLabel();
