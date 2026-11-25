// Pan/zoom maths for the flow editor's infinite canvas. Pure (no DOM), so it can be tested.
// A View says where the "world" (where steps live, any coordinates, negatives too) sits inside the screen frame: screen = world * z + (x, y).
export type View = { x: number; y: number; z: number };
export type Box = { x: number; y: number; w: number; h: number };
export const ZOOM = { min: 0.25, max: 1.6 } as const;

export const clampZoom = (z: number) => Math.min(ZOOM.max, Math.max(ZOOM.min, z));
/** Screen point (relative to the frame's top-left) -> world point. */
export const toWorld = (v: View, px: number, py: number) => ({ x: (px - v.x) / v.z, y: (py - v.y) / v.z });

/** Zoom by `factor` keeping the world point under (px, py) exactly where it is on screen. */
export function zoomAt(v: View, px: number, py: number, factor: number): View {
  const z = clampZoom(v.z * factor), r = z / v.z;
  return { z, x: px - (px - v.x) * r, y: py - (py - v.y) * r };
}

/** The view that shows `box` (world coordinates) centred in a frame of `size`, never zoomed in past 100%. */
export function fitView(box: Box, size: { w: number; h: number }, pad = 60): View {
  const z = clampZoom(Math.min(1, (size.w - 2 * pad) / Math.max(1, box.w), (size.h - 2 * pad) / Math.max(1, box.h)));
  return { z, x: (size.w - box.w * z) / 2 - box.x * z, y: (size.h - box.h * z) / 2 - box.y * z };
}

/** Bounding box of rectangles; undefined when there are none. */
export function boundsOf(rects: Box[]): Box | undefined {
  if (!rects.length) return undefined;
  const x0 = Math.min(...rects.map((r) => r.x)), y0 = Math.min(...rects.map((r) => r.y));
  return { x: x0, y: y0, w: Math.max(...rects.map((r) => r.x + r.w)) - x0, h: Math.max(...rects.map((r) => r.y + r.h)) - y0 };
}
