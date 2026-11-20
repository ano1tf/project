// Metres, Y up, door faces +Z. These collision volumes and anchors are shipped
// independently of the editable Atelier lot, so Plan and saved routes work offline.
export const COMPTOIR = Object.freeze({
  x: -176,
  z: 119,
  w: 10.8,
  d: 7.6,
  door: { x: -176.65, z: 123.65, height: 2.45 },
  desk: { x: -178.82, z: 119.18, height: 1.45 },
  opening: { x: -0.65, z: 3.63, w: 2.4, d: 0.27, h: 2.94 },
  // [local x, local z, width, depth, top, optional bottom].
  solids: [
    [0, -3.68, 10.8, 0.24, 4.08],
    [-5.28, 0, 0.24, 7.58, 4.08],
    [5.28, 0, 0.24, 7.58, 4.08],
    [-3.625, 3.67, 3.55, 0.26, 4.08],
    [3, 3.67, 4.9, 0.26, 4.08],
    [-0.65, 3.67, 2.4, 0.26, 4.08, 2.93],
    [0, 0, 10.94, 7.82, 4.35, 3.74],
    [-2.82, -0.75, 2.64, 0.84, 1.18],
    [3.62, -1.46, 2.4, 1.82, 2.25],
    [0.4, -2.98, 2.3, 0.64, 2.14],
    [-4.62, 2.02, 0.72, 2.05, 0.94],
  ],
});

export const PORT_BAY = Object.freeze({
  x: 33.5,
  z: 120.65,
  heading: Math.PI * 0.5,
  sign: "FRET · GARAGE ESTUAIRE",
  label: "Arrêt fret du Garage Estuaire",
  height: 1.28,
});
