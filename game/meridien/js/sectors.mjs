// The playable surface is a union of lands and crossings, not its map extent.
// All positions stay in world metres (Y up); sector IDs never encode a save offset.
import { RIVE, GREVES_BRIDGE } from "./rive-layout.mjs";

export const PORT_ID = "port-lumiere";
export const PORT_BOUNDS = Object.freeze({
  minX: -187,
  maxX: 182,
  minZ: -171,
  maxZ: 160,
});

export const inRect = (r, x, z, pad = 0) =>
  x >= r.minX + pad &&
  x <= r.maxX - pad &&
  z >= r.minZ + pad &&
  z <= r.maxZ - pad;

function cut(r, a, b, pad) {
  let lo = 0,
    hi = 1;
  for (const [start, delta, min, max] of [
    [a.x, b.x - a.x, r.minX + pad, r.maxX - pad],
    [a.z, b.z - a.z, r.minZ + pad, r.maxZ - pad],
  ]) {
    if (min > max) return null;
    if (Math.abs(delta) < 1e-8) {
      if (start < min || start > max) return null;
    } else {
      const u = (min - start) / delta,
        v = (max - start) / delta;
      lo = Math.max(lo, Math.min(u, v));
      hi = Math.min(hi, Math.max(u, v));
      if (lo > hi) return null;
    }
  }
  return [lo, hi];
}

export function createTopology(sectors, links = []) {
  // Link areas overlap each bank by more than the largest actor's clearance.
  const areas = [...sectors, ...links];
  const extent = Object.freeze({
    minX: Math.min(...areas.map((s) => s.bounds.minX)),
    minZ: Math.min(...areas.map((s) => s.bounds.minZ)),
    maxX: Math.max(...areas.map((s) => s.bounds.maxX)),
    maxZ: Math.max(...areas.map((s) => s.bounds.maxZ)),
  });
  return Object.freeze({
    sectors,
    links,
    extent,
    at(x, z) {
      return areas.find((s) => inRect(s.bounds, x, z)) ?? null;
    },
    allows(x, z, pad = 0) {
      return areas.some((s) => inRect(s.bounds, x, z, pad));
    },
    // Only movement/guidance uses this restriction. Camera sight can cross water.
    segment(a, b, pad = 0) {
      if (
        areas.some(
          ({ bounds: r }) =>
            inRect(r, a.x, a.z, pad) && inRect(r, b.x, b.z, pad),
        )
      )
        return true;
      const spans = areas.map((s) => cut(s.bounds, a, b, pad)).filter(Boolean);
      spans.sort((a, b) => a[0] - b[0]);
      let end = 0;
      for (const [from, to] of spans) {
        if (from > end + 1e-7) return false;
        end = Math.max(end, to);
        if (end >= 1 - 1e-7) return true;
      }
      return false;
    },
    restore(raw, fallback, pad = 0.65) {
      const x = Number.isFinite(raw?.x) ? raw.x : fallback.x;
      const z = Number.isFinite(raw?.z) ? raw.z : fallback.z;
      if (this.allows(x, z, pad)) return { x, z };
      let result = { x: fallback.x, z: fallback.z },
        best = Infinity;
      for (const { bounds: r } of areas) {
        const a = Math.max(r.minX + pad, Math.min(r.maxX - pad, x));
        const b = Math.max(r.minZ + pad, Math.min(r.maxZ - pad, z));
        const d = Math.hypot(x - a, z - b);
        if (d < best) {
          best = d;
          result = { x: a, z: b };
        }
      }
      return result;
    },
  });
}

export const PORT_SECTOR = Object.freeze({
  id: PORT_ID,
  name: "Port-Lumière",
  bounds: PORT_BOUNDS,
});
export const WORLD = createTopology(
  Object.freeze([PORT_SECTOR, RIVE]),
  Object.freeze([GREVES_BRIDGE]),
);
