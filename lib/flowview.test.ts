import assert from "node:assert";
import { boundsOf, clampZoom, fitView, toWorld, zoomAt, ZOOM } from "./flowview.ts";

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

// zooming keeps the world point under the cursor fixed on screen
const v = { x: 120, y: -40, z: 0.8 }, px = 300, py = 210;
const before = toWorld(v, px, py), z2 = zoomAt(v, px, py, 1.5), after = toWorld(z2, px, py);
near(before.x, after.x); near(before.y, after.y); near(z2.z, 1.2);

// zoom is clamped, and a clamped zoom still keeps the cursor point fixed
const top = zoomAt(v, px, py, 100); assert.equal(top.z, ZOOM.max);
const topPt = toWorld(top, px, py); near(topPt.x, before.x); near(topPt.y, before.y);
assert.equal(zoomAt(v, px, py, 0.0001).z, ZOOM.min);
assert.equal(clampZoom(1), 1);

// fit: everything is visible, centred, and a small flow is not blown up past 100%
const box = { x: -500, y: 100, w: 2000, h: 800 }, size = { w: 1000, h: 600 }, f = fitView(box, size);
assert.ok(f.z < 1 && f.z >= ZOOM.min);
for (const [wx, wy] of [[box.x, box.y], [box.x + box.w, box.y + box.h]]) {
  const sx = wx * f.z + f.x, sy = wy * f.z + f.y;
  assert.ok(sx >= 0 && sx <= size.w && sy >= 0 && sy <= size.h, "corner on screen");
}
near(box.x * f.z + f.x + (box.w * f.z) / 2, size.w / 2); // horizontally centred
const small = fitView({ x: 10, y: 10, w: 200, h: 100 }, size);
assert.equal(small.z, 1);
near(10 * small.z + small.x + 100, size.w / 2);

// bounds
assert.equal(boundsOf([]), undefined);
assert.deepEqual(boundsOf([{ x: 0, y: 0, w: 10, h: 10 }, { x: -5, y: 20, w: 10, h: 10 }]), { x: -5, y: 0, w: 15, h: 30 });

console.log("flowview ok");
