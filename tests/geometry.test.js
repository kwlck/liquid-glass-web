import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distance, displacementMap } from '../src/geometry.js';

test('rounded surface, capsule and ellipse have matching boundaries', () => {
  assert.equal(distance(100, 0, 200, 100, 24, 'rounded'), 0);
  assert.equal(distance(0, 50, 200, 100, 24, 'rounded'), 0);
  assert.ok(distance(100, 50, 200, 100, 24, 'rounded') > 0);
  assert.equal(distance(0, 0, 200, 100, 24, 'rounded'), -50);
  assert.equal(distance(100, 0, 200, 100, 0, 'pill'), 0);
  assert.equal(distance(100, 0, 200, 100, 24, 'ellipse'), 0);
  assert.equal(distance(0, 50, 200, 100, 24, 'ellipse'), 0);
  assert.ok(distance(100, 50, 200, 100, 24, 'ellipse') > 0);
  assert.equal(distance(0, 0, 200, 100, 24, 'ellipse'), -50);
});

test('flat interior is neutral and rim offsets point inward symmetrically', () => {
  const { width, pixels } = displacementMap(200, 100, 20, 'rounded');
  const sample = (x, y) => [...pixels.slice((y * width + x) * 4, (y * width + x) * 4 + 4)];
  assert.deepEqual(sample(100, 50), [128, 128, 128, 255]);
  const left = sample(0, 50); const right = sample(199, 50);
  assert.ok(left[0] > 128); assert.ok(right[0] < 128);
  assert.ok(Math.abs(left[0] + right[0] - 256) <= 1);
  const top = sample(100, 0); const bottom = sample(100, 99);
  assert.ok(top[1] > 128); assert.ok(bottom[1] < 128);
  assert.deepEqual(sample(0, 0), [128, 128, 128, 255]);
});

test('map density and small/large radii remain finite for every shape', () => {
  for (const shape of ['rounded', 'pill', 'ellipse']) {
    const map = displacementMap(80, 40, 999, shape, 0.5);
    assert.equal(map.width, 40); assert.equal(map.height, 20);
    assert.equal(map.pixels.length, 40 * 20 * 4);
    assert.ok(map.pixels.every(Number.isFinite));
    assert.equal(distance(40, 0, 80, 40, 999, shape), 0);
  }
});
