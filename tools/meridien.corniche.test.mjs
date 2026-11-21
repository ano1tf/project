import test from "node:test";
import assert from "node:assert/strict";
import { CORNICHE as c, cornicheFloor } from "../game/meridien/js/corniche.mjs";
import { dry, clearance, lots, trees } from "../game/meridien/js/faubourgs.mjs";
test("Corniche : parcelle sèche, dégagée, hors voirie", () => {
  for (let x = c.x - 7; x <= c.x + 7; x++)
    for (let z = c.z - 19; z <= c.z + 20; z++) {
      assert.ok(dry(x, z, 1));
      assert.ok(clearance(x, z) > 1);
      for (const v of [...lots, ...trees])
        assert.ok(
          Math.abs(v.x - x) > (v.w ?? 7) / 2 ||
            Math.abs(v.z - z) > (v.d ?? 7) / 2,
        );
    }
});
test("Corniche : montée continue jusqu’au plancher de la terrasse", () => {
  let last = 0.08;
  for (let i = 0; i <= 360; i++) {
    const z = c.z + c.entry - i / 10;
    const h = cornicheFloor(c.x + 0.55, z);
    assert.ok(h >= last - 1e-8 && h - last < 0.016);
    last = h;
  }
  assert.equal(last, c.rise + 0.08);
  assert.equal(cornicheFloor(c.x + 4, c.z), null);
  assert.equal(cornicheFloor(c.x + 4, c.z - 12), last);
});
