export const BOUNDS = Object.freeze({
  minX: -187,
  maxX: 182,
  minZ: -171,
  maxZ: 160,
});
export const X = [-154, -86, -12, 64, 136];
export const Z = [-142, -78, -10, 58, 126];
export const WX = [16, 15, 21, 15, 15];
export const WZ = [16, 15, 20, 16, 15];
// Dimensions shared by the markings, the pedestrians and the lane stop points.
export const JUNCTION_ZEBRA = { center: 0.2, depth: 2.42, line: 1.62 };
export const SILLAGE_ZEBRA = {
  x: X[0],
  z: 108.587,
  axis: "z",
  span: WX[0],
  depth: 1.87,
};
export function junctionZebra(i, j, axis, side) {
  const byX = axis === "x";
  return {
    i,
    j,
    axis,
    x: X[i] + (byX ? side * (WX[i] / 2 + JUNCTION_ZEBRA.center) : 0),
    z: Z[j] + (byX ? 0 : side * (WZ[j] / 2 + JUNCTION_ZEBRA.center)),
    span: byX ? WZ[j] : WX[i],
    depth: JUNCTION_ZEBRA.depth,
  };
}
export const START = { x: -159.8, z: 110.5, heading: 0.61 };
const stationX = -121,
  stationZ = 33;
