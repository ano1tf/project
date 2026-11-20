import { COMPTOIR } from "./port-layout.mjs";
import { berthAt } from "./port.mjs";
import { carBlocked, distance } from "./core.mjs";

// The logical sector is always installed. The render meshes use the Atelier
// contract and are fetched once, only when a 3D camera nears the waterfront.
export class PortSite {
  constructor(world) {
    this.world = world;
    const f = COMPTOIR;
    world.lot(f.x, f.z, f.w, f.d, "interior");
    for (const [x, z, w, d, h, bottom] of f.solids)
      world.solids.add(f.x + x, f.z + z, w, d, h, bottom);
    const a = f.opening;
    this.door = world.solids.add(f.x + a.x, f.z + a.z, a.w, a.d, a.h);
    // Tell the Plan not to bake this changing obstacle into the paper map.
    this.door.dynamic = true;
    world.lamps.push({
      x: f.x - 1.4,
      y: 3.31,
      z: f.z + 0.15,
      power: 40,
      span: 8.8,
      rgb: 0xffc084,
      sheltered: true,
    });
    world.lamps.push({
      x: f.x - 0.64,
      y: 3.19,
      z: f.z + 4.03,
      power: 32,
      span: 8.2,
      rgb: 0xffb57c,
    });
    this.owned = false;
    this.rack = false;
  }
  sync(venture) {
    const changed = this.owned !== venture.owned;
    this.owned = venture.owned;
    this.rack = venture.rack;
    this.door.enabled = !this.owned;
    if (this.kit) {
      this.kit.nodes.get("shutter").visible = !this.owned;
      this.kit.nodes.get("reserve").visible = this.rack;
    }
    return changed;
  }
  contains(p, padding = 0) {
    const f = COMPTOIR;
    return (
      Math.abs(p.x - f.x) < f.w * 0.5 + padding &&
      Math.abs(p.z - f.z) < f.d * 0.5 + padding
    );
  }
  floor(p) {
    return this.contains(p) ? 0.12 : null;
  }
  recover(progress) {
    if (this.owned) return;
    // A v1 carnet could be parked on what used to be an empty forecourt.
    // Recover onto the quay once; preserve the vehicle, headings elsewhere,
    // damage, custody and every transaction.
    const vehicles = [
      ...Object.values(progress.vehicles),
      ...Object.values(progress.street.seized),
    ];
    const span = { length: 5.3, width: 2.1, height: 2.1 };
    const displaced = vehicles.filter((p) => this.contains(p, 0.55));
    if (displaced.length) {
      const places = [];
      for (const z of [131, 137, 144, 151])
        for (let x = -180; x <= -153; x += 6.1) places.push({ x, z });
      for (const car of displaced) {
        const place = places.find(
          (p) =>
            vehicles.every((v) => v === car || distance(p, v) >= 5.6) &&
            !carBlocked(this.world.solids, p.x, p.z, -Math.PI * 0.5, span),
        );
        if (place) Object.assign(car, place, { heading: -Math.PI * 0.5 });
      }
    }
    if (!progress.activeVehicle && this.contains(progress.position)) {
      const { door } = COMPTOIR;
      Object.assign(progress.position, {
        x: door.x,
        z: door.z + 1.17,
        heading: 0,
      });
    }
  }
  present(eye, time, mode, onDetail) {
    const ferry = this.vessel;
    if (ferry) {
      const trip = berthAt(time);
      ferry.enabled = !!trip;
      if (trip) {
        ferry.x = ferry.root.position.x = trip.x;
        ferry.z = ferry.root.position.z = trip.z;
        ferry.yaw = trip.yaw;
      }
    }
    const { x, z } = COMPTOIR,
      d2 = (x - eye.x) ** 2 + (z - eye.z) ** 2;
    const range = mode === "low" ? 94 : 139;
    if (!this.ready && d2 < (range + 22) ** 2) {
      this.ready = import("./port-kit.js")
        .then(({ loadPortKit }) => loadPortKit())
        .then((kit) => {
          this.kit = kit;
          kit.root.position.set(x, 0, z);
          kit.root.visible = false;
          this.world.scene.add(kit.root);
          this.sync(this);
          onDetail?.(kit.root);
          return kit;
        })
        .catch((error) => {
          this.failed = true;
          console.warn("Comptoir 12 · lot Atelier indisponible", error);
          return null;
        });
    }
    if (!this.kit) return;
    this.kit.root.visible = d2 < range ** 2;
    this.kit.nodes.get("interior").visible =
      d2 < (mode === "low" ? 27 : 43) ** 2;
  }
}
