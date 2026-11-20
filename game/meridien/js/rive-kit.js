import * as T from "three";
import { parseKreoAsset } from "../../../editor/atelier/asset-format.mjs";
import { buildKreoAssembly } from "../../../editor/atelier/assembly.js";
import { coalesce } from "./port-kit.js";

const source = new URL(
  "../../../editor/atelier/exemples/atelier-des-greves.kreo-asset.json",
  import.meta.url,
);
const groups = ["bench", "rack", "locker"];
export async function readGreves() {
  const r = await fetch(source);
  if (!r.ok) throw Error(`Atelier des Grèves · HTTP ${r.status}`);
  const { asset } = parseKreoAsset(await r.text());
  if (
    !groups.every((id) =>
      asset.objects.some((o) => o.id === id && o.type === "group"),
    )
  )
    throw Error("Groupes de l’atelier incomplets.");
  return asset;
}
export function makeGreves(asset) {
  const kit = buildKreoAssembly(asset);
  for (const id of groups) coalesce(kit.nodes.get(id));
  kit.nodes = new Map(groups.map((id) => [id, kit.nodes.get(id)]));
  // No auxiliary PBR materials to keep alive between streaming cycles.
  kit.root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    o.material = new T.MeshLambertMaterial({
      color: m.color,
      emissive: m.emissive,
      side: m.side,
    });
    o.receiveShadow = false;
    m.dispose();
  });
  return kit;
}
