const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const canvas = $('#scene');
const specimen = $('#specimen');
const stage = $('#stage');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const mobile = matchMedia('(max-width: 760px)');
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

const wallpapers = [
  { id: 'alpine', name: 'Mountains', image: './assets/alpine.jpg', credit: 'Joshua Woroniecki · Unsplash' },
  { id: 'ocean', name: 'Ocean', image: './assets/ocean.jpg', bright: true, credit: 'Samuel Scrimshaw · Unsplash' },
  { id: 'desert', name: 'Dunes', image: './assets/desert.jpg', bright: true, credit: 'Zetong Li · Unsplash' },
  { id: 'aurora', name: 'Aurora', gradient: 'radial-gradient(ellipse at 10% 95%,#74f0d7,transparent 60%),radial-gradient(ellipse at 80% 0%,#5251b4,transparent 65%),linear-gradient(140deg,#123d76,#237b9b)' },
  { id: 'sunset', name: 'Sunset', gradient: 'radial-gradient(ellipse at 90% 90%,#ffbe70,transparent 65%),radial-gradient(ellipse at 10% 5%,#6a3ba2,transparent 70%),linear-gradient(130deg,#252557,#d35d64)' },
  { id: 'midnight', name: 'Midnight', gradient: 'radial-gradient(ellipse at 20% 90%,#304d75,transparent 65%),radial-gradient(ellipse at 90% 15%,#3f3761,transparent 60%),#101625' }
];
const state = { refraction: 100, blur: 0, light: 22, material: 'clear', shape: 'card', wallpaper: 'alpine' };
const pointer = { x: innerWidth * 0.32, y: innerHeight * 0.17 };
const lightPointer = { ...pointer };
let viewport = { w: innerWidth, h: innerHeight };
let position = { x: 0, y: 0 };
let desiredSize = { w: 382, h: 286, r: 60 };
let renderer = null;
let activeSource = null;
let previousSource = null;
let wallpaperRequest = 0;
let requestFrame = 0;
let renderUntil = 0;
let blendStart = 0;
let isDragging = false;
let grab = null;
let didPosition = false;
let morphTimer;
const assetCache = new Map();

const vertexShaderSource = `
attribute vec2 a_position;
varying vec2 v_uv;
void main(){v_uv=a_position*0.5+0.5;gl_Position=vec4(a_position,0.0,1.0);}
`;

const fragmentShaderSource = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_backdrop;
uniform sampler2D u_previous;
uniform vec2 u_resolution;
uniform vec4 u_glass;
uniform float u_radius;
uniform float u_refraction;
uniform float u_blur;
uniform float u_light;
uniform float u_frost;
uniform float u_blend;
uniform vec2 u_pointer;

