import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildKreoAssembly } from './assembly.js';

export function makeAtelierPreview(host) {
  const canvas = host.querySelector('canvas');
  // Check WebGL before constructing the renderer to keep the JSON workflow available without it.
  const context = canvas.getContext('webgl2', { alpha: false, antialias: true });
  if (!context) return null;
  const renderer = new T.WebGLRenderer({ canvas, context });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x111826);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.36;
  const scene = new T.Scene();
  scene.add(new T.HemisphereLight(0xe3f3ff, 0x625565, 2.05));
  const key = new T.DirectionalLight(0xffe3b2, 3.1);
  key.position.set(-4, 8, 6);
  const rim = new T.DirectionalLight(0x98bfff, 2.6);
  rim.position.set(5, 3, -5);
  scene.add(key, rim);
  const rig = new T.Group();
  scene.add(rig);
  const grid = new T.GridHelper(10, 20, 0x53617c, 0x2a364e);
  rig.add(grid);
  const camera = new T.PerspectiveCamera(41, 1, 0.02, 1000);
  const orbit = new OrbitControls(camera, canvas);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.16;
  orbit.maxPolarAngle = Math.PI * 0.89;
  let asset = null;
  let raf = 0;
  let dirty = true;
  canvas.hidden = false;
  let anim = null;
  let last = 0;
  orbit.addEventListener('change', () => {
    dirty = true;
    redraw();
  });
  const resize = () => {
    if (!host.clientWidth || !host.clientHeight) return;
    const w = host.clientWidth,
      h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dirty = true;
    redraw();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  function redraw() {
    if (!raf && asset && host.clientWidth) raf = requestAnimationFrame(frame);
  }
  function frame(now) {
    raf = 0;
    if (!asset || !host.clientWidth) return;
    const dt = last ? Math.max(0, Math.min((now - last) / 1000, 0.12)) : 0;
    last = now;
    if (anim) {
      anim(dt);
      dirty = true;
    }
    orbit.update();
    if (dirty) renderer.render(scene, camera);
    dirty = false;
    if (anim) redraw();
  }
  function clear() {
    asset?.dispose();
    asset = anim = null;
    last = 0;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    canvas.hidden = true;
  }
  return {
    load(assetData) {
      clear();
      asset = buildKreoAssembly(assetData);
      rig.add(asset.root);
      canvas.hidden = false;
      asset.sample(0);
      rig.updateMatrixWorld(true);
      const bounds = new T.Box3().setFromObject(asset.root);
      const center = bounds.getCenter(new T.Vector3());
      const radius = Math.max(0.35, bounds.getSize(new T.Vector3()).length() / 2);
      orbit.target.copy(center);
      const vAim = new T.Vector3(4, 2.0, 7).normalize();
      const portrait = Math.min(
        1,
        Math.max(0.45, host.clientWidth / Math.max(1, host.clientHeight)),
      );
      const d = (2.93 * radius) / portrait;
      camera.position.copy(center).addScaledVector(vAim, d);
      camera.near = Math.max(0.002, radius * 0.008);
      camera.far = d * 15 + 20;
      orbit.minDistance = radius * 0.38;
      orbit.maxDistance = radius * 10;
      grid.position.set(center.x, bounds.min.y - 0.018, center.z);
      grid.scale.setScalar(Math.max(0.4, radius * 0.55));
      resize();
      orbit.update();
      redraw();
    },
    setTime(time) {
      asset?.sample(time);
      dirty = true;
      redraw();
    },
    play(callback) {
      anim = callback;
      last = 0;
      redraw();
    },
    pause() {
      anim = null;
    },
    clear,
    dispose() {
      clear();
      observer.disconnect();
      orbit.dispose();
      grid.geometry.dispose();
      grid.material.dispose();
      renderer.dispose();
    },
  };
}
