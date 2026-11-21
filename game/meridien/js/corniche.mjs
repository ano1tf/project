// The path, rendering and pedestrian ground query use this same elevation profile.
export const CORNICHE = {
  x: 693,
  z: -223,
  entry: 18,
  landing: -6,
  back: -18,
  rampWidth: 3.8,
  deckWidth: 13,
  rise: 3.6,
};
export const CORNICHE_ENTRY = {
  x: CORNICHE.x,
  z: CORNICHE.z + CORNICHE.entry + 1,
  label: "Observatoire de la Corniche",
};
export function cornicheFloor(x, z) {
  const c = CORNICHE,
    dx = Math.abs(x - c.x),
    dz = z - c.z;
  if (dz < c.back || dz > c.entry) return null;
  if (dx > (dz <= c.landing ? c.deckWidth : c.rampWidth) / 2) return null;
  return 0.08 + c.rise * Math.min(1, (c.entry - dz) / (c.entry - c.landing));
}
