import { gameMinute, postCash } from "./accounts.mjs";

export const LINE_NAME = "Navette des Sondes";
export const FARE = 8;
export const RIDE_MINUTES = 12;
export const BOARD_MINUTES = 6;
export const DOCKS = Object.freeze({
  port: Object.freeze({
    x: -182.55,
    z: 146.6,
    waterX: -193.7,
    sign: "SONDES · LES MARÉES",
    label: "Embarcadère des Marées",
    height: 2.25,
    kind: "transport",
    first: 440,
    last: 1220,
    side: -1,
  }),
  greves: Object.freeze({
    x: -246.05,
    z: 145.0,
    waterX: -237.1,
    sign: "SONDES · LES GRÈVES",
    label: "Embarcadère des Grèves",
    height: 2.25,
    kind: "transport",
    first: 464,
    last: 1244,
    side: 1,
  }),
});
export const otherDock = (from) => (from === "port" ? "greves" : "port");
const DAY = 1440,
  PERIOD = 60;
const OFFSET = DOCKS.greves.first - DOCKS.port.first;
export function scheduled(from, at) {
  if (
    typeof from !== "string" ||
    !Object.hasOwn(DOCKS, from) ||
    !Number.isSafeInteger(at) ||
    at < 0
  )
    return false;
  const d = DOCKS[from],
    t = at % DAY;
  return t >= d.first && t <= d.last && (t - d.first) % PERIOD === 0;
}
export function departures(from, at) {
  if (!Object.hasOwn(DOCKS, from)) return null;
  const d = DOCKS[from],
    t = at % DAY,
    base = at - t;
  const slot =
    d.first + Math.max(0, Math.ceil((t - d.first) / PERIOD)) * PERIOD;
  const next = slot <= d.last ? base + slot : base + DAY + d.first;
  const prior =
    t > d.first
      ? base +
        Math.min(
          d.last,
          d.first + Math.floor((t - d.first - 1) / PERIOD) * PERIOD,
        )
      : base - DAY + d.last;
  return {
    next,
    prior: prior >= 0 ? prior : null,
    open: next - at <= BOARD_MINUTES,
    opens: next - BOARD_MINUTES,
    arrives: next + RIDE_MINUTES,
  };
}

export const freshTransit = () => ({ ride: null, last: null });
export function restoreTransit(raw, at, blocked) {
  const valid = (t) =>
    t && scheduled(t.from, t.departure) && (t.fare === 0 || t.fare === FARE);
  const packet = (t) => ({
    from: t.from,
    departure: t.departure,
    fare: t.fare,
  });
  return {
    ride:
      !blocked &&
      valid(raw?.ride) &&
      at >= raw.ride.departure - BOARD_MINUTES &&
      at < raw.ride.departure + RIDE_MINUTES
        ? packet(raw.ride)
        : null,
    last:
      valid(raw?.last) && at >= raw.last.departure + RIDE_MINUTES
        ? packet(raw.last)
        : null,
  };
}
export const fareFor = (p) =>
  p.passage?.accepted && !p.passage.outcome ? 0 : FARE;
export function beginRide(p, from, expected) {
  if (p.custody || p.alert.level || p.transit.ride || p.activeVehicle)
    return false;
  const slot = departures(from, gameMinute(p));
  if (!slot?.open || slot.next !== expected) return false;
  const fare = fareFor(p);
  if (fare && !postCash(p, -fare, "ferry")) return false;
  p.transit.ride = { from, departure: slot.next, fare };
  return true;
}
export function finishRide(p) {
  const ride = p.transit.ride;
  if (!ride || gameMinute(p) < ride.departure + RIDE_MINUTES) return null;
  p.transit.last = ride;
  p.transit.ride = null;
  return ride;
}

// Curve and deck height are shared by the boat, its passenger and Plan.
// Heading is the game's clockwise angle from north, boat points local -Z.
export const DECK_Y = -0.46;
export function launchPose(from, f) {
  const a = DOCKS[from],
    b = DOCKS[otherDock(from)];
  const u = Math.min(1, Math.max(0, f)),
    dx = b.waterX - a.waterX,
    dz = b.z - a.z;
  const q = u * u * (3 - 2 * u);
  return {
    x: a.waterX + dx * q,
    z: a.z + dz * q + 13.5 * u * u * (1 - u) * (1 - u),
    y: DECK_Y,
    heading: Math.atan2(dx, -dz - 4.5 * (1 - 2 * u)),
  };
}
export function launchAt(time) {
  const n = Math.floor((time - DOCKS.port.first) / PERIOD),
    t =
      DOCKS.port.first +
      Math.min((DOCKS.port.last - DOCKS.port.first) / PERIOD, n) * PERIOD;
  if (n < 0) return launchPose("port", 0);
  if (time < t + RIDE_MINUTES)
    return launchPose("port", (time - t) / RIDE_MINUTES);
  if (time < t + OFFSET) return launchPose("port", 1);
  if (time < t + OFFSET + RIDE_MINUTES)
    return launchPose("greves", (time - t - OFFSET) / RIDE_MINUTES);
  return launchPose("greves", 1);
}
export function ridePose(p) {
  const t = p.transit.ride;
  return (
    t &&
    launchPose(t.from, (p.port.day * DAY + p.time - t.departure) / RIDE_MINUTES)
  );
}