vec3 backdrop(vec2 p) {
  vec2 uv = clamp(vec2(p.x / u_resolution.x, 1.0 - p.y / u_resolution.y), 0.001, 0.999);
  vec3 now = texture2D(u_backdrop, uv).rgb;
  if (u_blend > 0.999) return now;
  return mix(texture2D(u_previous, uv).rgb, now, u_blend);
}
float roundedBox(vec2 p, vec2 b, float r) {
  vec2 q=abs(p)-b+vec2(r);
  return min(max(q.x,q.y),0.0)+length(max(q,0.0))-r;
}
vec3 softBackdrop(vec2 p, float blur) {
  if(blur<0.05) return backdrop(p);
  vec3 c=backdrop(p)*0.20;
  c+=backdrop(p+vec2(1.0,0.0)*blur)*0.10;
  c+=backdrop(p+vec2(-1.0,0.0)*blur)*0.10;
  c+=backdrop(p+vec2(0.0,1.0)*blur)*0.10;
  c+=backdrop(p+vec2(0.0,-1.0)*blur)*0.10;
  c+=backdrop(p+vec2(0.707,0.707)*blur)*0.10;
  c+=backdrop(p+vec2(-0.707,0.707)*blur)*0.10;
  c+=backdrop(p+vec2(0.707,-0.707)*blur)*0.10;
  c+=backdrop(p+vec2(-0.707,-0.707)*blur)*0.10;
  return c;
}
void main() {
  vec2 p=vec2(v_uv.x*u_resolution.x,(1.0-v_uv.y)*u_resolution.y);
  vec2 center=u_glass.xy+u_glass.zw*0.5;
  vec2 local=p-center;
  vec2 halfSize=u_glass.zw*0.5;
  float radius=min(u_radius,min(halfSize.x,halfSize.y));
  float sdf=roundedBox(local,halfSize,radius);
  vec3 color=backdrop(p);

  float shadowDistance=roundedBox(local-vec2(0.0,12.0),halfSize,radius);
  float shadow=exp(-max(shadowDistance,0.0)/17.0)*0.22;
  color*=1.0-shadow*smoothstep(-1.0,2.0,sdf);

  if(sdf<1.0) {
    vec2 gradient=vec2(
      roundedBox(local+vec2(0.5,0.0),halfSize,radius)-roundedBox(local-vec2(0.5,0.0),halfSize,radius),
      roundedBox(local+vec2(0.0,0.5),halfSize,radius)-roundedBox(local-vec2(0.0,0.5),halfSize,radius)
    );
    vec2 normal=gradient/(length(gradient)+0.0001);
    float depth=max(-sdf,0.0);
    float bevelWidth=min(32.0,min(halfSize.x,halfSize.y)*0.32);
    float bevel=1.0-smoothstep(0.0,bevelWidth,depth);
    float curvature=pow(bevel,1.65);
    float bend=(4.0+u_refraction*39.0)*curvature*u_refraction;
    vec2 refracted=center+local*(1.0-0.045*u_refraction)-normal*bend;
    float blurRadius=u_blur*(0.46+0.33*(1.0-bevel));
    vec3 glass=softBackdrop(refracted,blurRadius);

    // Color dispersion is confined to the curved rim of the lens.
    float dispersion=1.6*curvature*u_refraction;
    vec3 chroma=vec3(
      backdrop(refracted-normal*dispersion).r,
      backdrop(refracted).g,
      backdrop(refracted+normal*dispersion).b
    );
    glass=mix(glass,chroma,curvature*0.5);
    float luminance=dot(glass,vec3(0.2126,0.7152,0.0722));
    glass=mix(vec3(luminance),glass,1.16);
    glass=mix(glass,vec3(0.88,0.95,1.0),0.042+u_frost*0.18);

    vec2 illumination=normalize((u_pointer-center)/max(u_resolution.x,u_resolution.y)+vec2(-0.28,-0.38));
    float facing=dot(normal,illumination);
    float specular=pow(max(facing,0.0),5.0);
    float opposite=pow(max(-facing,0.0),8.0);
    float rim=1.0-smoothstep(0.0,1.8,depth);
    float innerRim=exp(-abs(depth-3.2)*0.8);
    float sheen=specular*curvature*0.20+opposite*curvature*0.10;
    float edge=(0.13+specular*0.72+opposite*0.42)*rim;
    vec2 lp=local/halfSize;
    float sweep=pow(max(0.0,1.0-length(lp-illumination*0.8)*0.6),4.0)*0.07;
    glass+=vec3(sheen+edge+innerRim*specular*0.075+sweep)*u_light;
    glass-=curvature*(1.0-specular)*0.035;
    float mask=1.0-smoothstep(-0.65,0.7,sdf);
    color=mix(color,glass,mask);
  }
  gl_FragColor=vec4(color,1.0);
}
`;

function createRenderer() {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
  if (!gl) return null;
  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  try {
    const vs = compile(gl.VERTEX_SHADER, vertexShaderSource);
    const fs = compile(gl.FRAGMENT_SHADER, fragmentShaderSource);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const attribute = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
    const uniforms = {};
    for (const name of ['backdrop', 'previous', 'resolution', 'glass', 'radius', 'refraction', 'blur', 'light', 'frost', 'blend', 'pointer']) uniforms[name] = gl.getUniformLocation(program, 'u_' + name);
    const textures = [0, 1].map((unit) => {
      const texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([24, 60, 87, 255]));
      return texture;
    });
    gl.uniform1i(uniforms.backdrop, 0);
    gl.uniform1i(uniforms.previous, 1);
    const cover = document.createElement('canvas');
    const ctx = cover.getContext('2d');
    function upload(source, unit) {
      if (!source) return;
      const scale = Math.min(1.5, devicePixelRatio || 1, 2560 / viewport.w);
      cover.width = Math.round(viewport.w * scale);
      cover.height = Math.round(viewport.h * scale);
      const ratio = Math.max(cover.width / source.width, cover.height / source.height);
      const w = source.width * ratio;
      const h = source.height * ratio;
      ctx.clearRect(0, 0, cover.width, cover.height);
      ctx.drawImage(source, (cover.width - w) * 0.5, (cover.height - h) * 0.5, w, h);
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, textures[unit]);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cover);
    }
    function resize() {
      const scale = Math.min(1.65, devicePixelRatio || 1, 2560 / viewport.w);
      canvas.width = Math.round(viewport.w * scale);
      canvas.height = Math.round(viewport.h * scale);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uniforms.resolution, viewport.w, viewport.h);
      upload(activeSource, 0);
      upload(previousSource || activeSource, 1);
    }
    function draw(time) {
      const rect = specimen.getBoundingClientRect();
      const radius = parseFloat(getComputedStyle(specimen).borderTopLeftRadius);
      const blend = reducedMotion.matches ? 1 : clamp((time - blendStart) / 650, 0, 1);
      const easedBlend = blend * blend * (3 - 2 * blend);
      gl.uniform4f(uniforms.glass, rect.left, rect.top, rect.width, rect.height);
      gl.uniform1f(uniforms.radius, radius);
      gl.uniform1f(uniforms.refraction, state.refraction / 100);
      gl.uniform1f(uniforms.blur, state.blur);
      gl.uniform1f(uniforms.light, state.light / 100);
      gl.uniform1f(uniforms.frost, state.material === 'frosted' ? 1 : 0);
      gl.uniform1f(uniforms.blend, easedBlend);
      gl.uniform2f(uniforms.pointer, lightPointer.x, lightPointer.y);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    document.body.classList.add('webgl-ready');
    return { upload, resize, draw };
  } catch (error) {
    console.warn('Glass rendering fallback:', error.message);
    return null;
  }
}

function requestRender(duration = 180) {
  renderUntil = Math.max(renderUntil, performance.now() + duration);
  if (!requestFrame && !document.hidden) requestFrame = requestAnimationFrame(render);
}
function render(time) {
  requestFrame = 0;
  const ease = reducedMotion.matches ? 1 : 0.16;
  lightPointer.x += (pointer.x - lightPointer.x) * ease;
  lightPointer.y += (pointer.y - lightPointer.y) * ease;
  renderer?.draw(time);
  if (time < renderUntil && !document.hidden) requestFrame = requestAnimationFrame(render);
}

function gradientSource(id) {
  const surface = document.createElement('canvas');
  surface.width = 1600;
  surface.height = 1100;
  const ctx = surface.getContext('2d');
  const palette = id === 'sunset' ? ['#252557', '#d35d64', '#6a3ba2', '#ffbe70'] : id === 'midnight' ? ['#101625', '#171e32', '#3f3761', '#304d75'] : ['#123d76', '#237b9b', '#5251b4', '#74f0d7'];
  const base = ctx.createLinearGradient(0, 0, 1600, 1100);
  base.addColorStop(0, palette[0]);
  base.addColorStop(1, palette[1]);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 1600, 1100);
  [[1450, 100, 1150, palette[2]], [70, 1120, 1150, palette[3]]].forEach(([x, y, radius, color]) => {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, color);
    glow.addColorStop(1, color + '00');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 1600, 1100);
  });
  // Fine tonal lines make the change in optical density easy to see.
  if (id === 'aurora') {
    ctx.save();
    ctx.translate(800, 550);
    ctx.rotate(-0.52);
    const stripe = ctx.createLinearGradient(-65, 0, 240, 0);
    stripe.addColorStop(0, '#bcefff00');
    stripe.addColorStop(0.32, '#bcefff09');
    stripe.addColorStop(0.43, '#bcefff3b');
    stripe.addColorStop(0.5, '#c1f9ff8a');
    stripe.addColorStop(0.515, '#11477150');
    stripe.addColorStop(1, '#11477100');
    ctx.fillStyle = stripe;
    ctx.fillRect(-65, -1800, 305, 3600);
    ctx.restore();
  }
  return surface;
}

async function loadWallpaper(wallpaper) {
  if (assetCache.has(wallpaper.id)) return assetCache.get(wallpaper.id);
  const promise = wallpaper.image ? new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Wallpaper unavailable'));
    img.src = wallpaper.image;
  }) : Promise.resolve(gradientSource(wallpaper.id));
  assetCache.set(wallpaper.id, promise);
  try { return await promise; } catch (error) { assetCache.delete(wallpaper.id); throw error; }
}

async function selectWallpaper(id) {
  const wallpaper = wallpapers.find((item) => item.id === id);
  const request = ++wallpaperRequest;
  const button = $(`[data-wallpaper="${id}"]`);
  button?.setAttribute('aria-busy', 'true');
  try {
    const source = await loadWallpaper(wallpaper);
    if (request !== wallpaperRequest) return;
    previousSource = activeSource || source;
    activeSource = source;
    state.wallpaper = id;
    renderer?.upload(activeSource, 0);
    renderer?.upload(previousSource, 1);
    blendStart = performance.now();
    const fallback = $('#fallbackBackdrop');
    fallback.style.backgroundImage = wallpaper.image ? `url("${wallpaper.image}")` : `url("${source.toDataURL()}")`;
    document.body.classList.toggle('bright-wallpaper', !!wallpaper.bright);
    $('#wallpaperName').textContent = wallpaper.name;
    $$('[data-wallpaper]').forEach((item) => item.setAttribute('aria-pressed', String(item.dataset.wallpaper === id)));
    announce(`Background: ${wallpaper.name}`);
    requestRender(850);
  } catch {
    announce('Could not load this background. Choose another.');
    if (!activeSource) selectWallpaper('aurora');
  } finally {
    button?.removeAttribute('aria-busy');
  }
}

function createWallpaperControls() {
  const list = $('#wallpaperList');
  list.replaceChildren();
  wallpapers.forEach((wallpaper) => {
    const button = document.createElement('button');
    button.className = 'wallpaper-option';
    button.dataset.wallpaper = wallpaper.id;
    button.setAttribute('aria-label', 'Background: ' + wallpaper.name);
    button.setAttribute('aria-pressed', String(wallpaper.id === state.wallpaper));
    if (wallpaper.credit) button.title = wallpaper.credit;
    const thumb = document.createElement('span');
    thumb.className = 'wallpaper-thumb';
    thumb.style.backgroundImage = wallpaper.image ? `url("${wallpaper.image}")` : wallpaper.gradient;
    thumb.innerHTML = '<svg aria-hidden="true"><use href="#icon-check"/></svg>';
    const label = document.createElement('span');
    label.textContent = wallpaper.name;
    button.append(thumb, label);
    button.addEventListener('click', () => selectWallpaper(wallpaper.id));
    list.append(button);
  });
}

function dimensions(shape) {
  const w = viewport.w;
  const compact = w <= 760;
  const short = viewport.h <= 650;
  const landscape = compact && viewport.h <= 480;
  const available = compact ? w - 44 : Math.max(250, stage.getBoundingClientRect().width - 12);
  if (shape === 'pill') return { w: Math.min(420, available), h: landscape ? 126 : compact && short ? 150 : 168, r: 84 };
  if (shape === 'circle') {
    const size = Math.min(landscape ? 174 : compact && short ? 230 : 288, available);
    return { w: size, h: size, r: size / 2 };
  }
  return { w: Math.min(w >= 1500 ? 430 : w > 1000 ? 382 : compact ? 340 : 330, available), h: compact ? landscape ? 166 : short ? 218 : 264 : w >= 1500 ? 310 : w > 1000 ? 286 : 262, r: compact ? 52 : 60 };
}
function writePosition() {
  specimen.style.transform = `translate3d(${position.x}px,${position.y}px,0)`;
  requestRender();
}
function constrainPosition() {
  position.x = clamp(position.x, 12, Math.max(12, viewport.w - desiredSize.w - 12));
  position.y = clamp(position.y, 85, Math.max(85, viewport.h - desiredSize.h - 28));
}
function centerSpecimen() {
  const rect = stage.getBoundingClientRect();
  position.x = rect.left + (rect.width - desiredSize.w) / 2;
  position.y = rect.top + (rect.height - desiredSize.h) / 2;
  constrainPosition();
  writePosition();
}
function applyShape(shape, center = false) {
  if (didPosition && !reducedMotion.matches) {
    specimen.classList.add('morphing');
    clearTimeout(morphTimer);
    morphTimer = setTimeout(() => specimen.classList.remove('morphing'), 720);
  }
  didPosition = true;
  const old = desiredSize;
  state.shape = shape;
  desiredSize = dimensions(shape);
  specimen.dataset.shape = shape;
  specimen.style.width = desiredSize.w + 'px';
  specimen.style.height = desiredSize.h + 'px';
  specimen.style.borderRadius = desiredSize.r + 'px';
  $$('[data-shape]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.shape === shape)));
  if (center) centerSpecimen();
  else {
    position.x += (old.w - desiredSize.w) / 2;
    position.y += (old.h - desiredSize.h) / 2;
    constrainPosition();
    writePosition();
  }
  requestRender(900);
}
function updateRange(id) {
  const input = $('#' + id);
  const value = Number(input.value);
  state[id] = value;
  $('#' + id + 'Value').textContent = value + (id === 'blur' ? '' : '%');
  input.style.setProperty('--range-progress', `${value / Number(input.max) * 100}%`);
  if (id === 'blur') {
    specimen.style.setProperty('--fallback-blur', value + 'px');
    if (value > 16 && state.material === 'clear') setMaterialState('frosted');
    else if (value < 12 && state.material === 'frosted') setMaterialState('clear');
  }
  requestRender(200);
}
function setMaterialState(material) {
  state.material = material;
  $$('[data-material]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.material === material)));
  specimen.classList.toggle('frosted', material === 'frosted');
}
function setMaterial(material) {
  setMaterialState(material);
  $('#blur').value = material === 'frosted' ? 24 : 6;
  updateRange('blur');
  requestRender(300);
}
function announce(message) { $('#announcement').textContent = message; }
function setSettings(open) {
  document.body.classList.toggle('settings-closed', !open);
  $('#settingsButton').setAttribute('aria-expanded', String(open));
  $('#settings').inert = !open;
}
function toggleFocus(force) {
  const focus = typeof force === 'boolean' ? force : !document.body.classList.contains('focus-mode');
  document.body.classList.toggle('focus-mode', focus);
  $('#focusButton').setAttribute('aria-label', focus ? 'Show panels' : 'Hide panels');
  $('#focusButton').setAttribute('aria-pressed', String(focus));
  $('#focusButton').title = focus ? 'Show panels' : 'Hide panels';
  $('.wallpaper-panel').inert = focus;
  $('#settings').inert = focus || document.body.classList.contains('settings-closed');
}

specimen.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || isDragging) return;
  const rect = specimen.getBoundingClientRect();
  specimen.classList.remove('morphing');
  clearTimeout(morphTimer);
  position = { x: rect.left, y: rect.top };
  writePosition();
  isDragging = true;
  grab = { x: event.clientX - position.x, y: event.clientY - position.y };
  specimen.setPointerCapture(event.pointerId);
  specimen.classList.add('dragging');
  specimen.focus({ preventScroll: true });
});
specimen.addEventListener('pointermove', (event) => {
  if (!isDragging || !grab) return;
  position.x = event.clientX - grab.x;
  position.y = event.clientY - grab.y;
  constrainPosition();
  writePosition();
});
function endDrag() { isDragging = false; grab = null; specimen.classList.remove('dragging'); }
specimen.addEventListener('pointerup', endDrag);
specimen.addEventListener('pointercancel', endDrag);
specimen.addEventListener('lostpointercapture', endDrag);
specimen.addEventListener('keydown', (event) => {
  const step = event.shiftKey ? 24 : 8;
  const directions = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (directions[event.key]) {
    event.preventDefault();
    position.x += directions[event.key][0];
    position.y += directions[event.key][1];
    constrainPosition();
    writePosition();
  } else if (event.key === 'Home') {
    event.preventDefault();
    centerSpecimen();
  }
});
window.addEventListener('pointermove', (event) => {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  requestRender(600);
}, { passive: true });
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (document.body.classList.contains('focus-mode')) toggleFocus(false);
    else { setSettings(false); $('#settingsButton').focus(); }
  }
});
$$('[data-shape]').forEach((button) => button.addEventListener('click', () => applyShape(button.dataset.shape)));
$$('[data-material]').forEach((button) => button.addEventListener('click', () => setMaterial(button.dataset.material)));
['refraction', 'blur', 'light'].forEach((id) => {
  $('#' + id).addEventListener('input', () => updateRange(id));
  updateRange(id);
});
$('#settingsButton').addEventListener('click', () => setSettings(document.body.classList.contains('settings-closed')));
$('#focusButton').addEventListener('click', () => toggleFocus());
$('#resetButton').addEventListener('click', () => {
  $('#refraction').value = 100;
  $('#light').value = 22;
  setMaterial('clear');
  $('#blur').value = 0;
  updateRange('blur');
  updateRange('refraction');
  updateRange('light');
  applyShape('card', true);
  pointer.x = viewport.w * 0.32;
  pointer.y = viewport.h * 0.17;
  requestRender(900);
  announce('Glass settings reset');
});
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    viewport = { w: innerWidth, h: innerHeight };
    applyShape(state.shape, true);
    renderer?.resize();
    requestRender(900);
  }, 100);
}, { passive: true });
mobile.addEventListener('change', () => setSettings(!mobile.matches));
document.addEventListener('visibilitychange', () => {
  if (document.hidden && requestFrame) { cancelAnimationFrame(requestFrame); requestFrame = 0; }
  else if (!document.hidden) requestRender(200);
});
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  renderer = null;
  document.body.classList.remove('webgl-ready');
  canvas.style.display = 'none';
});
canvas.addEventListener('webglcontextrestored', () => {
  canvas.style.display = '';
  renderer = createRenderer();
  renderer?.resize();
  requestRender(300);
});

createWallpaperControls();
setSettings(!mobile.matches);
activeSource = gradientSource('aurora');
previousSource = activeSource;
renderer = createRenderer();
applyShape('card', true);
renderer?.resize();
selectWallpaper('alpine');
requestRender(1000);

// User-selected images stay in this browser session and use the same optical renderer.
$('#customBackgroundButton').addEventListener('click', () => $('#customBackgroundInput').click());
$('#customBackgroundInput').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  const message = $('#backgroundMessage');
  const button = $('#customBackgroundButton');
  message.hidden = true;
  if (file.size > 40 * 1024 * 1024) {
    message.textContent = 'Choose an image up to 40 MB.';
    message.hidden = false;
    return;
  }
  const intent = ++wallpaperRequest;
  const objectUrl = URL.createObjectURL(file);
  button.disabled = true;
  button.textContent = 'Loading…';
  try {
    const image = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = objectUrl;
    });
    if (intent !== wallpaperRequest) return;
    const ratio = Math.min(1, 2560 / Math.max(image.naturalWidth, image.naturalHeight));
    const source = document.createElement('canvas');
    source.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    source.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    source.getContext('2d').drawImage(image, 0, 0, source.width, source.height);
    const probe = document.createElement('canvas');
    probe.width = probe.height = 16;
    const ctx = probe.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, 16, 16);
    const pixels = ctx.getImageData(0, 0, 16, 16).data;
    let luminance = 0;
    for (let i = 0; i < pixels.length; i += 4) luminance += pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722;
    const custom = { id: 'custom', name: 'Custom', image: source.toDataURL('image/jpeg', .9), bright: luminance / 256 > 155 };
    const oldIndex = wallpapers.findIndex((item) => item.id === 'custom');
    if (oldIndex < 0) wallpapers.push(custom);
    else wallpapers[oldIndex] = custom;
    assetCache.set('custom', Promise.resolve(source));
    createWallpaperControls();
    await selectWallpaper('custom');
    $('[data-wallpaper="custom"]').scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  } catch {
    if (intent === wallpaperRequest) {
      message.textContent = 'Could not open this image. Try JPG, PNG, or WebP.';
      message.hidden = false;
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
    button.disabled = false;
    button.textContent = '＋ Custom';
  }
});
