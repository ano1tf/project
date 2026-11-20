import { gameMinute } from "./accounts.mjs";
import { payWorkshop } from "./port.mjs";

export const WORKSHOP_TITLE = "Banc de contrôle des Grèves";
export const WORKSHOP_FEE = 62;
export const SHIFT = Object.freeze({
  first: 450,
  round: 705,
  second: 840,
  close: 1155,
});
const mina = { name: "Mina Derval", style: "dock", hue: 6 };
const nadir = { name: "Nadir Khellaf", style: "sand", hue: 8 };
const BENCH = [-305.35, 106.72];
const minaRound = [
  [0, ...BENCH],
  [4, -298.9, 112.5],
  [7, -298.9, 117.0],
  [31, -282.8, 117.0],
  [68, -279.2, 114.9],
  [102, -282.8, 117.0],
  [128, -298.9, 117.0],
  [131, -298.9, 111.65],
  [SHIFT.second - SHIFT.round, ...BENCH],
];
const nadirRound = [
  [0, -291.3, 137.4],
  [65, -275.4, 137.4],
  [124, -254.4, 140.25],
  [175, -275.4, 137.4],
  [245, -291.3, 137.4],
];

export function shiftPhase(time) {
  if (time < SHIFT.first || time >= SHIFT.close) return "closed";
  return time < SHIFT.round || time >= SHIFT.second ? "bench" : "round";
}
export function nextBench(at) {
  const time = at % 1440,
    start = at - time;
  if (time < SHIFT.first) return start + SHIFT.first;
  if (time < SHIFT.round) return at;
  if (time < SHIFT.second) return start + SHIFT.second;
  return time < SHIFT.close ? at : start + 1440 + SHIFT.first;
}

// Scheduled extras are sampled, not simulated while nobody is on the bank.
// These paths are on the aprons, out of the truck bays and traffic lanes.
function along(path, time) {
  const i = path.findIndex(([at]) => at > time);
  const [start, x, z] = path[i - 1],
    [stop, a, b] = path[i],
    u = (time - start) / (stop - start);
  return {
    x: x + (a - x) * u,
    z: z + (b - z) * u,
    heading: Math.atan2(a - x, z - b),
    speed: (Math.hypot(a - x, b - z) / (stop - start)) * 1.03,
  };
}
export function shorePeople(time) {
  const phase = shiftPhase(time),
    out = [];
  if (phase === "bench")
    out.push({
      ...mina,
      x: BENCH[0],
      z: BENCH[1],
      heading: -1.28,
      speed: 0,
      id: "mina",
    });
  if (phase === "round")
    out.push({
      ...mina,
      ...along(minaRound, time - SHIFT.round),
      id: "mina",
    });
  if (time >= 395 && time < 615)
    out.push({
      ...nadir,
      x: -280.2,
      z: 113.9,
      heading: 2.22,
      speed: 0,
      id: "nadir",
    });
  if (time >= 845 && time < 1090)
    out.push({ ...nadir, ...along(nadirRound, time - 845), id: "nadir" });
  return out;
}

export const freshWorkshop = () => ({ last: null, count: 0 });
export function restoreWorkshop(raw, at) {
  if (
    !Number.isInteger(raw?.last) ||
    raw.last < 0 ||
    raw.last > at ||
    shiftPhase(raw.last % 1440) !== "bench"
  )
    return freshWorkshop();
  return {
    last: raw.last,
    count: Math.min(
      1 + Math.floor(raw.last / 1440),
      Math.max(1, Number.isInteger(raw.count) ? raw.count : 1),
    ),
  };
}

// Integer hundredths avoid floating-point equality at the ±0.15 mm boundary.
export function controlSheet(day) {
  const setup = [
    [2400, 8, [2389, 2414, 2425]],
    [3150, -7, [3159, 3144, 3120]],
    [1840, 12, [1871, 1829, 1837]],
  ][day % 3];
  const [nominal, zero, readings] = setup;
  return {
    reference: `G${1 + (day % 3)}-${String(day + 1).padStart(2, "0")}`,
    nominal,
    zero,
    tolerance: 15,
    readings,
  };
}
export function workshopStatus(p) {
  if (p.custody || p.alert.level) return "alert";
  if (shiftPhase(p.time) !== "bench") return "closed";
  if (
    p.workshop.last != null &&
    Math.floor(p.workshop.last / 1440) === p.port.day
  )
    return "done";
  return "ready";
}
export function inspectJoint(p, index) {
  const status = workshopStatus(p);
  if (status !== "ready") return { status };
  const s = controlSheet(p.port.day);
  if (!Number.isInteger(index) || !Object.hasOwn(s.readings, index))
    return { status: "invalid" };
  const measured = s.readings[index] - s.zero;
  if (Math.abs(measured - s.nominal) > s.tolerance)
    return { status: "wrong", measured };
  if (!payWorkshop(p, WORKSHOP_FEE)) return { status: "funds" };
  p.workshop.last = gameMinute(p);
  p.workshop.count++;
  return { status: "paid", measured };
}

export function residentAdvice(id, time) {
  if (id === "mina")
    return shiftPhase(time) === "bench"
      ? "Regarde d’abord le zéro du comparateur. Une pièce trop large coince quand la vanne redescend."
      : "Je relève les niveaux dehors jusqu’à 14 h. Après, retrouve-moi au banc de contrôle.";
  return time < 615
    ? "J’inscris les entrées avant la vente du matin. Les caisses personnelles vont au marquage jaune, pas dans le hangar."
    : "C’est aux petites jauges du quai que les anciens lisaient le niveau. Le sémaphore n’enregistrait que les changements de feu.";
}
