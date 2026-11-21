import { navRoute, distance, nearestRiveRoad } from "./core.mjs";
import { nodes, altitude } from "./region.mjs";
import { EAST, streets } from "./faubourgs.mjs";
import { WORLD } from "./sectors.mjs";
import { X, Z, START } from "./data.mjs";
const eastJunctions = streets.map((e) => e.p),
  portJunctions = X.flatMap((x) => Z.map((z) => ({ x, z })));
// Put the driving destination on a real street; a click in the forest must not
// create a fictitious straight road from a junction to the middle of a field.
export function roadStop(p) {
  const area = WORLD.at(p.x, p.z);
  if (!area) return null;
  const candidates = area.regional
    ? nodes
    : area === EAST
      ? eastJunctions
      : area.id === "port-lumiere"
        ? portJunctions
        : null;
  if (!candidates) return nearestRiveRoad(p);
  return candidates.reduce((best, n) =>
    distance(p, n) < distance(p, best) ? n : best,
  );
}
export function makeTrip(stops) {
  let prev = START,
    path = [],
    length = 0;
  const legs = [];
  for (const stop of stops) {
    const leg = navRoute(prev, stop.point);
    let metres = 0;
    for (let i = 1; i < leg.length; i++) metres += distance(leg[i - 1], leg[i]);
    length += metres;
    legs.push({
      metres,
      height: Math.round(altitude(stop.point.x, stop.point.z)),
    });
    path.push(...leg);
    prev = stop.point;
  }
  return { path, length, legs };
}
