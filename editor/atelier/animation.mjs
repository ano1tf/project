// No imports: this module is also embedded next to runtime.js in standalone exports.
const KREO_DEGREES = Math.PI / 180;
const kreoFoldTime = (t, duration, loop) => {
  t = Math.max(0, Number.isFinite(t) ? t : 0);
  if (loop === 'once') return Math.min(t, duration);
  if (loop === 'pingpong') {
    const p = t % (2 * duration);
    return p > duration ? 2 * duration - p : p;
  }
  return t % duration;
};

function kreoChannel(keys, target, axis, ease) {
  const { x, y, z } = target;
  return (time) => {
    let head = 0,
      tail = keys.length - 1;
    while (tail - head > 1) {
      const mid = (head + tail) >> 1;
      if (keys[mid][0] <= time) head = mid;
      else tail = mid;
    }
    const a = keys[head],
      b = keys[tail];
    let m = Math.max(0, Math.min(1, (time - a[0]) / (b[0] - a[0])));
    if (ease === 'step') m = Number(m >= 1);
    else if (ease === 'smooth') m = m * m * (3 - 2 * m);
    const v = a[1] + (b[1] - a[1]) * m;
    const w = a[2] + (b[2] - a[2]) * m;
    const q = a[3] + (b[3] - a[3]) * m;
    if (axis === 'scale') target.set(x * v, y * w, z * q);
    else if (axis === 'rotation')
      target.set(x + v * KREO_DEGREES, y + w * KREO_DEGREES, z + q * KREO_DEGREES);
    else target.set(x + v, y + w, z + q);
  };
}

// A bind pose is captured once. Sampling does not accumulate drift and only touches authored channels.
export function createKreoMotion(node, motion) {
  if (!motion || !Number.isFinite(motion.duration) || motion.duration <= 0) return null;
  const apply = ['position', 'rotation', 'scale']
    .filter((channel) => Array.isArray(motion[channel]) && motion[channel].length >= 2)
    .map((channel) => kreoChannel(motion[channel], node[channel], channel, motion.ease));
  if (!apply.length) return null;
  const seek = (seconds) => {
    for (const pose of apply) pose(seconds);
  };
  return {
    seek,
    sample(seconds) {
      seek(kreoFoldTime(seconds, motion.duration, motion.loop));
    },
  };
}

// Native scene objects also use parent/parentOffset. Resolve after *all* nodes exist.
// Invalid legacy references remain roots rather than creating recursive Object3D graphs.
export function linkKreoScene(defs, lookupNode) {
  const parents = new Map(defs.filter((o) => o?.parent).map((o) => [o.id, o.parent]));
  for (const o of defs) {
    if (!o?.parent) continue;
    const node = lookupNode(o.id),
      parent = lookupNode(o.parent);
    if (!node || !parent || node === parent) continue;
    const seen = new Set([o.id]);
    let id = o.parent;
    while (id && !seen.has(id)) {
      seen.add(id);
      id = parents.get(id);
    }
    if (id) continue;
    parent.add(node);
    const at = o.parentOffset ?? o.position;
    if (Array.isArray(at) && at.length === 3) node.position.set(...at);
  }
}
