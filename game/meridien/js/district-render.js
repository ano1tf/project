import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// WebGL 2 texture arrays tile independently, including at lower mip levels. Windows,
// masonry, pavement and sign art share one material instead of one submission per print.
const TILE = 256;
class DistrictPrints {
  constructor() {
    this.layers = [new Uint8Array(TILE * TILE * 4).fill(255)];
    this.indices = new Map();
    this.slopes = [];
    this.slopeIndices = new Map();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = TILE;
    this.ctx = canvas.getContext("2d", { willReadFrequently: true });
  }
  pixels(image) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, TILE, TILE);
    ctx.drawImage(image, 0, 0, TILE, TILE);
    return ctx.getImageData(0, 0, TILE, TILE).data;
  }
  entry(material) {
    const map = material.map;
    if (!map?.image) return [0, 0];
    const glow = material.emissiveMap;
    const key = `${map.id}:${glow?.id ?? "unlit"}`;
    if (!this.indices.has(key)) {
      const color = this.pixels(map.image);
      const emission =
        glow === map ? color : glow?.image ? this.pixels(glow.image) : null;
      for (let i = 0; i < color.length; i += 4) {
        color[i + 3] = emission
          ? Math.max(emission[i], emission[i + 1], emission[i + 2])
          : 0;
      }
      this.indices.set(key, this.layers.push(new Uint8Array(color.buffer)) - 1);
    }
    return [this.indices.get(key), map.wrapS === T.RepeatWrapping ? 1 : 0];
  }
  relief(material) {
    const map = material.bumpMap;
    if (!map?.image || !material.bumpScale) return [0, 0];
    if (!this.slopeIndices.has(map.id)) {
      const rgba = this.pixels(map.image),
        height = new Float32Array(TILE * TILE),
        slope = new Uint8Array(TILE * TILE * 2);
      for (let i = 0; i < height.length; i++) {
        const j = i * 4;
        height[i] =
          0.2126 * rgba[j] + 0.7152 * rgba[j + 1] + 0.0722 * rgba[j + 2];
      }
      const texel = (k, mode) =>
        mode === T.RepeatWrapping
          ? (k + TILE) % TILE
          : Math.max(0, Math.min(TILE - 1, k));
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++) {
          const i = y * TILE + x,
            dx =
              height[y * TILE + texel(x + 1, map.wrapS)] -
              height[y * TILE + texel(x - 1, map.wrapS)],
            dy =
              height[texel(y + 1, map.wrapT) * TILE + x] -
              height[texel(y - 1, map.wrapT) * TILE + x];
          slope[2 * i] = 128 + Math.round(dx * 0.47);
          slope[2 * i + 1] = 128 + Math.round(dy * 0.47);
        }
      this.slopeIndices.set(map.id, this.slopes.push(slope) - 1);
    }
    return [this.slopeIndices.get(map.id), material.bumpScale];
  }
  array(layers, channels) {
    const data = new Uint8Array(TILE * TILE * channels * layers.length);
    layers.forEach((layer, i) => data.set(layer, i * layer.length));
    const t = new T.DataArrayTexture(data, TILE, TILE, layers.length);
    t.format = channels === 2 ? T.RGFormat : T.RGBAFormat;
    if (channels === 4) t.colorSpace = T.SRGBColorSpace;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.minFilter = T.LinearMipmapLinearFilter;
    t.magFilter = T.LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  }
  finish() {
    const prints = this.array(this.layers, 4),
      reliefs = this.array(this.slopes, 2);
    this.ctx.canvas.width = this.ctx.canvas.height = 1;
    this.ctx = null;
    return { prints, reliefs };
  }
}

