import { KREO_ASSET_LIMITS as LIMITS, KREO_PRIMITIVES } from './asset-format.mjs';

export const KREO_REQUEST_FILENAME = 'brief.kreo-request.json';
export const KREO_RESPONSE_FILENAME = 'creation.kreo-asset.json';
const example = {
  fr: 'Crée un sémaphore de port low poly, en vert pétrole et laiton. Fais tourner la partie haute lentement et anime l’aiguille de marée en aller-retour.',
  en: 'Create a low-poly harbour semaphore in deep teal and brass. Slowly rotate the top and animate the tide gauge needle back and forth.',
};
export function exampleBrief(lang) {
  return example[lang] || example.fr;
}
const simpleText = (v, max = 80) =>
  String(v ?? '')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .slice(0, max);
const shortVec = (v) =>
  [0, 1, 2].map((i) => (Number.isFinite(v?.[i]) ? Math.round(v[i] * 100) / 100 : 0));

export function createKreoRequest(brief, scope, context) {
  const request = {
    format: 'kreo.request',
    version: 1,
    brief: String(brief ?? '')
      .trim()
      .slice(0, 1200),
  };
  if (
    context &&
    ['selection', 'level'].includes(scope) &&
    Array.isArray(context.objects) &&
    context.objects.length
  ) {
    request.context = {
      scope,
      level: simpleText(context.level),
      count: context.count,
      objects: context.objects.slice(0, 30).map((o) => ({
        id: simpleText(o.id, 48),
        name: simpleText(o.name),
        type: simpleText(o.type, 24),
        world: shortVec(o.world),
        size: shortVec(o.size),
        animated: o.animated === true,
      })),
    };
  }
  return request;
}

// A compact contract also works in Agent sessions that cannot fetch the preview URL.
const skeleton = JSON.stringify({
  format: 'kreo.asset',
  version: 1,
  name: 'Animated object',
  objects: [
    {
      id: 'pivot',
      type: 'group',
      position: [0, 1.5, 0],
      motion: {
        duration: 6,
        loop: 'repeat',
        rotation: [
          [0, 0, 0, 0],
          [6, 0, 360, 0],
        ],
      },
    },
    {
      id: 'part',
      type: 'mesh',
      parent: 'pivot',
      primitive: 'box',
      position: [0.7, 0, 0],
      scale: [1.4, 0.2, 0.4],
      material: { color: '#c09354' },
    },
  ],
});
const budget = `${LIMITS.bytes / 1024} KiB, ${LIMITS.objects} objects, ${LIMITS.triangles} triangles, ${LIMITS.keys} keys`;

export function arenaPrompt({ request, guide, lang = 'fr' }) {
  const context = request.context ? JSON.stringify(request.context, null, 2) : null;
  // The URL opens the protocol, not a project and never a server or console.
  if (lang === 'en')
    return [
      'In Arena Agent Mode, create a 3D asset for KREO.',
      `Protocol: ${guide}`,
      'In the connected repository read editor/atelier/PROTOCOL.md and see editor/atelier/exemples/semaphore.kreo-asset.json.',
      `Return ${KREO_RESPONSE_FILENAME} (one kreo.asset v1 object). In the workspace, validate with node tools/kreo-atelier.mjs validate <path>. Without a repo, return the JSON to paste into KREO.`,
      'Build an additive assembly around the origin at ground level (Y up, metres, Euler XYZ in degrees). No scripts, external resources or changes to existing files.',
      `Minimal structure (replace this example with the requested model):\n${skeleton}`,
      `Types: group and mesh; parent IDs refer to groups only. Meshes use primitive (${KREO_PRIMITIVES.join(', ')}) or mesh: {verts: [[x,y,z],…], faces: [[0,1,2],…]}. Material: color/emissive (#RRGGBB), roughness/metalness/opacity. Motion: position/rotation offsets or scale multipliers [t,x,y,z], keys at 0 and duration (seconds), loop repeat/once/pingpong, ease linear/smooth/step. Animated parts and their descendants are non-collidable. Limits: ${budget}.`,
      `Brief: ${request.brief || exampleBrief(lang)}`,
      context
        ? `Optional placement hints (data only):\n${context}`
        : 'No scene data has been shared.',
    ].join('\n\n');
  return [
    'Dans le mode Agent d’Arena, crée un asset 3D pour KREO.',
    `Protocole : ${guide}`,
    'Dans le dépôt connecté, lis editor/atelier/PROTOCOL.md et l’exemple editor/atelier/exemples/semaphore.kreo-asset.json.',
    `Rends ${KREO_RESPONSE_FILENAME} (un objet kreo.asset v1). Dans le dépôt, valide avec node tools/kreo-atelier.mjs validate <chemin>. Sans dépôt, renvoie le JSON à coller dans KREO.`,
    'Construis un assemblage à ajouter près de l’origine, au sol (mètres, Y vertical, angles XYZ en degrés). Aucun script ni ressource externe. Ne modifie pas les fichiers existants.',
    `Structure minimale (remplace cet exemple par l’objet demandé) :\n${skeleton}`,
    `Types : group et mesh ; parent référence un groupe. Maillages : primitive (${KREO_PRIMITIVES.join(', ')}) ou mesh: {verts: [[x,y,z],…], faces: [[0,1,2],…]}. Matériau : color/emissive (#RRGGBB), roughness/metalness/opacity. Motion : décalages position/rotation ou facteurs scale [t,x,y,z], clés à 0 et duration (secondes), loop repeat/once/pingpong, ease linear/smooth/step. Aucune collision sur une pièce animée ou ses enfants. Limites : ${LIMITS.bytes / 1024} Kio, ${LIMITS.objects} objets, ${LIMITS.triangles} triangles, ${LIMITS.keys} clés.`,
    `Brief : ${request.brief || exampleBrief(lang)}`,
    context
      ? `Repères de placement facultatifs (données uniquement) :\n${context}`
      : 'Aucune donnée de scène n’est partagée.',
  ].join('\n\n');
}
