import * as T from 'three';
import { MESH_PRIMS, cloneMesh, meshToGeometry } from '../mesh.js';
import { createKreoMotion, linkKreoScene } from './animation.mjs';

export function kreoAssetObjects(asset) {
  return asset.objects.map((o) => {
    if (o.type === 'group') return { ...o, collidable: false };
    const { primitive, ...props } = o;
    return { ...props, mesh: primitive ? MESH_PRIMS[primitive]() : cloneMesh(o.mesh) };
  });
}

// The modal and games outside KREO Runtime can play exactly the same data.
export function buildKreoAssembly(asset) {
  const root = new T.Group(),
    nodes = new Map(),
    clips = [];
  root.name = asset.name;
  const defs = kreoAssetObjects(asset);
  for (const p of defs) {
    const node =
      p.type === 'group'
        ? new T.Group()
        : new T.Mesh(
            meshToGeometry(p.mesh, {}),
            new T.MeshStandardMaterial({
              ...p.material,
              flatShading: true,
              side: T.DoubleSide,
              transparent: p.material.opacity < 1,
              depthWrite: p.material.opacity === 1,
            }),
          );
    node.name = p.name;
    node.position.set(...p.position);
    node.rotation.set(...p.rotation.map(T.MathUtils.degToRad));
    node.scale.set(...p.scale);
    if (node.isMesh) node.receiveShadow = true;
    nodes.set(p.id, node);
    root.add(node);
  }
  linkKreoScene(defs, (id) => nodes.get(id));
  for (const p of defs) {
    const clip = createKreoMotion(nodes.get(p.id), p.motion);
    if (clip) clips.push(clip);
  }
  return {
    root,
    nodes,
    sample(time) {
      for (const clip of clips) clip.sample(time);
    },
    dispose() {
      root.removeFromParent();
      root.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.dispose();
        o.material.dispose();
        if (o.userData.baseMaterial && o.userData.baseMaterial !== o.material)
          o.userData.baseMaterial.dispose();
      });
      nodes.clear();
      clips.length = 0;
    },
  };
}
