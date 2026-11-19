import { parseKreoAsset } from "../../../editor/atelier/asset-format.mjs";
import { buildKreoAssembly } from "../../../editor/atelier/assembly.js";

// This is the same editable file handed off by the Atelier, not a second model or a script.
const source = new URL(
  "../../../editor/atelier/exemples/semaphore.kreo-asset.json",
  import.meta.url,
);

export async function loadSemaphore(site) {
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Sémaphore · HTTP ${response.status}`);
  const { asset } = parseKreoAsset(await response.text());
  const assembly = buildKreoAssembly(asset);
  assembly.root.position.set(site.x, site.baseY, site.z);
  assembly.root.rotation.y = site.yaw;
  assembly.root.scale.setScalar(site.scale);
  assembly.sample(0);
  return assembly;
}
