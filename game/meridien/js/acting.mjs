import { clamp, lerp, TAU } from "./core.mjs";

function ease(x) {
  x = clamp(x, 0, 1);
  return x * x * (3 - 2 * x);
}

// One full phase is a left/right cycle. On foot the fixed-step simulation counts
// half-cycles for footsteps and gives the very same phase to the skeleton.
export function advanceGait(phase, speed, dt, crouched = false) {
  const run = clamp((speed - 2.85) / 3.7, 0, 1);
  const cycle = crouched ? 0.87 : lerp(1.32, 2.68, run);
  return phase + (TAU * Math.max(0, speed) * dt) / cycle;
}

// Stance moves at a nearly constant rate; swing returns with a lifted toe.
// Inverse kinematics keep the ankle on that path through changes in crouch,
// run and landing rather than letting independent leg rotations swing through the ground.
export function gait(phase, stride, run, bend, hipHeight) {
  const p = (((phase / TAU) % 1) + 1) % 1,
    contact = lerp(0.62, 0.51, run),
    planted = p < contact,
    t = planted ? p / contact : (p - contact) / (1 - contact),
    fwd = (planted ? 1 - t * 2 : 2 * ease(t) - 1) * stride,
    lift = planted
      ? 0
      : Math.sin(Math.PI * t) ** 1.4 *
        (0.112 + run * 0.135 - bend * 0.055) *
        clamp(stride / 0.15, 0, 1),
    y = Math.max(0.23, hipHeight - 0.109 - lift);
  const a = 0.428,
    b = 0.393,
    d2 = fwd * fwd + y * y,
    knee = -Math.acos(clamp((d2 - a * a - b * b) / (2 * a * b), -1, 0.9998)),
    hip =
      Math.atan2(fwd, y) -
      Math.atan2(b * Math.sin(knee), a + b * Math.cos(knee));
  const toe =
    clamp(stride * 2.6, 0, 1) *
    (planted
      ? -0.11 * (1 - ease(t * 4)) + 0.23 * ease((t - 0.69) * 3.2)
      : 0.33 * Math.sin(Math.PI * t));
  return [hip, knee, toe - hip - knee];
}

// The listener keeps acting between lines, but the jaw follows the media clock.
export function intention(cue, time, mouth, speaks, subdued) {
  const envelope = ease(time * 3.7),
    nod = subdued ? 0 : Math.sin(time * (speaks ? 2.8 : 1.5));
  const scale = (speaks ? 1 : 0.5) * envelope;
  let hand = 0,
    glance = 0,
    tilt = 0,
    lean = 0,
    brow = 0;
  if (speaks)
    switch (cue) {
      case "look":
        glance = -0.59 * Math.sin(Math.PI * clamp(time / 1.8, 0, 1));
        tilt = 0.11 + 0.047 * nod;
        hand = 0.36;
        break;
      case "question":
        tilt = -0.19;
        lean = 0.055;
        hand = 0.68;
        brow = 0.9;
        break;
      case "confide":
        tilt = 0.12 + nod * 0.032;
        lean = 0.17;
        hand = 0.28;
        brow = -0.43;
        break;
      case "indicate":
        glance = 0.35 * Math.sin(Math.PI * clamp((time - 0.4) / 2.4, 0, 1));
        hand = 0.94 - 0.18 * ease(time - 2);
        break;
      case "paper":
      case "offer":
        tilt = 0.29 * (1 - ease((time - 0.25) / 1.3));
        hand = cue === "paper" ? 1 : 0.63 + 0.31 * ease((time - 3) / 2);
        lean = 0.08;
        break;
    }
  else {
    tilt = 0.13 + Math.max(0, nod) * 0.11;
    lean = 0.026;
    glance = 0.08;
    brow = -0.24;
  }
  return {
    cue,
    gesture: hand * scale * (0.77 + 0.16 * mouth + 0.07 * nod),
    headTurn: glance * scale,
    tilt: tilt * scale,
    lean: lean * scale,
    brow: brow * scale,
    mouth: speaks ? mouth : 0,
    acting: true,
  };
}