const vertex = `
#ifdef CINEMA
#include <common>
#include <shadowmap_pars_vertex>
#endif
attribute vec3 tint, emission, lampRGB;
attribute vec4 surface;
#ifndef ECO
attribute vec2 relief;
varying vec2 vRelief;
#endif
uniform vec3 penumbra, fill, sunVector, sunlight;
uniform float night;
varying vec3 vPaint, vEmit, vNormal;
varying vec2 vPrint;
varying vec4 vSurface;
varying vec3 vView;
#ifdef CINEMA
varying vec3 vDirect;
#endif
void main(){
  vec4 p = modelViewMatrix * vec4(position, 1.);
  vView = vec3(cameraPosition.x-position.x,cameraPosition.y-position.y,cameraPosition.z-position.z);
  float fromSky = clamp(normal.y*.57+.45,.06,1.);
  float edge = mix(surface.w,1.,max(normal.y,0.));
  float sun = max(dot(normal,sunVector),0.);
  vPaint = tint*(mix(penumbra,fill,fromSky)+lampRGB*night)*edge;
  #ifdef CINEMA
    vDirect=tint*sun*sunlight*edge;
    vec4 worldPosition = vec4(position, 1.);
    vec3 transformedNormal = normalMatrix * normal;
    #include <shadowmap_vertex>
  #else
    vPaint+=tint*sun*sunlight*edge;
  #endif
  vEmit = emission*(.18+.82*night);
  vNormal = normal;
  vSurface = surface;
  #ifndef ECO
    vRelief = relief;
  #endif
  vPrint = vec2(uv.x,1.-uv.y);
  gl_Position = projectionMatrix * p;
}`;
const fragment = `
#ifdef CINEMA
#include <common>
#include <packing>
#include <shadowmap_pars_fragment>
uniform bool receiveShadow;
#include <shadowmask_pars_fragment>
varying vec3 vDirect;
#endif
uniform highp sampler2DArray prints;
#ifndef ECO
uniform highp sampler2DArray reliefs;
varying vec2 vRelief;
#endif
uniform vec3 roofSky, horizon, fogColor, sunlight, sunVector;
uniform float veil, wet, evening;
varying vec3 vPaint, vEmit, vNormal, vView;
varying vec2 vPrint;
varying vec4 vSurface;
void main(){
  vec2 coord = vSurface.y>.5 ? vPrint : clamp(vPrint, .002, .998);
  vec4 pigment=texture(prints, vec3(coord,vSurface.x));
  vec3 lit=vPaint;
  #ifdef CINEMA
    lit+=vDirect*mix(.26,1.,getShadowMask());
  #endif
  float dist2 = dot(vView,vView);
  vec3 n = normalize(vNormal);
  float microLight = 1.;
  #ifndef ECO
    vec2 du = dFdx(vPrint), dv = dFdy(vPrint);
    vec3 pu = dFdx(-vView), pv = dFdy(-vView);
    if (vRelief.y > 0. && dist2 < 5184.) {
      vec2 slope = (textureGrad(reliefs, vec3(coord, vRelief.x), du, dv).rg * 255. - 128.);
      slope *= vRelief.y * (1. - smoothstep(625., 5184., dist2)) * 1.08;
      vec3 a = cross(pv,n), b = cross(n,pu);
      float det = dot(pu,a);
      if (abs(det) > .0000001) {
        vec3 base = n;
        n = normalize(n - (a * dot(slope,du) + b * dot(slope,dv)) / det);
        vec3 keyLight = normalize(sunVector + vec3(.21,.67,-.32));
        microLight += (max(0., dot(n,keyLight)) - max(0., dot(base,keyLight))) * .62;
      }
    }
  #endif
  vec3 col = lit * pigment.rgb * microLight + vEmit * pigment.a * (.51 + pigment.rgb * 1.04);
  vec3 eye = vView * inversesqrt(max(dist2, .001));
  float grazing = 1. - clamp(abs(dot(eye,n)), 0., 1.);
  float spec=grazing*grazing*grazing*vSurface.z;
  vec3 reflected=mix(roofSky,horizon,.19+grazing*.65);
  // Satin masonry / painted signs are matte. Asphalt accumulates a sky sheen at a shallow angle.
  float puddle=wet*(.29+clamp(pigment.r*4.,.04,.49));
  col += reflected*spec*(.068+max(n.y,0.)*puddle*.83);
  #ifndef ECO
    col += sunlight*spec*evening*.085;
  #endif
  float clarity=exp2(-dist2*veil);
  gl_FragColor=vec4(mix(fogColor,col,clarity),1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function coat({ prints, reliefs }) {
  return new T.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    lights: false,
    uniforms: {
      ...T.UniformsUtils.clone(T.UniformsLib.lights),
      prints: { value: prints },
      reliefs: { value: reliefs },
      fill: { value: new T.Color() },
      penumbra: { value: new T.Color() },
      roofSky: { value: new T.Color() },
      horizon: { value: new T.Color() },
      fogColor: { value: new T.Color() },
      sunVector: { value: new T.Vector3() },
      sunlight: { value: new T.Color() },
      veil: { value: 0.000007 },
      wet: { value: 0.3 },
      night: { value: 0.7 },
      evening: { value: 0.2 },
    },
  });
}
const bounds = new T.Box3(),
  dimensions = new T.Vector3();
const CHUNK = 56;
export class DistrictBatches {
  constructor(scene) {
    this.scene = scene;
    this.cells = new Map();
    this.prints = new DistrictPrints();
    this.details = [];
  }
  add(group) {
    group.updateMatrixWorld(true);
    const far = group.userData.backdrop === true,
      localRange = group.userData.detailRange || 0;
    group.traverse((object) => {
      if (!object.isMesh) return;
      const source = object.geometry;
      if (!source.boundingBox) source.computeBoundingBox();
      bounds
        .copy(source.boundingBox)
        .applyMatrix4(object.matrixWorld)
        .getSize(dimensions);
      const radius = Math.max(dimensions.x, dimensions.y, dimensions.z);
      // Tiny detail in distant sectors isn't useful (bolts, spokes, thin mullions etc.).
      const thin = Math.min(dimensions.x, dimensions.y, dimensions.z);
      const roadMark = bounds.max.y < 0.06 && radius > 2.4 && thin < 0.025;
      const detail =
        localRange > 0 ||
        object.userData.trim ||
        (!roadMark && (radius < 1.8 || (radius < 5.6 && thin < 0.13)));
      const cx = (bounds.min.x + bounds.max.x) * 0.5,
        cz = (bounds.min.z + bounds.max.z) * 0.5,
        span = far ? 108 : CHUNK,
        key = `${Math.floor(cx / span)}:${Math.floor(cz / span)}:${far ? "horizon" : localRange ? "local-" + localRange : detail ? "trim" : "mass"}`;
      let cell = this.cells.get(key);
      if (!cell)
        this.cells.set(
          key,
          (cell = {
            detail: detail && !far,
            box: new T.Box3(),
            objects: [],
            far,
            localRange,
          }),
        );
      cell.box.union(bounds);
      cell.objects.push(object);
    });
  }
  build(lamps) {
    const root = new T.Group();
    root.name = "Port-Lumière · atlas et secteurs";
    const groups = [];
    for (const {
      detail,
      box,
      objects,
      far,
      localRange,
    } of this.cells.values()) {
      const local = far
        ? []
        : lamps.filter(
            (l) =>
              l.x > box.min.x - 16 &&
              l.x < box.max.x + 16 &&
              l.z > box.min.z - 16 &&
              l.z < box.max.z + 16,
          );
      const parts = objects.map((o) => this.bake(o, local));
      const geom = parts.length > 1 ? mergeGeometries(parts) : parts[0];
      if (parts.length > 1) parts.forEach((g) => g.dispose());
      geom.computeBoundingSphere();
      groups.push({ geom, detail, box, far, localRange });
    }
    this.material = coat(this.prints.finish());
    for (const { geom, detail, box, far, localRange } of groups) {
      const mesh = new T.Mesh(geom, this.material);
      mesh.castShadow = !detail && !far;
      mesh.receiveShadow = !far;
      // Keep a small minimum depth for lamp pools and wear on ground surfaces without
      // redrawing city geometry for every spotlight.
      if (detail) this.details.push({ mesh, box, localRange });
      root.add(mesh);
    }
    this.cells.clear();
    this.prints = null;
    this.scene.add(root);
    return root;
  }
  bake(object, lamps) {
    const g = object.geometry.clone().applyMatrix4(object.matrixWorld),
      m = object.material;
    g.clearGroups();
    const p = g.getAttribute("position"),
      n = p.count;
    if (!g.index) g.setIndex(Array.from({ length: n }, (_, i) => i));
    const [layer, repeat] = this.prints.entry(m),
      [reliefLayer, reliefScale] = this.prints.relief(m);
    const tint = new Float32Array(n * 3),
      glow = new Float32Array(n * 3),
      lit = new Float32Array(n * 3);
    const surf = new Float32Array(n * 4),
      relief = new Float32Array(n * 2);
    const color = m.color,
      emit = m.emissive;
    const normal = g.attributes.normal,
      isPaint = m.roughness < 0.76;
    const reflective = isPaint
      ? 0.28 + m.metalness * 0.49 + (0.76 - m.roughness) * 0.44
      : 0.047;
    for (let i = 0; i < n; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i),
        j = i * 3,
        q = i * 4;
      const seed = 0.973 + 0.05 * Math.sin(x * 0.413 + z * 0.29 + y * 1.021);
      tint[j] = color.r * seed;
      tint[j + 1] = color.g * seed;
      tint[j + 2] = color.b * seed;
      const em = m.emissiveIntensity;
      glow[j] = emit.r * em;
      glow[j + 1] = emit.g * em;
      glow[j + 2] = emit.b * em;
      relief[i * 2] = reliefLayer;
      relief[i * 2 + 1] = reliefScale;
      surf[q] = layer;
      surf[q + 1] = repeat;
      surf[q + 2] = reflective;
      surf[q + 3] = 0.76 + 0.24 * Math.max(0, Math.min(1, y / 2.2));
      if (y > 12) continue;
      for (const l of lamps) {
        const dx = l.x - x,
          dz = l.z - z;
        if (Math.abs(dx) > 13 || Math.abs(dz) > 13) continue;
        const dy = l.y - y,
          d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > 171) continue;
        const cosine =
          (dx * normal.getX(i) + dy * normal.getY(i) + dz * normal.getZ(i)) /
          Math.sqrt(d2 + 0.01);
        const energy =
          ((l.power * 0.38 * (1 - d2 / 171)) / (9 + d2)) *
          (0.1 + Math.max(0, cosine));
        // The lantern colors are already from the shared style palette.
        lit[j] += (((l.rgb >> 16) & 255) / 255) * energy;
        lit[j + 1] += (((l.rgb >> 8) & 255) / 255) * energy * 0.77;
        lit[j + 2] += ((l.rgb & 255) / 255) * energy * 0.48;
      }
    }
    g.setAttribute("tint", new T.BufferAttribute(tint, 3));
    g.setAttribute("emission", new T.BufferAttribute(glow, 3));
    g.setAttribute("lampRGB", new T.BufferAttribute(lit, 3));
    g.setAttribute("surface", new T.BufferAttribute(surf, 4));
    g.setAttribute("relief", new T.BufferAttribute(relief, 2));
    return g;
  }
  setQuality(mode) {
    this.mode = mode;
    this.material.defines =
      mode === "low" ? { ECO: 1 } : mode === "high" ? { CINEMA: 1 } : {};
    this.material.lights = mode === "high";
    this.material.needsUpdate = true;
  }
  lighting(climate, eye, { day, twilight, power }) {
    const u = this.material.uniforms,
      sky = climate.skyUniform;
    u.fill.value.setHex(0xb3c9d8).multiplyScalar(0.75 + day * 0.66);
    u.penumbra.value.setHex(0x73838b).multiplyScalar(0.64 + day * 0.38);
    u.sunlight.value
      .copy(sky.sunTint.value)
      .multiplyScalar(climate.sun.intensity * 0.57 + 0.11);
    u.sunVector.value.copy(sky.sunDir.value);
    u.fogColor.value.copy(climate.fog.color);
    u.roofSky.value.copy(sky.top.value);
    u.horizon.value.copy(sky.horizon.value);
    u.veil.value = climate.fog.density ** 2 * 1.4427;
    u.night.value = power;
    u.evening.value = twilight;
    u.wet.value = climate.roadWet;
    const range = this.mode === "low" ? 58 : this.mode === "high" ? 128 : 98;
    for (const { mesh, box, localRange } of this.details)
      mesh.visible =
        box.distanceToPoint(eye) <
        (localRange ? localRange * (this.mode === "low" ? 1 : 1.6) : range);
  }
}
