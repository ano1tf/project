import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  parseKreoAsset,
  validateKreoAsset,
  KREO_ASSET_LIMITS as LIMITS,
} from '../editor/atelier/asset-format.mjs';
import { createKreoMotion, linkKreoScene } from '../editor/atelier/animation.mjs';
import { createKreoRequest, arenaPrompt } from '../editor/atelier/request.mjs';

const sample = await readFile(
  new URL('../editor/atelier/exemples/semaphore.kreo-asset.json', import.meta.url),
  'utf8',
);
const pivot = {
  id: 'pivot',
  type: 'group',
  position: [0, 2, 0],
  motion: {
    duration: 4,
    rotation: [
      [0, 0, 0, 0],
      [4, 0, 360, 0],
    ],
  },
};
const blade = { id: 'blade', parent: 'pivot', type: 'mesh', primitive: 'box', position: [1, 0, 0] };
const lot = (objects = [blade, pivot]) =>
  structuredClone({ format: 'kreo.asset', version: 1, name: 'Un sémaphore', objects });

// Tests exercise the same parser used in the browser, not a second schema.
test('read the shared sample, fenced responses and normalized round trips', () => {
  const { asset, stats } = parseKreoAsset('```json\n' + sample + '```');
  assert.equal(asset.name, 'Sémaphore des Marées');
  assert.equal(stats.meshes, 24);
  assert.equal(stats.clips, 2);
  assert.equal(stats.keys, 4);
  assert.equal(stats.duration, 12);
  assert.deepEqual(parseKreoAsset(JSON.stringify(asset)).asset, asset);
});

test('require exactly one bounded JSON object and no unknown fields', () => {
  assert.throws(() => parseKreoAsset('blah ' + sample), /JSON illisible/);
  assert.throws(() => parseKreoAsset('"' + 'é'.repeat(LIMITS.bytes / 2) + '"'), /maximum/);
  assert.throws(() => validateKreoAsset({ ...lot(), version: 2 }), /version 1/);
  assert.throws(
    () => validateKreoAsset(lot([{ ...blade, script: 'non pris en charge' }, pivot])),
    /champ interdit.*script/,
  );
  assert.throws(
    () => validateKreoAsset(lot([pivot, { ...blade, material: { texture: 'elsewhere.png' } }])),
    /champ interdit.*texture/,
  );
  assert.throws(
    () => validateKreoAsset(lot([pivot, { ...blade, type: 'player' }])),
    /group \| mesh/,
  );
  assert.throws(
    () =>
      validateKreoAsset(
        lot(Array.from({ length: LIMITS.objects + 1 }, (_, i) => ({ ...blade, id: `b${i}` }))),
      ),
    /96 éléments/,
  );
});

test('resolve parents in any order, reject duplicates, cycles and excessive depth', () => {
  assert.equal(validateKreoAsset(lot()).asset.objects[0].parent, 'pivot');
  assert.throws(() => validateKreoAsset(lot([blade])), /parent.*groupe/);
  assert.throws(() => validateKreoAsset(lot([blade, blade, pivot])), /doublon/);
  assert.throws(
    () =>
      validateKreoAsset(
        lot([blade, { ...pivot, parent: 'p2' }, { id: 'p2', type: 'group', parent: 'pivot' }]),
      ),
    /cycle/,
  );
  assert.throws(
    () => validateKreoAsset(lot([blade, { ...pivot, parent: 'blade' }])),
    /parent.*groupe/,
  );
  const chain = Array.from({ length: LIMITS.depth + 1 }, (_, i) => ({
    id: `p${i}`,
    parent: i ? `p${i - 1}` : null,
    type: 'group',
  }));
  assert.throws(
    () => validateKreoAsset(lot([...chain, { ...blade, parent: chain.at(-1).id }])),
    /trop profonde/,
  );
});

