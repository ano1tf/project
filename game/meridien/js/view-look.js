import { clamp } from "./core.mjs";

export class ViewLook {
  constructor(view, { available, direct, orbit, change, lost }) {
    this.view = view;
    this.doc = view.ownerDocument;
    this.available = available;
    this.direct = direct;
    this.orbit = orbit;
    this.change = change;
    this.aim = null;
    this.drag = null;

    view.addEventListener("pointerdown", (e) => this.down(e));
    view.addEventListener("pointermove", (e) => this.move(e));
    // The game owns a touch look drag. Don't let Chromium classify it as a
    // fling and suppress an independent tap on the HUD just after release.
    view.addEventListener(
      "touchmove",
      (e) => {
        if (this.drag?.touch && e.cancelable) e.preventDefault();
      },
      { passive: false },
    );
    view.addEventListener("mousemove", (e) => {
      if (this.aim && this.locked && this.available())
        this.turn(e.movementX, e.movementY);
    });
    view.addEventListener("pointerleave", () => {
      if (!this.aim || this.locked) return;
      this.aim.x = this.aim.y = null;
      this.controls(false, 0);
    });
    view.addEventListener("contextmenu", (e) => e.preventDefault());
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) {
      view.addEventListener(event, (e) => {
        if (this.drag?.id === e.pointerId) this.drag = null;
        if (event === "pointercancel" && e.pointerType === "mouse")
          this.controls(false, 0);
      });
    }
    this.doc.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.controls(false);
    });
    this.doc.addEventListener("pointerlockchange", () => {
      if (this.locked) {
        if (!this.aim || !this.available()) {
          this.doc.exitPointerLock();
          return;
        }
        this.aim.wasLocked = true;
        this.controls(this.walking, 0);
      } else if (this.aim?.wasLocked) lost();
    });
  }
  get active() {
    return this.aim !== null;
  }
  get locked() {
    return this.doc.pointerLockElement === this.view;
  }
  get walking() {
    return this.aim?.walking ?? false;
  }
  get edge() {
    return this.aim?.edge ?? 0;
  }
  controls(walking, edge = this.edge) {
    if (!this.aim || (walking === this.walking && edge === this.edge)) return;
    this.aim.walking = walking;
    this.aim.edge = edge;
    this.change();
  }
  reset() {
    const { drag, active } = this;
    this.drag = this.aim = null;
    if (drag && this.view.hasPointerCapture?.(drag.id))
      this.view.releasePointerCapture(drag.id);
    if (this.locked) this.doc.exitPointerLock();
    if (active) this.change();
  }
  down(e) {
    if (!this.available() || this.drag || ![0, 2].includes(e.button)) return;
    this.view.focus({ preventScroll: true });
    if (e.pointerType === "mouse" && this.direct()) {
      if (this.active) {
        if (e.button === 0) this.controls(true);
        return;
      }
      if (e.button === 0) {
        this.aim = { x: e.clientX, y: e.clientY, walking: false, edge: 0 };
        this.change();
        this.tryLock();
        return;
      }
    }
    this.reset();
    this.drag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      touch: e.pointerType === "touch",
    };
    try {
      this.view.setPointerCapture(e.pointerId);
    } catch {}
  }
  tryLock() {
    const win = this.doc.defaultView;
    // An embedded preview may not permit pointer lock. Use relative cursor
    // motion inside the view instead, with a slow turn at the horizontal edges.
    if (win !== win.top) {
      const frame = win.frameElement;
      if (
        !frame ||
        (frame.hasAttribute("sandbox") &&
          !frame.sandbox?.contains("allow-pointer-lock"))
      )
        return;
    }
    try {
      this.view.requestPointerLock?.()?.catch(() => {});
    } catch {
      // Older implementations can throw instead of rejecting a promise.
    }
  }
  move(e) {
    if (!this.available()) return;
    if (this.drag?.id === e.pointerId) {
      const { x, y } = this.drag;
      this.orbit((x - e.clientX) * 0.0045, (e.clientY - y) * 0.0032);
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      return;
    }
    if (!this.aim || this.locked || e.pointerType !== "mouse") return;
    const { x, y } = this.aim,
      bounds = this.view.getBoundingClientRect(),
      margin = Math.min(18, bounds.width * 0.024);
    this.aim.x = e.clientX;
    this.aim.y = e.clientY;
    if (x !== null) this.turn(e.clientX - x, e.clientY - y);
    const edge =
      e.clientX < bounds.left + margin
        ? -1
        : e.clientX > bounds.right - margin
          ? 1
          : 0;
    this.controls(this.walking && (e.buttons & 1) !== 0, edge);
  }
  turn(dx, dy) {
    if (!dx && !dy) return;
    this.orbit(
      clamp(dx || 0, -220, 220) * 0.0032,
      clamp(dy || 0, -170, 170) * 0.0026,
    );
  }
}
