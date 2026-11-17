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
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/* ---------- Pass « calque » : viewmodel composé sur l'image HDR ---------- */
// Pourquoi un rendu séparé : dans la scène, l'arme hérite de l'exposition et du
// brouillard de la nuit — elle devenait un pavé noir. En la rendant dans sa
// propre cible (sa propre caméra, ses propres lumières) puis en la composant
// avant le bloom et le grading, elle garde une lecture nette de AAA.
class LayerPass extends Pass {
  constructor(renderFn) {
    super();
    this.needsSwap = false;
    this.renderFn = renderFn;
    // luminance du viewmodel : sans elle l'arme sature le bloom par-dessus
    this.exposure = 0.72;
    this._quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tLayer: { value: null },
        exposure: { value: 1 },
        overlay: { value: 0 }
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D tDiffuse;
        uniform sampler2D tLayer;
        uniform float exposure;
        uniform float overlay;
        varying vec2 vUv;
        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          vec4 lay = texture2D(tLayer, vUv);
          // Rolloff filmique sur le seul viewmodel : ses valeurs HDR dépassent
          // largement 1 (arme éclairée par son propre studio) et le bloom en
          // faisait un halo laiteux. C'est le rôle d'une passe d'arme dédiée :
          // exposer l'arme indépendamment du décor.
          vec3 vmCol = lay.rgb * exposure;
          vmCol = (vmCol / (1.0 + vmCol)) * 1.18;
          if (overlay > 0.5) {
            gl_FragColor = vec4(vmCol, lay.a);
          } else {
            gl_FragColor = vec4(mix(base.rgb, vmCol, lay.a), base.a);
          }
        }`,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.NormalBlending
    }));
  }

  // RenderPass écrit dans readBuffer (avec needsSwap = false) : le calque doit
  // écrire dans le même buffer, sinon il est ajouté à une cible qui sera
  // écrasée par la passe suivante.
  render(renderer, writeBuffer, readBuffer) {
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    // 1) le calque est dessiné dans sa propre cible (profondeur neuve)
    const layerRT = this.layerRT;
    if (layerRT) {
      this.renderFn(renderer);      // remplit layerRT
      // 2) composition sur l'image du décor, en gardant son alpha
      const mat = this._quad.material;
      mat.uniforms.tDiffuse.value = readBuffer.texture;
      mat.uniforms.tLayer.value = layerRT.texture;
      mat.uniforms.exposure.value = this.exposure;
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      renderer.autoClear = false;
      this._quad.render(renderer);
      // le résultat est dans writeBuffer : il faut maintenant l'échanger
      this.needsSwap = true;
    } else {
      renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
      renderer.autoClear = false;
      this.renderFn(renderer);
    }
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
    liftColor: { value: new THREE.Vector3(0.004, 0.008, 0.02) },
    gainColor: { value: new THREE.Vector3(1.03, 1.0, 0.97) },
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
    uniform vec3 liftColor, gainColor;
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
      col = col * gainColor + liftColor * clamp(1.0 - col, 0.0, 1.0);

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

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
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

    // Viewmodel : rendu en calque juste après la scène principale (avant AO,
    // bloom et grading) avec le depth nettoyé — il reste devant le décor tout
    // en profitant du tonemapping et du reste du pipeline.
    this.vmScene = null;
    // Caméra dédiée au viewmodel : même pose que la caméra du jeu, mais un
    // champ de vision plus étroit (58°) pour que l'arme ne paraisse pas
    // démesurée sur les bords de l'écran comme à 76°.
    this._vmCamera = new THREE.PerspectiveCamera(58, 16 / 9, 0.01, 6);
    // Calque viewmodel rendu à part (couleur + profondeur propres) : il est
    // ensuite composé sur l'image HDR avant le bloom. C'est ce qui permet à
    // l'arme d'être vive et contrastée même quand la scène est dans la nuit —
    // un rendu « dans » la scène hérite toujours de l'exposition du décor.
    this._vmRT = new THREE.WebGLRenderTarget(W, H, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      colorSpace: THREE.LinearSRGBColorSpace
    });
    this.layerPass = new LayerPass();
    this.layerPass.layerRT = this._vmRT;
    this.layerPass.renderFn = (r) => {
      if (this._layerHook) this._layerHook(r);
      const cam = this.camera;
      cam.updateMatrixWorld(true);
      const vmCam = this._vmCamera;
      vmCam.position.copy(cam.position);
      vmCam.quaternion.copy(cam.quaternion);
      vmCam.updateMatrixWorld(true);
      // une caméra hors du graphe de scène ne calcule pas cette matrice :
      // sans elle, tout le viewmodel est rejeté derrière le plan proche.
      vmCam.matrixWorldInverse.copy(vmCam.matrixWorld).invert();
      // le nœud racine reprend la pose de la caméra du jeu : l'arme est
      // modélisée en coordonnées caméra (x droite, y haut, -z avant)
      if (this.vmRoot) {
        this.vmRoot.position.copy(cam.position);
        this.vmRoot.quaternion.copy(cam.quaternion);
        this.vmRoot.updateMatrixWorld(true);
      }
      const prev = r.getRenderTarget();
      const prevClear = r.getClearColor(new THREE.Color());
      const prevAlpha = r.getClearAlpha();
      r.setRenderTarget(this._vmRT);
      r.setClearColor(0x000000, 0);
      r.clear(true, true, false);
      if (this.vmScene) r.render(this.vmScene, vmCam);
      r.setRenderTarget(prev);
      r.setClearColor(prevClear, prevAlpha);
      r.info.autoReset = true;
    };
    this.composer.addPass(this.layerPass);

    // Occlusion ambiante (contacts, coins, sous les caisses).
    // Calculée en demi-résolution : même lecture visuelle, 4× moins de pixels
    // de G-buffer et de dénoyage — c'est le poste le plus cher du pipeline.
    const aoW = Math.max(2, Math.round(W * 0.5));
    const aoH = Math.max(2, Math.round(H * 0.5));
    this.ao = new GTAOPass(scene, camera, aoW, aoH);
    this.ao.output = GTAOPass.OUTPUT.Default;
    this.ao.blendIntensity = mood === 'day' ? 0.45 : 0.75;
    this.ao.updateGtaoMaterial({
      radius: mood === 'day' ? 1.1 : 0.5,
      distanceExponent: 1.3,
      thickness: mood === 'day' ? 1.6 : 1.2,
      scale: 1.0, samples: 8, distanceFallOff: 1.0, screenSpaceRadius: false
    });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 1, samples: 8 });
    // Désactivée par défaut : elle coûte plus que tout le reste du pipeline
    // réuni. Le jeu l'active automatiquement sur une machine véloce, et la
    // coupe dès que les FPS baissent (adaptQuality).
    this.ao.enabled = false;
    this.composer.addPass(this.ao);

    // Bloom : seuil bas → néons, flammes, visières rayonnent
    // Seuil nuit plus haut : sinon c'est le ciel entier qui rayonne et la
    // moitié de l'image part en voile laiteux. Seuls les néons et flammes
    // doivent dépasser.
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(W, H),
      mood === 'day' ? 0.22 : 0.42,
      mood === 'day' ? 0.55 : 0.55,
      mood === 'day' ? 1.15 : 1.05
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
      u.liftColor.value.set(0.0, 0.004, 0.012);
      u.gainColor.value.set(1.02, 1.0, 0.99);
    }
    else {
      // nuit : plus de contraste, moins de voile → un vrai noir, pas du lilas
      const u = this.grade.uniforms;
      u.contrast.value = 1.16;
      u.saturation.value = 1.06;
      u.vignette.value = 0.5;
      u.liftColor.value.set(0.002, 0.005, 0.014);
      u.gainColor.value.set(1.04, 1.0, 0.95);
    }
    this.grade.uniforms.resolution.value.set(W, H);
    this.composer.addPass(this.grade);

    // Antialiasing : MSAA natif en qualité haute, SMAA en qualité faible
    if (low) {
      this.smaa = new SMAAPass();
      this.composer.addPass(this.smaa);
    }

    // ACES + sRGB — doit rester le dernier pass
    this.composer.addPass(new OutputPass());

    this._shakeAmt = 0;
    this._shakeRoll = 0;
  }

  shake(amount) { this._shakeAmt = Math.max(this._shakeAmt, amount); }
  setDamage(v) { this.grade.uniforms.damage.value = v; }
  setHitFlash(v) { this.grade.uniforms.hitFlash.value = v; }

  /**
   * Crochet exécuté juste AVANT le rendu du calque (viewmodel) : sert aux
   * déplacements d'arme (tremblement sous le feu, recul de dégâts...).
   * Ne remplace pas le rendu du calque — d'où le nom.
   * @param {(renderer: WebGLRenderer) => void} fn
   */
  setLayerRenderer(fn) {
    this._layerHook = fn;
  }

  /**
   * Rend une scène secondaire par-dessus la scène principale (viewmodel d'arme).
   * @param scene  scène du calque (lumières + arme)
   * @param root   nœud dont la pose est copiée de la caméra du jeu à chaque
   *               image : l'arme y est accrochée en coordonnées caméra.
   */
  setViewmodelScene(scene, root = null) {
    this.vmScene = scene;
    this.vmRoot = root;
  }

  resize() {
    const size = this.renderer.getSize(new THREE.Vector2());
    if (this._vmCamera) {
      this._vmCamera.aspect = size.x / Math.max(1, size.y);
      this._vmCamera.updateProjectionMatrix();
    }
    const pr = this.renderer.getPixelRatio();
    const W = Math.max(1, Math.round(size.x * pr));
    const H = Math.max(1, Math.round(size.y * pr));
    this.composer.setSize(W, H);
    this.grade.uniforms.resolution.value.set(W, H);
    if (this._vmRT) this._vmRT.setSize(W, H);
    this.ao.setSize(Math.max(2, Math.round(W * 0.5)), Math.max(2, Math.round(H * 0.5)));
    this.bloom.setSize(W, H);
  }

  /* ---------- Rendu ---------- */
  render(rawDt, time) {
    const cam = this.camera;
    const gameDt = rawDt;   // dt gameplay (le hitstop est géré côté Juice)

    this.grade.uniforms.time.value = time;

    if (!this.enabled) {
      // repli : rendu direct, puis le viewmodel posé par-dessus (il est rendu
      // dans sa propre cible, il faut donc le compositeur à la main)
      this.renderer.render(this.scene, cam);
      if (this.layerPass && this.vmScene) {
        const prev = this.renderer.autoClear;
        this.renderer.autoClear = false;
        this.layerPass.renderFn(this.renderer);
        const mat = this.layerPass._quad.material;
        mat.uniforms.tLayer.value = this._vmRT.texture;
        mat.uniforms.tDiffuse.value = null;
        mat.uniforms.exposure.value = this.layerPass.exposure;
        mat.uniforms.overlay.value = 1;
        this.renderer.setRenderTarget(null);
        this.layerPass._quad.render(this.renderer);
        mat.uniforms.overlay.value = 0;
        this.renderer.autoClear = prev;
      }
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
