const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Signed distance in CSS pixels; negative values are inside the surface. */
export function distance(x, y, width, height, radius, shape) {
  const a = width / 2;
  const b = height / 2;
  if (shape === 'ellipse') {
    if (x === 0 && y === 0) return -Math.min(a, b);
    const k0 = Math.hypot(x / a, y / b);
    const k1 = Math.hypot(x / (a * a), y / (b * b));
    return k0 * (k0 - 1) / k1;
  }
  const r = shape === 'pill' ? Math.min(a, b) : clamp(radius, 0, Math.min(a, b));
  const qx = Math.abs(x) - a + r;
  const qy = Math.abs(y) - b + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

/** R/G encode the sampling offset. Each channel's neutral value is 128. */
export function displacementMap(width, height, radius, shape, resolution = 1) {
  const w = Math.max(1, Math.round(width * resolution));
  const h = Math.max(1, Math.round(height * resolution));
  const pixels = new Uint8ClampedArray(w * h * 4);
  const bevel = Math.min(32, Math.min(width, height) * 0.16);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = (x + 0.5) / w * width - width / 2;
      const py = (y + 0.5) / h * height - height / 2;
      const sdf = distance(px, py, width, height, radius, shape);
      const gx = distance(px + 0.5, py, width, height, radius, shape) - distance(px - 0.5, py, width, height, radius, shape);
      const gy = distance(px, py + 0.5, width, height, radius, shape) - distance(px, py - 0.5, width, height, radius, shape);
      const length = Math.hypot(gx, gy) || 1;
      const t = clamp(-sdf / bevel, 0, 1);
      const curvature = Math.pow(1 - t * t * (3 - 2 * t), 1.65);
      const inside = sdf <= 0 ? 1 : 0;
      const index = (y * w + x) * 4;
      pixels[index] = 128 - gx / length * curvature * inside * 127;
      pixels[index + 1] = 128 - gy / length * curvature * inside * 127;
      pixels[index + 2] = 128;
      pixels[index + 3] = 255;
    }
  }
  return { width: w, height: h, pixels };
}
