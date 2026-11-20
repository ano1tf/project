import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { parseKreoAsset } from "../../../editor/atelier/asset-format.mjs";
import { buildKreoAssembly } from "../../../editor/atelier/assembly.js";

const source = new URL(
  "../../../editor/atelier/exemples/comptoir-12.kreo-asset.json",
  import.meta.url,
);

// Keep the editable parts in the source Kreo file. In-game, merge opaque
// pieces that share a finish, without combining independent visibility states.
export function coalesce(group) {
  const keyed = new Map();
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();
  for (const node of [...group.children]) {
    if (!node.isMesh || node.material.transparent) continue;
    const m = node.material;
    const k = [
      m.color.getHex(),
      m.emissive.getHex(),
      m.roughness,
      m.metalness,
    ].join(":");
    if (!keyed.has(k)) keyed.set(k, []);
    keyed.get(k).push(node);
  }
  for (const parts of keyed.values()) {
    if (parts.length === 1) continue;
    const shapes = parts.map((m) =>
      m.geometry.clone().applyMatrix4(inv.clone().multiply(m.matrixWorld)),
    );
    const geo = mergeGeometries(shapes);
    shapes.forEach((g) => g.dispose());
    if (!geo) continue;
    const mesh = new T.Mesh(geo, parts[0].material);
    mesh.receiveShadow = true;
    group.add(mesh);
    parts.forEach((node, i) => {
      node.removeFromParent();
      node.geometry.dispose();
      if (i) node.material.dispose();
    });
  }
}
export async function loadPortKit() {
  const response = await fetch(source);
  if (!response.ok) throw Error(`Comptoir 12 · HTTP ${response.status}`);
  const { asset } = parseKreoAsset(await response.text());
  const kit = buildKreoAssembly(asset);
  const groups = ["facade", "interior", "shutter", "reserve"];
  if (!groups.every((id) => kit.nodes.get(id)?.isGroup)) {
    kit.dispose();
    throw Error(
      "Le lot Comptoir 12 ne possède pas les quatre groupes attendus.",
    );
  }
  for (const id of groups) coalesce(kit.nodes.get(id));
  kit.nodes = new Map(groups.map((id) => [id, kit.nodes.get(id)]));
  kit.nodes.get("facade").traverse((o) => {
    if (o.isMesh && !o.material.transparent) o.castShadow = true;
  });
  for (const o of kit.nodes.get("shutter").children) o.castShadow = true;
  return kit;
}
