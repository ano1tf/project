import test from "node:test";
import assert from "node:assert/strict";
import {
  WEST,
  NORTH,
  NX,
  NZ,
  TILE,
  roads,
  nodes,
  zones,
  biome,
  scenery,
  roadDistance,
  gate,
  altitude,
  waters,
} from "../game/meridien/js/region.mjs";
import { WORLD } from "../game/meridien/js/sectors.mjs";
import { Solids, onRoad, navRoute } from "../game/meridien/js/core.mjs";
test("Region: every road and its shoulders stay on dry, unobstructed land", () => {
  const solids = new Solids();
  for (const { p, q, d } of roads) {
    const nx = (q.z - p.z) / d,
      nz = (p.x - q.x) / d;
    for (let k = 0; k <= d; k += 4)
      for (const off of [-4, 0, 4]) {
        const x = p.x + ((q.x - p.x) * k) / d + nx * off,
          z = p.z + ((q.z - p.z) * k) / d + nz * off;
        assert.ok(onRoad(x, z));
        assert.ok(!solids.blocked(x, z, 0.65), `blocked road ${x},${z}`);
      }
  }
});
test("All generated buildings, vegetation and rock footprints clear the roadway", () => {
  let total = 0;
  const biomes = new Set();
  for (let i = 0; i < NX; i++)
    for (let j = 0; j < NZ; j++)
      for (const p of scenery(i, j)) {
        assert.ok(roadDistance(p.x, p.z) > 7.5 + p.w);
        assert.ok(!waters(p.x, p.z));
        assert.ok(Number.isFinite(altitude(p.x, p.z)));
        biomes.add(biome(p.x, p.z));
        total++;
      }
  assert.equal(biomes.size, zones.length);
  assert.ok(total > 10000);
});
test("Regional road network connects every anchor to the city", () => {
  for (const n of nodes.slice(2, 17)) {
    const path = navRoute(n, { x: 136, z: -10 });
    assert.ok(path.length > 4);
    assert.deepEqual(path[0], n);
    assert.ok(path.some((v) => v.x === gate.x));
    assert.deepEqual(path.at(-1), { x: 136, z: -10 });
  }
  assert.ok(WORLD.extent.maxX - WORLD.extent.minX > 17000);
});
