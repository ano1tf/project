/* ============================================================
   KREO ARENA — SLOT POST-TRAITEMENT (post.js)
   Pipeline HDR complet : rendu linéaire (HalfFloat + MSAA) →
   GTAO (occlusion ambiante) → bloom physique → grading
   cinéma (contraste, saturation, vignette, aberration, grain,
   netteté) → ACES + sRGB via OutputPass.

   Tout le jeu passe par post.render() — plus de renderer.render()
   direct, sinon le post-processing est perdu.
   ============================================================ */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

/* ---------- Pass « calque » : rendu additionnel dans le buffer HDR ---------- */
// Sert au viewmodel d'arme : il doit passer par le tonemapping et le grading,
// et rester devant le décor (clearDepth) — impossible en rendu final direct.
class LayerPass extends Pass {
  constructor(renderFn) {
    super();
    this.needsSwap = false;
    this.renderFn = renderFn;
  }
  render(renderer, writeBuffer) {
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.setRenderTarget(writeBuffer);
    renderer.autoClear = false;
    renderer.clearDepth();
    this.renderFn(renderer);
    renderer.autoClear = prevAutoClear;
    renderer.setRenderTarget(prevTarget);
  }
}

/* ---------- Grading cinéma ---------- */
const GradeShader = {
  name: 'KreoGrade',
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    time: { value: 0 },
    contrast: { value: 1.06 },
    saturation: { value: 1.1 },
    lift: { value: new THREE.Vector3(0.004, 0.008, 0.02) },
    gain: { value: new THREE.Vector3(1.03, 1.0, 0.97) },
    vignette: { value: 0.4 },
    grain: { value: 0.028 },
    sharpen: { value: 0.25 },
    aberration: { value: 0.0008 },
    damage: { value: 0 },
    hitFlash: { value: 0 }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float time, contrast, saturation, vignette, grain, sharpen, aberration, damage, hitFlash;
    uniform vec3 lift, gain;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);

      // aberration chromatique radiale (s'intensifie quand on est touché)
      float ab = aberration * (0.35 + r2 * 2.6) * (1.0 + damage * 6.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ab).b;

      // netteté (unsharp mask léger)
      if (sharpen > 0.0) {
        vec2 px = 1.0 / resolution;
        vec3 blur = (
          texture2D(tDiffuse, uv + vec2(px.x, 0.0)).rgb +
          texture2D(tDiffuse, uv - vec2(px.x, 0.0)).rgb +
          texture2D(tDiffuse, uv + vec2(0.0, px.y)).rgb +
          texture2D(tDiffuse, uv - vec2(0.0, px.y)).rgb
        ) * 0.25;
        col += (col - blur) * sharpen;
      }

      // contraste
      col = (col - 0.5) * contrast + 0.5;

      // lift / gain (ombres froides, hautes lumières chaudes)
      col = col * gain + lift * max(0.0, 1.0 - col);

      // saturation
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(lum), col, saturation);

      // vignette
      float vig = smoothstep(0.9, 0.16, r2 * 1.5);
      col *= mix(1.0, vig, vignette);

      // feedback de combat sur les bords
      float edge = smoothstep(0.1, 0.6, r2 * 1.8);
      col = mix(col, vec3(0.5, 0.02, 0.03), edge * damage * 0.8);
      col = mix(col, vec3(0.05, 0.4, 0.5), edge * hitFlash * 0.45);

      // grain animé
      float g = hash(uv * resolution + fract(time) * 91.7) - 0.5;
      col += g * grain * (0.5 + lum * 0.7);

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`
};

export class PostFX {
  /**
   * @param {Object} o
   * @param {'night'|'day'} [o.mood='night'] — préréglage de grading
   */
  constructor({ renderer, scene, camera, low = false, mood = 'night' }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.low = low;
    this.mood = mood;
    this.enabled = !low;

    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    // taille en pixels physiques : le composer travaille dans cette unité
    const W = Math.max(1, Math.round(size.x * pr));
    const H = Math.max(1, Math.round(size.y * pr));

    // Cible HDR + MSAA : sans HalfFloat, bloom et AO travaillent sur 8 bits écrêtés
    const rt = new THREE.WebGLRenderTarget(W, H, {
      type: THREE.HalfFloatType,
      samples: low ? 0 : 4,
      colorSpace: THREE.LinearSRGBColorSpace
    });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.setPixelRatio(1);          // les buffers sont déjà en px physiques
    this.composer.setSize(W, H);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // Occlusion ambiante (contacts, coins, sous les caisses)
    this.ao = new GTAOPass(scene, camera, W, H);
    this.ao.output = GTAOPass.OUTPUT.Default;
    this.ao.blendIntensity = mood === 'day' ? 0.55 : 0.9;
    this.ao.updateGtaoMaterial({
      radius: mood === 'day' ? 1.4 : 0.55,
      distanceExponent: 1.4,
      thickness: mood === 'day' ? 2.0 : 1.4,
      scale: 1.0, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false
    });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    this.composer.addPass(this.ao);

    // Bloom : seuil bas → néons, flammes, visières rayonnent
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(W, H),
      mood === 'day' ? 0.22 : 0.5,
      mood === 'day' ? 0.55 : 0.7,
      mood === 'day' ? 1.15 : 0.75
    );
    this.composer.addPass(this.bloom);

    this.grade = new ShaderPass(GradeShader);
    // jour : plus de contraste, plus saturé, vignette discrète
    if (mood === 'day') {
      const u = this.grade.uniforms;
      u.contrast.value = 1.1;
      u.saturation.value = 1.18;
      u.vignette.value = 0.24;
      u.grain.value = 0.016;
      u.sharpen.value = 0.32;
      u.aberration.value = 0.0005;
      u.lift.value.set(0.0, 0.004, 0.012);
      u.gain.value.set(1.02, 1.0, 0.99);
    }
    this.grade.uniforms.resolution.value.set(W, H);
    this.composer.addPass(this.grade);

    // Antialiasing : MSAA natif en qualité haute, SMAA en qualité faible
    if (low) {
      this.smaa = new SMAAPass();
      this.composer.addPass(this.smaa);
    }
    if (this.layerPass) this.composer.addPass(this.layerPass);

    // ACES + sRGB — doit rester le dernier pass
    this.composer.addPass(new OutputPass());

    this._shakeAmt = 0;
    this._shakeRoll = 0;
  }

  shake(amount) { this._shakeAmt = Math.max(this._shakeAmt, amount); }
  setDamage(v) { this.grade.uniforms.damage.value = v; }
  setHitFlash(v) { this.grade.uniforms.hitFlash.value = v; }

  /**
   * Ajoute un rendu « en calque » (ex. viewmodel) avant le bloom et le grading.
   * @param {(renderer: WebGLRenderer) => void} fn
   */
  setLayerRenderer(fn) {
    if (this.layerPass) {
      this.layerPass.renderFn = fn;
      return;
    }
    this.layerPass = new LayerPass(fn);
    // inséré juste après le rendu de la scène principale (avant AO, bloom, grading)
    this.composer.insertPass(this.layerPass, 1);
  }

  resize() {
    const size = this.renderer.getSize(new THREE.Vector2());
    const pr = this.renderer.getPixelRatio();
    const W = Math.max(1, Math.round(size.x * pr));
    const H = Math.max(1, Math.round(size.y * pr));
    this.composer.setSize(W, H);
    this.grade.uniforms.resolution.value.set(W, H);
    this.ao.setSize(W, H);
    this.bloom.setSize(W, H);
  }

  /* ---------- Rendu ---------- */
  render(rawDt, time) {
    const cam = this.camera;
    const gameDt = rawDt;   // dt gameplay (le hitstop est géré côté Juice)

    this.grade.uniforms.time.value = time;

    if (!this.enabled) {
      this.renderer.render(this.scene, cam);
      return;
    }

    // Screenshake : on décale la caméra, on rend, on restaure.
    // (Le viewmodel est enfant de la caméra : il tremble avec elle, comme en AAA.)
    let shook = false;
    const px = cam.position.x, py = cam.position.y, pz = cam.position.z;
    const rz = cam.rotation.z;
    if (this._shakeAmt > 0.0004) {
      const a = this._shakeAmt;
      cam.position.x = px + (Math.random() - 0.5) * a;
      cam.position.y = py + (Math.random() - 0.5) * a;
      cam.rotation.z = rz + (Math.random() - 0.5) * a * 0.3;
      cam.updateMatrixWorld(true);
      this._shakeAmt *= Math.pow(0.0006, gameDt);
      if (this._shakeAmt < 0.0004) this._shakeAmt = 0;
      shook = true;
    }

    this.composer.render(gameDt);

    if (shook) {
      cam.position.set(px, py, pz);
      cam.rotation.z = rz;
      cam.updateMatrixWorld(true);
    }
  }
}