test('bound geometry and require compatible colliders and motion channels', () => {
  const raw = {
    id: 'geo',
    type: 'mesh',
    mesh: {
      verts: [
        [0, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      faces: [[0, 1, 2]],
    },
  };
  assert.equal(validateKreoAsset(lot([raw])).stats.triangles, 1);
  assert.throws(
    () => validateKreoAsset(lot([{ ...raw, mesh: { ...raw.mesh, faces: [[0, 1, 5]] } }])),
    /indices/,
  );
  assert.throws(() => validateKreoAsset(lot([{ ...blade, collidable: true }, pivot])), /animés/);
  assert.throws(
    () =>
      validateKreoAsset(lot([{ ...blade, parent: null, collidable: true, motion: pivot.motion }])),
    /animés/,
  );
  assert.throws(() => validateKreoAsset(lot([{ ...raw, scale: [1, 0, 1] }])), /scale/);
  assert.throws(
    () =>
      validateKreoAsset(
        lot([
          blade,
          {
            ...pivot,
            motion: {
              duration: 4,
              rotation: [
                [1, 0, 0, 0],
                [2, 20, 0, 0],
              ],
            },
          },
        ]),
      ),
    /t=0/,
  );
  assert.throws(
    () =>
      validateKreoAsset(
        lot([
          blade,
          {
            ...pivot,
            motion: {
              duration: 4,
              rotation: [
                [0, 0, 0, 0],
                [3, 15, 0, 0],
                [2, 22, 0, 0],
                [4, 30, 0, 0],
              ],
            },
          },
        ]),
      ),
    /croissants/,
  );
  const many = Array.from({ length: 33 }, (_, i) => ({
    id: `torus${i}`,
    type: 'mesh',
    primitive: 'torus',
  }));
  assert.throws(() => validateKreoAsset(lot(many)), /budget de triangles/);
  const track = Array.from({ length: 50 }, (_, t) => [t, 0, 1, 0]);
  const movers = Array.from({ length: 19 }, (_, i) => ({
    id: `g${i}`,
    type: 'group',
    motion: { duration: 49, position: track },
  }));
  assert.throws(() => validateKreoAsset(lot([raw, ...movers])), /budget de clés/);
});

function vector(x = 0, y = 0, z = 0) {
  return {
    x,
    y,
    z,
    set(x, y, z) {
      Object.assign(this, { x, y, z });
    },
  };
}

test('seek without drift in local coordinates; rotations can travel a full turn', () => {
  const root = { position: vector(3, 1, -4), scale: vector(2, 1, 2), rotation: vector(0.25, 0, 0) };
  const motion = createKreoMotion(root, {
    duration: 4,
    loop: 'repeat',
    position: [
      [0, 0, 0, 0],
      [4, 0, 2, 0],
    ],
    rotation: pivot.motion.rotation,
    scale: [
      [0, 1, 1, 1],
      [4, 2, 1, 0.5],
    ],
  });
  motion.sample(2);
  assert.equal(root.rotation.y, Math.PI);
  assert.equal(root.rotation.x, 0.25);
  assert.deepEqual([root.position.x, root.position.y, root.position.z], [3, 2, -4]);
  assert.deepEqual([root.scale.x, root.scale.y, root.scale.z], [3, 1, 1.5]);
  motion.sample(6);
  assert.equal(root.rotation.y, Math.PI);
  motion.sample(4);
  assert.equal(root.rotation.y, 0);
  assert.equal(root.position.y, 1);
});

test('hold, pingpong, smooth easing and step keys', () => {
  const node = { position: vector() },
    position = [
      [0, 0, 0, 0],
      [2, 0, 4, 0],
    ];
  const swing = createKreoMotion(node, { duration: 2, loop: 'pingpong', ease: 'smooth', position });
  swing.sample(0.5);
  assert.equal(node.position.y, 0.625);
  swing.sample(3.5);
  assert.equal(node.position.y, 0.625);
  swing.sample(2);
  assert.equal(node.position.y, 4);
  const step = createKreoMotion(node, { duration: 2, loop: 'once', ease: 'step', position });
  step.sample(1.9);
  assert.equal(node.position.y, 4); // bind pose captured at construction
  step.sample(39);
  assert.equal(node.position.y, 8);
});

test('restore current local offsets and do not construct cyclic graphs', () => {
  const node = () => ({
    position: vector(),
    add(n) {
      n.parent = this;
    },
  });
  const nodes = new Map(['part', 'pivot', 'assembly', 'bad-a', 'bad-b'].map((id) => [id, node()]));
  linkKreoScene(
    [
      { id: 'part', parent: 'pivot', position: [20, 10, 30], parentOffset: [1, 2, 3] },
      { id: 'pivot', parent: 'assembly', position: [0, 1, 0] },
      { id: 'assembly' },
      { id: 'bad-a', parent: 'bad-b' },
      { id: 'bad-b', parent: 'bad-a' },
    ],
    (id) => nodes.get(id),
  );
  assert.equal(nodes.get('part').parent, nodes.get('pivot'));
  assert.equal(nodes.get('pivot').parent, nodes.get('assembly'));
  assert.equal(nodes.get('part').position.x, 1);
  assert.equal(nodes.get('bad-a').parent, undefined);
  assert.equal(nodes.get('bad-b').parent, undefined);
});

test('build a self-contained prompt and share scene hints only by explicit scope', () => {
  const scope = {
    count: 1,
    level: 'niveau',
    objects: [
      {
        name: 'Privé',
        type: 'cube',
        world: [0, 1.2345, 2],
        size: [2, 2, 2],
        script: 'never include this',
        modelData: 'never include this',
      },
    ],
  };
  const guide = 'https://example.test/editor/atelier/#protocole';
  const request = createKreoRequest('  Balise.  ', 'none', scope);
  assert.deepEqual(request, { format: 'kreo.request', version: 1, brief: 'Balise.' });
  const prompt = arenaPrompt({ request, guide });
  assert.ok(
    prompt.includes(guide) &&
      prompt.includes('mode Agent') &&
      prompt.includes('"format":"kreo.asset"'),
  );
  assert.ok(!prompt.includes('Privé'));
  const sharing = createKreoRequest('Beacon', 'selection', scope);
  assert.equal(sharing.context.objects[0].world[1], 1.23);
  const en = arenaPrompt({ request: sharing, guide, lang: 'en' });
  assert.ok(en.includes('Agent Mode') && en.includes('Privé'));
  assert.ok(!en.includes('never include this'));
});
