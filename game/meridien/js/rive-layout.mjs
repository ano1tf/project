// Rive des Grèves: a small industrial bank, in the same metre grid as the docks.
export const RIVE_ID = "greves";
export const RIVE = Object.freeze({
  id: RIVE_ID,
  name: "Rive des Grèves",
  bounds: { minX: -338, maxX: -243, minZ: 88, maxZ: 164 },
  road: { minX: -323, maxX: -241, minZ: 121.2, maxZ: 130.8 },
  apron: { minX: -314, maxX: -283, minZ: 117.75, maxZ: 125 },
  turn: { minX: -329, maxX: -315, minZ: 116.8, maxZ: 136 },
});
export const GREVES_BRIDGE = Object.freeze({
  id: "pont-greves",
  name: "Pont des Grèves",
  from: "port-lumiere",
  to: RIVE_ID,
  bounds: { minX: -248, maxX: -181, minZ: 118.5, maxZ: 133.5 },
  // The parking shoulder on the Docks side stays clear at -178 / 126.
  drive: [
    { x: -178, z: 126 },
    { x: -251, z: 126 },
  ],
  walk: [
    { x: -180.4, z: 131.5 },
    { x: -249, z: 131.5 },
  ],
  road: { minX: -248, maxX: -181, minZ: 121.2, maxZ: 130.8 },
  lane: 2.34,
  z: 126,
  railZ: [118.85, 133.15],
});
export const GREVES_BAY = Object.freeze({
  x: -301.7,
  z: 120.05,
  heading: -Math.PI / 2,
  label: "Baie de fret des Grèves",
  sign: "FRET · LES GRÈVES",
  height: 1.35,
});
export const GREVES_WORKSHOP = Object.freeze({
  x: -302,
  z: 108,
  w: 22,
  d: 15.6,
  h: 5.15,
  door: {
    x: -298.9,
    z: 116.46,
    height: 2.58,
    label: "Atelier des Grèves",
    sign: "ATELIER DES GRÈVES · ENTRÉE",
    kind: "shop",
  },
  desk: {
    x: -307.45,
    z: 107.52,
    height: 1.4,
    label: "Banc de contrôle des Grèves",
    sign: "TABLE DE CONTRÔLE",
  },
  platen: { x: -307.9, z: 108.0 },
  opening: { x: 3.1, w: 3.15, z: 7.72, h: 3.12 },
  // Colliders are not loaded from the 3D assembly. [local x,z,w,d,top,bottom?]
  solids: [
    [0, -7.66, 22, 0.28, 4.92],
    [-10.86, 0, 0.28, 15.55, 4.92],
    [10.86, 0, 0.28, 15.55, 4.92],
    [-4.7375, 7.72, 12.525, 0.26, 4.92],
    [7.8375, 7.72, 6.325, 0.26, 4.92],
    [3.1, 7.72, 3.15, 0.26, 4.92, 3.12],
    [0, 0, 22.26, 15.84, 5.28, 4.58],
    [-5.95, -2.45, 3.4, 1.1, 1.07],
    [7.8, -3.9, 2.85, 2.2, 2.7],
    [-8.5, -5.65, 3.33, 1.05, 2.1],
  ],
});
export const GREVES_YARD = Object.freeze([
  { x: -268.5, z: 102.3, w: 18.4, d: 14.8, h: 6.4, kind: "hangar" },
  { x: -318.3, z: 148.8, w: 18.1, d: 13.4, h: 4.25, kind: "hangar" },
  { x: -267.75, z: 150.3, w: 8.6, d: 3.3, h: 2.65, kind: "container" },
  { x: -267.85, z: 155.2, w: 8.65, d: 3.24, h: 2.65, kind: "container" },
]);
export const GREVES_LAMPS = Object.freeze([
  [-196.8, 132.3],
  [-219.7, 119.7],
  [-239.2, 132.3],
  [-257.5, 133.65],
  [-282.7, 133.65],
  [-315.1, 113.8],
  [-319.8, 135.9],
]);
export const GREVES_RAILS = Object.freeze([
  // Deck rails, then east/west/north/south edges of the industrial wharf.
  [-218, 118.85, 59.8, 0.18],
  [-218, 133.15, 59.8, 0.18],
  [-243.5, 103.35, 0.18, 30.1],
  [-243.5, 148.45, 0.18, 30.15],
  [-337.48, 126, 0.18, 75.55],
  [-290.4, 88.48, 93.8, 0.18],
  [-290.4, 163.52, 93.8, 0.18],
]);

export const MINA_BOARD = Object.freeze({
  x: -297.25,
  z: 112.0,
  height: 1.4,
  label: "Registre des Calfats",
  sign: "REGISTRE · ATELIER DES GRÈVES",
});

export const LOG_TABLE = Object.freeze({
  x: -294.65,
  z: 111.95,
  w: 2.04,
  d: 0.96,
  h: 0.92,
});
