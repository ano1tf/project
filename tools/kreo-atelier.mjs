#!/usr/bin/env node
// Same validation as the editor. Local files only; no script execution or writes.
import { createReadStream } from 'node:fs';
import { parseKreoAsset, KREO_ASSET_LIMITS } from '../editor/atelier/asset-format.mjs';

const [command, file, ...rest] = process.argv.slice(2);
if (command !== 'validate' || !file || rest.length) {
  console.error('Usage : node tools/kreo-atelier.mjs validate <fichier.kreo-asset.json>');
  process.exitCode = 2;
} else {
  try {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of createReadStream(file)) {
      bytes += chunk.length;
      if (bytes > KREO_ASSET_LIMITS.bytes) throw Error('JSON de 384 Kio maximum');
      chunks.push(chunk);
    }
    const { asset, stats } = parseKreoAsset(Buffer.concat(chunks).toString('utf8'));
    console.log(
      `OK · ${asset.name} · ${stats.meshes} maillages · ${stats.triangles} triangles · ${stats.clips} animations · ${stats.keys} clés`,
    );
  } catch (error) {
    console.error(`Lot refusé : ${error.message}`);
    process.exitCode = 1;
  }
}