const atStation = (x, z) => ({ x: stationX + x, z: stationZ + z });
export const STATION = {
  x: stationX,
  z: stationZ,
  w: 21.6,
  d: 15.6,
  h: 4.15,
  opening: 3.8,
  gate: { x: -6.9, z: -1.25, w: 2.35 },
  holdingWall: -3.35,
  arrival: { ...atStation(-8.35, -5.54), heading: 2.12 },
  officer: { ...atStation(-4.35, -3.15), heading: -Math.PI / 2 },
  release: {
    ...atStation(-6.27, -3.15),
    height: 1.35,
    label: "Guichet de sortie",
    sign: "GUICHET · FIN DU CONTRÔLE",
  },
};
// The plinth is also present in Plan; the animated assembly belongs to the optional 3D view.
export const SEMAPHORE = {
  x: -141.2,
  z: 106.55,
  yaw: -1.05,
  baseY: 0.347,
  width: 2.26,
  scale: 1.08,
  approach: { x: -143.12, z: 107.64 },
};
export const PLACES = {
  cafe: {
    x: -130,
    z: 87.7,
    label: "Café Le Sillage",
    sign: "LE SILLAGE",
    kind: "place",
    height: 2.8,
  },
  semaphore: {
    ...SEMAPHORE.approach,
    label: "Sémaphore des Marées",
    sign: "SÉMAPHORE DES MARÉES",
    kind: "place",
    height: 1.85,
  },
  hangar: {
    x: -118,
    z: -92,
    label: "Hangar 07",
    sign: "HANGAR 07",
    kind: "place",
    height: 2.6,
  },
  archive: {
    x: -111.7,
    z: -117,
    label: "Terminal des manifestes",
    sign: "LES MANIFESTES",
    kind: "place",
    height: 2.5,
  },
  belvedere: {
    x: -173,
    z: 12,
    label: "Belvédère des Marées",
    sign: "LE BELVÉDÈRE",
    kind: "place",
    height: 2.7,
  },
  courier: {
    x: -115.3,
    z: 100.5,
    label: "Courses de la Darse",
    sign: "COURSES DE LA DARSE",
    kind: "side",
    height: 2.4,
  },
  relay: {
    x: 94,
    z: 39.8,
    label: "Marché des Verrières",
    sign: "LES VERRIÈRES",
    kind: "side",
    height: 2.5,
  },
  depot: {
    x: -172,
    z: -108,
    label: "Balise Nord",
    sign: "BALISE NORD",
    kind: "side",
    height: 2.6,
  },
  garage: {
    x: 33,
    z: 120,
    label: "Garage Estuaire",
    sign: "ESTUAIRE",
    kind: "shop",
    height: 2.7,
  },
  station: {
    ...atStation(0, STATION.d / 2 + 0.77),
    label: "Commissariat des Docks",
    sign: "COMMISSARIAT DES DOCKS",
    kind: "station",
    height: 3.1,
  },
  repair: {
    x: 110,
    z: 99,
    label: "Station Le Ressac",
    sign: "LE RESSAC",
    kind: "shop",
    height: 2.7,
  },
};
// Roadside hand-offs for players who stay in the vehicle. The indoor/walking
// interaction points stay usable, including for saves from prior versions.
export const DELIVERY_BAYS = {
  relay: {
    x: 94,
    z: 52.72,
    heading: -Math.PI * 0.5,
    sign: "ARRÊT LIVRAISON · VERRIÈRES",
    label: "Livraison aux Verrières",
    height: 1.28,
  },
  depot: {
    x: -159.3,
    z: -108.33,
    heading: 0,
    sign: "ARRÊT LIVRAISON · BALISE NORD",
    label: "Livraison à la Balise Nord",
    height: 1.28,
  },
};
export const MAP_PLACES = [
  "cafe",
  "semaphore",
  "hangar",
  "station",
  "belvedere",
  "courier",
  "garage",
  "repair",
  "relay",
  "depot",
];
export const LOCKED_YARD = { x1: -136.6, x2: -99.5, z1: -123.6, z2: -101.2 };
export const VEHICLES = {
  mistral: {
    name: "Mistral 84",
    type: "coupe",
    accent: "#304b45",
    price: 0,
    x: -159.4,
    z: 102.4,
    yaw: 0,
    max: 28,
    accel: 6.7,
    brake: 12.5,
    steer: 1.55,
    grip: 5.5,
    length: 4.42,
    width: 1.84,
    height: 1.34,
    tone: 49,
  },
  boreal: {
    name: "Boréal GT",
    type: "sport",
    accent: "#b03f2b",
    price: 680,
    x: 24.7,
    z: 115.2,
    yaw: Math.PI / 2,
    max: 35,
    accel: 9.4,
    brake: 15.4,
    steer: 1.72,
    grip: 7,
    length: 4.55,
    width: 1.91,
    height: 1.25,
    tone: 57,
  },
  estuaire: {
    name: "Estuaire V2",
    type: "van",
    accent: "#d1c9ae",
    price: 410,
    x: 42.5,
    z: 115.2,
    yaw: -Math.PI / 2,
    max: 22,
    accel: 4.8,
    brake: 10.8,
    steer: 1.24,
    grip: 4.8,
    length: 4.85,
    width: 1.99,
    height: 2.04,
    tone: 38,
  },
  escort: {
    name: "Sûreté portuaire",
    type: "patrol",
    accent: "#c5cdd1",
    x: -154,
    z: -78,
    yaw: 0,
    max: 25,
    accel: 6.0,
    brake: 11,
    steer: 1.42,
    grip: 6,
    length: 4.55,
    width: 1.86,
    height: 1.49,
    tone: 46,
  },
};
export const GARAGE_STOCK = ["boreal", "estuaire"];
// Stable slots for ambient actors, independent of the player's garage.
export const TRAFFIC_IDS = Object.freeze(
  Array.from({ length: 19 }, (_, i) => `trafic-${i + 1}`),
);
export const CIVILIAN_COUNT = 21;
export const RAIN_PRICE = 65;
export const REPAIR_PRICE = 48;
export const FOOD_PRICE = 8;
export const INITIAL_CASH = 240;
export const WEATHER = {
  auto: "Automatique",
  clear: "Dégagé",
  rain: "Pluie",
  fog: "Brume",
};
export const OFFICERS = [
  {
    x: -129.8,
    z: -112.8,
    route: [
      [-129.8, -113.8],
      [-130, -119.7],
      [-121.2, -119.7],
      [-121.2, -114.5],
    ],
    phase: 0.17,
  },
  {
    x: -103.7,
    z: -118,
    route: [
      [-103.7, -118.8],
      [-103.7, -111.8],
      [-108.3, -108.2],
      [-109, -112],
    ],
    phase: 0.62,
  },
];
export const STORY = {
  contact: {
    title: "Prendre contact",
    text: "Traversez le quai. Entrez au Sillage et parlez à Inès.",
    target: "cafe",
  },
  hangar: {
    title: "Longer les quais",
    text: "Rejoignez le Hangar 07. Prenez la Mistral sur le quai ou continuez à pied.",
    target: "hangar",
  },
  archive: {
    title: "Le registre fantôme",
    text: "Entrez dans le hangar et récupérez le registre. C permet de rester discret.",
    target: "archive",
  },
  belvedere: {
    title: "À marée haute",
    text: "Apportez le registre à Aya au belvédère. Revenez sans alerte.",
    target: "belvedere",
  },
  done: {
    title: "Port-Lumière vous attend",
    text: "Chapitre terminé. Explorez la ville ou acceptez une livraison sur le quai.",
    target: null,
  },
};
export const COURIER = {
  idle: {
    title: "Courses de la Darse",
    text: "Prenez une course au comptoir des coursiers.",
    target: "courier",
  },
  relay: {
    title: "Un colis pour les halles",
    text: "Remettez le colis au marché des Verrières.",
    target: "relay",
  },
  depot: {
    title: "Un dernier kilomètre",
    text: "Rapportez le reçu à la Balise Nord.",
    target: "depot",
  },
};
// Camera, gesture and subtitle beats. The voice exporter reads this same script.
export const CONTACT_SCENE = {
  id: "sillage",
  title: "Premier signal",
  index: "01",
  place: "Café Le Sillage",
  frequency: "CANAL 16",
  lines: [
    {
      id: "sillage-01",
      speaker: "ines",
      shot: "wide",
      cue: "look",
      text: "Noa. Hier soir, j’étais sur le canal seize. Quelqu’un a dit ton nom.",
    },
    {
      id: "sillage-02",
      speaker: "noa",
      shot: "reverse",
      cue: "question",
      text: "Mon nom ? Tu sais qui c’était ?",
    },
    {
      id: "sillage-03",
      speaker: "ines",
      shot: "close",
      cue: "confide",
      text: "C’est un enregistrement. Deux heures dix-sept. Le remorqueur de ton frère répondait encore. Il était déjà porté disparu.",
    },
    {
      id: "sillage-04",
      speaker: "noa",
      shot: "reverse",
      cue: "question",
      text: "Tu l’as gardé, l’original ?",
    },
    {
      id: "sillage-05",
      speaker: "ines",
      shot: "profile",
      cue: "indicate",
      text: "Au hangar sept. Ta Mistral est sur le quai. Récupère le registre, puis monte voir Aya au belvédère.",
    },
  ],
};
export const FINAL_SCENE = {
  id: "marees",
  title: "Sous la surface",
  index: "02",
  place: "Belvédère des Marées",
  frequency: "REGISTRE · 02:17",
  lines: [
    {
      id: "marees-01",
      speaker: "aya",
      shot: "wide",
      cue: "paper",
      text: "Regarde, là. Ça, c’est son dernier signal. Après ça, quelqu’un a rayé le remorqueur du registre.",
    },
    {
      id: "marees-02",
      speaker: "noa",
      shot: "reverse",
      cue: "confide",
      text: "Si tu publies ça tel quel, ils vont remonter jusqu’à Inès.",
    },
    {
      id: "marees-03",
      speaker: "aya",
      shot: "close",
      cue: "offer",
      text: "Oui. On peut enlever les noms. Mais le directeur aura le temps de préparer sa version. C’est toi qui décides.",
    },
  ],
};
export const CAST = {
  ines: "Inès Kader",
  noa: "Noa Vidal",
  aya: "Aya Le Guen",
};
export const SCENES = [CONTACT_SCENE, FINAL_SCENE];
export const ENDINGS = {
  publish: {
    label: "Publier avec Aya",
    reward: 160,
    desc: "Aya publie le registre tel quel. +160 €.",
  },
  protect: {
    label: "Protéger la source",
    reward: 240,
    desc: "Inès expurge les noms avant publication. +240 €, café offert.",
  },
};
// These footprints drive the street geometry and the two maps.
export const GARDENS = [
  { x: -54, z: 72, w: 25, d: 9 },
  { x: 30, z: 43, w: 35, d: 8 },
  { x: 107, z: -22, w: 37, d: 7 },
  { x: 100, z: 73, w: 31, d: 8 },
  { x: -171, z: 75, w: 11, d: 22 },
];
export const QUAY_WALK = Z.slice(0, -1).map((z, i) => {
  const a = z + WZ[i] / 2 + 0.5,
    b = Z[i + 1] - WZ[i + 1] / 2 - 0.5;
  return { x: -182.2, z: (a + b) / 2, w: 3.7, d: b - a };
});
export const SILLAGE_SQUARE = { x: -139.1, z: 107.9, w: 12.7, d: 5.4 };

export const DISTRICTS = [
  { name: "LA DARSE", x: -112, z: -57 },
  { name: "LE SILLAGE", x: -104, z: 77 },
  { name: "LES VERRIÈRES", x: 97, z: -44 },
  { name: "LES ATELIERS", x: 98, z: 75 },
];
export function districtName(x, z) {
  if (
    Math.abs(x - STATION.x) < STATION.w / 2 &&
    Math.abs(z - STATION.z) < STATION.d / 2
  )
    return ["Commissariat", "Sûreté portuaire"];
  if (x < -146)
    return z < -62
      ? ["La Darse", "Quai Nord"]
      : ["Les Docks", "Quai des Marées"];
  if (x < -30)
    return z < -43
      ? ["La Darse", "Rue des Chantiers"]
      : ["Le Sillage", "Rue du Sillage"];
  return z < 49
    ? ["Les Verrières", "Boulevard des Verrières"]
    : ["Les Ateliers", "Avenue de l’Estuaire"];
}
