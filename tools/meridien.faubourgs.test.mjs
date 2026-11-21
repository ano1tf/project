import test from "node:test";
import assert from "node:assert/strict";
import {
  lots,
  streets,
  squares,
  trees,
  clearance,
  dry,
  eastRoute,
  eastRoad,
} from "../game/meridien/js/faubourgs.mjs";
test("Chaque parcelle et chaque houppier restent sur la rive, hors chaussée", () => {
  assert.ok(lots.length > 65 && trees.length > 50);
  assert.ok(lots.some((p) => p.ward === 1 && p.d === 34));
  for (const p of [...lots, ...trees.map((p) => ({ ...p, w: 7, d: 7 }))]) {
    assert.ok(clearance(p.x, p.z) > Math.hypot(p.w, p.d) / 2 + 1);
    for (const dx of [-p.w / 2, 0, p.w / 2])
      assert.ok(dry(p.x + dx, p.z, p.d / 2));
  }
  for (let i = 0; i < lots.length; i++)
    for (const b of lots.slice(i + 1)) {
      const a = lots[i];
      assert.ok(
        Math.abs(a.x - b.x) > (a.w + b.w) / 2 ||
          Math.abs(a.z - b.z) > (a.d + b.d) / 2,
      );
    }
});
test("Les voies courbes et leurs raccordements suivent la terre ferme", () => {
  const gate = { x: 1151, z: -10 };
  for (const { p, q, width } of streets) {
    assert.ok(dry(p.x, p.z, width / 2));
    const route = eastRoute(p, gate);
    assert.deepEqual(route[1], p);
    assert.deepEqual(route.at(-2), gate);
    assert.ok(eastRoad((p.x + q.x) / 2, (p.z + q.z) / 2));
  }
});

test("Les trois espaces publics sont accessibles, hors voirie et sans empiètement", () => {
  for (const p of squares) {
    assert.ok(clearance(p.x, p.z) > Math.hypot(p.w, p.d) / 2 + 1);
    for (const dx of [-p.w / 2, 0, p.w / 2])
      assert.ok(dry(p.x + dx, p.z, p.d / 2 + 1));
    for (const v of [...lots, ...trees.map((q) => ({ ...q, w: 7, d: 7 }))])
      assert.ok(
        Math.abs(p.x - v.x) > (p.w + v.w) / 2 + 1 ||
          Math.abs(p.z - v.z) > (p.d + v.d) / 2 + 1,
      );
  }
});
