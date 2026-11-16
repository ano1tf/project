/* ============================================================
   KREO ARENA — SLOT ASSETS (assets.js)
   Environnement HDR (IBL, ciel réel + réflexions) et
   personnages GLB riggés (RobotExpressive, 14 animations) avec
   clonage de squelette et mixeur d'animations partagé.
   ============================================================ */
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

/* ---------- Environnement HDR ---------- */
export async function loadEnvironment(renderer, scene, url) {
  const loader = new HDRLoader();
  loader.setDataType(THREE.HalfFloatType);
  const tex = await loader.loadAsync(url);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.NoColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envRT = pmrem.fromEquirectangular(tex);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();
  return { texture: tex, envMap: envRT.texture };
}

/* ---------- Personnages GLB ---------- */
export class CharacterAsset {
  constructor(gltf, { height = 2.0 } = {}) {
    this.gltf = gltf;
    this.scene = gltf.scene;

    // normalisation de la hauteur
    const box = new THREE.Box3().setFromObject(this.scene);
    const rawH = Math.max(0.001, box.max.y - box.min.y);
    this.scale = height / rawH;
    this.footOffset = -box.min.y * this.scale;

    this.clips = {};
    for (const clip of gltf.animations) this.clips[clip.name] = clip;

    this.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      // les matériaux du GLB sont partagés entre clones : on les duplique
      // pour pouvoir teinter chaque ennemi sans affecter les autres
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        o.material = Array.isArray(o.material)
          ? mats.map((m) => m.clone())
          : mats[0].clone();
      }
    });
  }

  /** Clone riggé complet : { root, mixer, actions, mats } */
  instance() {
    const root = cloneSkinned(this.scene);
    root.scale.setScalar(this.scale);
    const mats = [];
    root.traverse((o) => {
      if (o.isMesh && o.material) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.push(m);
      }
      if (o.isMesh) o.frustumCulled = false;
    });
    const mixer = new THREE.AnimationMixer(root);
    const actions = {};
    for (const [name, clip] of Object.entries(this.clips)) {
      const a = mixer.clipAction(clip);
      a.enabled = false;
      actions[name] = a;
    }
    return { root, mixer, actions, mats };
  }
}

export async function loadCharacter(url, opts) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  return new CharacterAsset(gltf, opts);
}

/* ---------- Petit mélangeur d'actions (blend + fondu) ---------- */
export class Animator {
  constructor(instance) {
    this.inst = instance;
    this.mixer = instance.mixer;
    this.actions = instance.actions;
    this.current = null;
    this.currentName = '';
  }

  play(name, fade = 0.2, opts = {}) {
    const next = this.actions[name];
    if (!next || this.currentName === name) return;
    next.reset();
    next.enabled = true;
    next.setEffectiveTimeScale(opts.timeScale || 1);
    next.setEffectiveWeight(1);
    next.clampWhenFinished = !!opts.clamp;
    next.setLoop(opts.once ? THREE.LoopOnce : THREE.LoopRepeat, opts.once ? 1 : Infinity);
    if (this.current && this.current !== next) {
      next.crossFadeFrom(this.current, fade, true);
    }
    next.play();
    this.current = next;
    this.currentName = name;
  }

  update(dt) { this.mixer.update(dt); }
}
