// Screen-space gestures reuse the renderer's inverse projection; pins and the
// point beneath the cursor stay aligned at any device pixel ratio.
export function mapGestures(
  canvas,
  getProjection,
  getView,
  limits,
  redraw,
  select,
) {
  const points = new Map();
  let dragged = false,
    start;
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: e.clientX - r.left - canvas.clientLeft,
      y: e.clientY - r.top - canvas.clientTop,
    };
  };
  const middle = () => ({
    x: canvas.clientWidth / 2,
    y: canvas.clientHeight / 2,
  });
  const metrics = () => {
    const [a, b] = points.values();
    return b
      ? {
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          d: Math.hypot(a.x - b.x, a.y - b.y),
        }
      : { ...a, d: 0 };
  };
  function move(from, to, factor) {
    const pr = getProjection();
    if (!pr) return;
    const v = getView(),
      m = middle(),
      at = pr.world(from.x, from.y),
      scale = pr.world(1, 0).x - pr.world(0, 0).x,
      b = limits();
    const zoom = Math.max(1, Math.min(b.maxZoom, v.zoom * factor)),
      unit = (scale * v.zoom) / zoom;
    v.zoom = zoom;
    v.center = {
      x: Math.max(b.minX, Math.min(b.maxX, at.x - (to.x - m.x) * unit)),
      z: Math.max(b.minZ, Math.min(b.maxZ, at.z - (to.y - m.y) * unit)),
    };
    redraw();
  }
  function zoom(factor, at = middle()) {
    move(at, at, factor);
  }
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoom(
        Math.exp(
          -Math.max(
            -200,
            Math.min(200, e.deltaY * (e.deltaMode === 1 ? 16 : 1)),
          ) * 0.004,
        ),
        pos(e),
      );
    },
    { passive: false },
  );
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || points.size >= 2) return;
    canvas.setPointerCapture(e.pointerId);
    points.set(e.pointerId, pos(e));
    if (points.size === 1) {
      start = pos(e);
      dragged = false;
    } else dragged = true;
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!points.has(e.pointerId)) return;
    const prev = metrics(),
      p = pos(e);
    points.set(e.pointerId, p);
    if (!dragged && Math.hypot(p.x - start.x, p.y - start.y) < 4) return;
    const from = dragged ? prev : start;
    dragged = true;
    const now = metrics();
    move(from, now, prev.d > 0 ? now.d / prev.d : 1);
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!points.delete(e.pointerId)) return;
    if (!dragged && !points.size) {
      const p = pos(e);
      select(p.x, p.y, e.pointerType === "touch" ? 15 : 12);
    }
  });
  for (const name of ["pointercancel", "lostpointercapture"])
    canvas.addEventListener(name, (e) => {
      if (points.delete(e.pointerId)) dragged = true;
    });
  canvas.addEventListener("keydown", (e) => {
    const step = 64,
      m = middle(),
      pan = {
        ArrowLeft: [step, 0],
        ArrowRight: [-step, 0],
        ArrowUp: [0, step],
        ArrowDown: [0, -step],
      }[e.key];
    if (pan) move(m, { x: m.x + pan[0], y: m.y + pan[1] }, 1);
    else if (e.key === "+" || e.key === "=") zoom(2);
    else if (e.key === "-") zoom(0.5);
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
  return zoom;
}
