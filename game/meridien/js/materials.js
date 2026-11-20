import * as T from "three";
import { rng } from "./core.mjs";

export const standard = (color, extra = {}) =>
  new T.MeshStandardMaterial({ color, roughness: 0.83, ...extra });
function surface(size, paint) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext("2d");
  paint(c, size);
  const t = new T.CanvasTexture(canvas);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function scatter(c, n, base, amp, seed) {
  const r = rng(seed),
    a = c.createImageData(n, n),
    coarse = new Float32Array(32 * 32).map(() => r() - 0.5);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const ix = (x * 32) / n,
        iy = (y * 32) / n,
        u = ix % 1,
        v = iy % 1,
        i = ix | 0,
        j = iy | 0;
      const c0 =
        coarse[j * 32 + i] * (1 - u) + coarse[j * 32 + ((i + 1) % 32)] * u;
      const c1 =
        coarse[((j + 1) % 32) * 32 + i] * (1 - u) +
        coarse[((j + 1) % 32) * 32 + ((i + 1) % 32)] * u;
      const s = (r() - 0.5) * amp + ((1 - v) * c0 + v * c1) * amp * 0.88,
        k = (y * n + x) * 4;
      a.data[k] = base[0] + s;
      a.data[k + 1] = base[1] + s;
      a.data[k + 2] = base[2] + s;
      a.data[k + 3] = 255;
    }
  c.putImageData(a, 0, 0);
}
function repeated(t) {
  t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
function stone(base, seed, mode) {
  return repeated(
    surface(256, (c, n) => {
      scatter(c, n, base, mode === "asphalt" ? 26 : 27, seed);
      const r = rng(seed * 31);
      if (mode === "asphalt") {
        // Coarse resurfaced sections, gravel and hairline repairs at different scales.
        for (let i = 0; i < 15; i++) {
          const x = r() * n,
            y = r() * n,
            radius = 5 + r() * 29;
          const g = c.createRadialGradient(0, 0, radius * 0.18, 0, 0, radius);
          g.addColorStop(0, i % 3 ? "#10192362" : "#cbc4af4a");
          g.addColorStop(1, i % 3 ? "#10192300" : "#cbc4af00");
          for (const dx of [-n, 0, n])
            for (const dy of [-n, 0, n]) {
              c.save();
              c.translate(x + dx, y + dy);
              c.scale(0.57 + (i % 5) * 0.13, 1);
              c.fillStyle = g;
              c.fillRect(-radius, -radius, radius * 2, radius * 2);
              c.restore();
            }
        }
        for (let i = 0; i < 2350; i++) {
          c.fillStyle = i % 3 ? "#c7d0c135" : "#0b151c70";
          c.fillRect(r() * n, r() * n, 0.42 + r() * 1.26, 0.44 + r() * 1.19);
        }
        for (let i = 0; i < 7; i++) {
          let x = 20 + r() * (n - 40),
            y = 17 + r() * (n - 85);
          c.beginPath();
          c.moveTo(x, y);
          for (let j = 0; j < 5; j++) {
            x += r() * 13 - 6;
            y += r() * 16 + 0.4;
            c.lineTo(x, y);
          }
          c.lineWidth = i % 3 ? 0.7 + r() * 0.56 : 2.3;
          c.strokeStyle = i % 3 ? "#18232a85" : "#121d2bc0";
          c.stroke();
        }
      } else if (mode === "pavers") {
        for (let y = 0; y < n; y += 32) {
          c.fillStyle = "#2f3d3f85";
          c.fillRect(0, y, n, 2.1);
          for (let x = y % 64 ? -32 : 0; x < n; x += 64) {
            const ink = ["#c8c8ac31", "#84705a3d", "#163c463d", "#606c6a14"][
              Math.floor(r() * 4)
            ];
            for (const dx of [0, n]) {
              const bx = x + dx;
              c.fillStyle = ink;
              c.fillRect(bx + 2, y + 2, 61, 29);
              c.fillStyle = "#29383586";
              c.fillRect(bx, y, 1.8, 32);
              c.fillStyle = "#e4e4d56b";
              c.fillRect(bx + 2, y + 2, 60, 0.9);
              c.fillRect(bx + 2, y + 3, 1, 27);
              c.fillStyle = "#5a5b30a3";
              c.fillRect(bx + 5, y + 29, 5 + (x & 7), 1.3);
            }
          }
        }
      } else if (mode === "concrete") {
        c.fillStyle = "#10242f64";
        c.fillRect(0, 0, 2, n);
        c.fillRect(0, 0, n, 2);
        c.fillStyle = "#d3c1a74a";
        c.fillRect(2, 2, 1, n);
        c.fillRect(2, 2, n, 1);
        for (let i = 0; i < 120; i++) {
          c.fillStyle = "#a7a69a1d";
          c.fillRect(r() * n, r() * n, r() * 21 + 1, 1);
        }
      } else if (mode === "corrugated") {
        for (let x = 0; x < n; x += 16) {
          c.fillStyle = "#1225325b";
          c.fillRect(x, 0, 3, n);
          c.fillStyle = "#c9cdc84f";
          c.fillRect(x + 3, 0, 2, n);
          c.fillStyle = "#13273422";
          c.fillRect(x + 11, 0, 2, n);
        }
        c.fillStyle = "#15243467";
        c.fillRect(0, 0, n, 3);
        for (let x = 4; x < n; x += 16)
          for (let y = 6; y < n; y += 126) {
            c.fillStyle = "#c4ccbc89";
            c.fillRect(x, y, 2, 2);
          }
      }
    }),
  );
}
const FACADES = {
  brick: {
    color: [109, 76, 63],
    frame: "#ccc0a0",
    glass: "#334d56",
    w: 38,
    h: 44,
    seed: 31,
    rate: 0.36,
  },
  limestone: {
    color: [163, 151, 123],
    frame: "#e5d6b0",
    glass: "#4b6b74",
    w: 36,
    h: 47,
    seed: 32,
    rate: 0.29,
  },
  cream: {
    color: [137, 143, 132],
    frame: "#b6c2af",
    glass: "#46616a",
    w: 39,
    h: 42,
    seed: 190,
    rate: 0.32,
  },
  factory: {
    color: [85, 104, 108],
    frame: "#31505b",
    glass: "#516e76",
    w: 51,
    h: 34,
    seed: 34,
    rate: 0.32,
  },
  glass: {
    color: [53, 80, 99],
    frame: "#6b919e",
    glass: "#2f5469",
    w: 55,
    h: 50,
    seed: 59,
    rate: 0.27,
  },
  slate: {
    color: [82, 102, 112],
    frame: "#a4b4b6",
    glass: "#244759",
    w: 41,
    h: 47,
    seed: 143,
    rate: 0.22,
  },
};
function facade(kind) {
  const f = FACADES[kind],
    r = rng(f.seed);
  const windows = [];
  for (let j = 0; j < 5; j++)
    for (let i = 0; i < 5; i++) {
      const y = j * 64 + (kind === "factory" ? 16 : 7),
        x = i * 64 + (64 - f.w) / 2;
      windows.push({
        x,
        y,
        light: r() < f.rate,
        warm: r() > 0.22,
        blinds: r() > 0.44,
        val: r(),
        sub: r(),
      });
    }
  const map = repeated(
    surface(320, (c, n) => {
      scatter(c, n, f.color, kind === "glass" ? 13 : 20, f.seed);
      if (kind === "brick")
        for (let y = 0; y < n; y += 6) {
          c.fillStyle = "#1f202643";
          c.fillRect(0, y, n, 1);
          for (let x = y % 12 ? 0 : 9; x < n; x += 18) c.fillRect(x, y, 1, 6);
        }
      if (kind === "factory")
        for (let x = 0; x < n; x += 8) {
          c.fillStyle = "#1f394e65";
          c.fillRect(x, 0, 2, n);
          c.fillStyle = "#c6d1bb36";
          c.fillRect(x + 2, 0, 1, n);
        }
      if (kind === "limestone" || kind === "cream") {
        for (let y = 0; y < n; y += 16) {
          c.fillStyle = "#312f2c47";
          c.fillRect(0, y, n, 1.2);
          for (let x = y % 32 ? 0 : 16; x < n; x += 32) c.fillRect(x, y, 1, 16);
          c.fillStyle = "#e5dbc93d";
          c.fillRect(0, y + 1, n, 1);
        }
      }
      for (let j = 0; j < 5; j++) {
        c.fillStyle = kind === "glass" ? "#101f2eaa" : "#46474b6e";
        c.fillRect(0, j * 64 + 61, n, 3);
        c.fillStyle = "#ece1c947";
        c.fillRect(0, j * 64 + 60, n, 1);
        for (let i = 0; i < 5; i++) {
          c.fillStyle = "#101d2749";
          c.fillRect(i * 64 + 1, j * 64, 2, 64);
        }
      }
      for (const { x, y, light, warm, blinds, val, sub } of windows) {
        if (kind !== "glass") {
          const rust = c.createLinearGradient(0, y + f.h, 0, y + f.h + 16);
          rust.addColorStop(0, kind === "factory" ? "#5c392989" : "#3840387d");
          rust.addColorStop(1, "#29352a00");
          c.fillStyle = rust;
          c.fillRect(x - 3, y + f.h, 2.6 + val * 4, 15);
          c.fillRect(x + f.w - 3, y + f.h, 2 + sub * 5, 14);
        }
        c.fillStyle = "#151e23";
        c.fillRect(x - 2, y - 2, f.w + 4, f.h + 5);
        c.fillStyle = f.frame;
        c.fillRect(x - 1, y - 1, f.w + 2, f.h + 2);
        const grd = c.createLinearGradient(x, y, x + f.w, y + f.h);
        grd.addColorStop(0, light ? (warm ? "#b5895d" : "#799fac") : f.glass);
        grd.addColorStop(
          0.55,
          light ? (warm ? "#675846" : "#48696f") : "#26404d",
        );
        grd.addColorStop(1, light && warm ? "#aa7453" : "#23333c");
        c.fillStyle = grd;
        c.fillRect(x + 1, y + 1, f.w - 2, f.h - 2);
        c.fillStyle = "#bed6d22e";
        c.beginPath();
        c.moveTo(x + 1, y + f.h * 0.36);
        c.lineTo(x + f.w - 1, y + 2);
        c.lineTo(x + f.w - 1, y + 8);
        c.lineTo(x + 1, y + f.h * 0.54);
        c.fill();
        if (blinds) {
          c.fillStyle = light && warm ? "#7c6243a3" : "#a1a99a75";
          c.fillRect(x + 2, y + 2, f.w - 4, 12 + val * f.h * 0.55);
          c.fillStyle = "#1b283750";
          for (let j = 4; j < 11 + val * f.h * 0.55; j += 3)
            c.fillRect(x + 2, y + j, f.w - 4, 1);
        }
        c.fillStyle = f.frame;
        c.fillRect(x + f.w / 2 - 1, y, 2, f.h);
        if (kind === "brick" || kind === "factory" || sub > 0.55)
          c.fillRect(x, y + f.h * 0.47, f.w, 2);
        c.fillStyle = "#202c307b";
        c.fillRect(x - 4, y + f.h + 3, f.w + 8, 2);
        if (kind !== "glass") {
          c.fillStyle = f.frame;
          c.fillRect(x - 4, y + f.h, f.w + 8, 3);
        }
      }
    }),
  );
  const emit = repeated(
    surface(320, (c, n) => {
      c.fillStyle = "#000";
      c.fillRect(0, 0, n, n);
      for (const { x, y, light, warm, blinds, val } of windows)
        if (light) {
          const g = c.createLinearGradient(x, y, x + f.w, y + f.h);
          g.addColorStop(0, warm ? "#ffe5a9" : "#b3e3ec");
          g.addColorStop(1, warm ? "#e9935b" : "#53aab6");
          c.fillStyle = g;
          c.fillRect(x + 2, y + 2, f.w - 4, f.h - 4);
          c.fillStyle = "#111417";
          c.fillRect(x + f.w / 2 - 1, y, 2, f.h);
          if (blinds) {
            c.fillStyle = "#31221db9";
            c.fillRect(x + 2, y + 2, f.w - 4, 12 + val * f.h * 0.55);
          }
        }
    }),
  );
  const height =
    kind === "glass"
      ? null
      : repeated(
          surface(320, (c, n) => {
            c.fillStyle = "#8a8a8a";
            c.fillRect(0, 0, n, n);
            const row = kind === "brick" ? 6 : 16;
            c.fillStyle = "#696969";
            if (kind === "factory") {
              for (let x = 0; x < n; x += 8) c.fillRect(x, 0, 2, n);
            } else {
              for (let y = 0; y < n; y += row) {
                c.fillRect(0, y, n, 1.2);
                for (let x = y % (2 * row) ? 0 : row; x < n; x += row * 2)
                  c.fillRect(x, y, 1.2, row);
              }
            }
            for (const { x, y } of windows) {
              c.fillStyle = "#bcbcbc";
              c.fillRect(x - 2, y - 2, f.w + 4, f.h + 4);
              c.fillStyle = "#676767";
              c.fillRect(x + 1, y + 1, f.w - 2, f.h - 2);
              c.fillStyle = "#c8c8c8";
              c.fillRect(x - 4, y + f.h, f.w + 8, 2.4);
            }
          }),
        );
  return standard(0xffffff, {
    map,
    emissive: 0xffffff,
    emissiveMap: emit,
    emissiveIntensity: 0.5,
    bumpMap: height,
    bumpScale: kind === "factory" ? 0.08 : 0.068,
    roughness: kind === "glass" ? 0.43 : 0.89,
    metalness: kind === "glass" ? 0.26 : 0.04,
  });
}
function cafeGlass() {
  const t = surface(256, (c, n) => {
    const grad = c.createLinearGradient(0, 0, 0, n);
    grad.addColorStop(0, "#576960");
    grad.addColorStop(0.16, "#bc9871");
    grad.addColorStop(0.57, "#dca972");
    grad.addColorStop(1, "#473d36");
    c.fillStyle = grad;
    c.fillRect(0, 0, n, n);
    const rr = rng(968);
    for (let i = 0; i < 21; i++) {
      const x = i * 13;
      c.fillStyle = i % 3 ? "#3d464225" : "#e1c69650";
      c.fillRect(x, 0, 3 + rr() * 6, n);
    }
    c.fillStyle = "#594a3f8f";
    c.fillRect(0, 184, 256, 11);
    c.fillRect(0, 212, 256, 44);
    for (const x of [53, 183]) {
      c.fillStyle = "#394744bd";
      c.fillRect(x - 18, 168, 37, 54);
      c.fillRect(x - 23, 174, 46, 7);
      c.fillStyle = "#eecb92";
      c.beginPath();
      c.arc(x, 77, 15, Math.PI, 0);
      c.lineTo(x + 23, 84);
      c.lineTo(x - 23, 84);
      c.fill();
      c.strokeStyle = "#765e46";
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, 64);
      c.stroke();
    }
    c.fillStyle = "#b4c4bf35";
    c.beginPath();
    c.moveTo(0, 67);
    c.lineTo(n, 13);
    c.lineTo(n, 32);
    c.lineTo(0, 106);
    c.fill();
    c.fillStyle = "#333e38";
    c.fillRect(0, 240, 256, 16);
  });
  return standard(0xffffff, {
    map: t,
    emissive: 0xe8b78f,
    emissiveMap: t,
    emissiveIntensity: 0.34,
    metalness: 0.25,
    roughness: 0.32,
  });
}
export function makeMaterials() {
  const road = stone([58, 65, 71], 42, "asphalt"),
    pavers = stone([110, 119, 120], 24, "pavers"),
    concrete = stone([119, 126, 121], 57, "concrete"),
    warehouse = stone([80, 103, 111], 72, "corrugated"),
    roof = stone([72, 84, 87], 23, "corrugated");
  const foliage = surface(256, (c, n) => {
    scatter(c, n, [159, 176, 141], 51, 37);
    const r = rng(708),
      inks = ["#253e3ba0", "#9ab581a9", "#e1d6a485", "#526748ad", "#c5d5ab8a"];
    for (let i = 0; i < 2300; i++) {
      c.fillStyle = inks[i % inks.length];
      c.beginPath();
      c.ellipse(
        r() * n,
        r() * n,
        0.72 + 2.66 * r(),
        0.46 + 1.26 * r(),
        r() * Math.PI,
        0,
        Math.PI * 2,
      );
      c.fill();
    }
  });
  const paintWear = repeated(
    surface(256, (c, n) => {
      scatter(c, n, [239, 235, 225], 19, 512);
      const random = rng(8081);
      for (let i = 0; i < 470; i++) {
        c.fillStyle = i % 3 ? "#68747772" : "#34454ab9";
        c.fillRect(
          random() * n,
          random() * n,
          0.5 + random() * 5.4,
          0.5 + random() * 1.9,
        );
      }
    }),
  );
  const mats = {
    roadWhite: standard(0xe0dfce, { map: paintWear, roughness: 0.7 }),
    roadGold: standard(0xc8a453, { map: paintWear, roughness: 0.7 }),
    quayPavers: standard(0xc0b295, {
      map: pavers,
      bumpMap: pavers,
      bumpScale: 0.048,
    }),
    road: standard(0xbcc6cb, {
      map: road,
      bumpMap: road,
      bumpScale: 0.032,
      roughness: 0.65,
      metalness: 0.19,
    }),
    concrete: standard(0xc5c9be, {
      map: concrete,
      bumpMap: concrete,
      bumpScale: 0.03,
    }),
    pavers: standard(0xd9d3be, {
      map: pavers,
      bumpMap: pavers,
      bumpScale: 0.038,
    }),
    garage: standard(0xaaa698, {
      map: concrete,
      bumpMap: concrete,
      bumpScale: 0.03,
    }),
    warehouse: standard(0xc4ced0, {
      map: warehouse,
      bumpMap: warehouse,
      bumpScale: 0.057,
      roughness: 0.65,
      metalness: 0.32,
    }),
    roof: standard(0xc3cdcc, {
      map: roof,
      bumpMap: roof,
      bumpScale: 0.045,
      roughness: 0.72,
      metalness: 0.31,
    }),
    stripe: standard(0xcdcebf, { roughness: 0.67 }),
    yellow: standard(0xc8a34d, { roughness: 0.64 }),
    curb: standard(0x9ca8a6),
    tar: standard(0x253540),
    iron: standard(0x283a42, { metalness: 0.67, roughness: 0.45 }),
    rail: standard(0x465b63, { metalness: 0.52, roughness: 0.42 }),
    black: standard(0x18292e, { metalness: 0.12 }),
    aluminum: standard(0x94a7a8, { metalness: 0.62, roughness: 0.43 }),
    chrome: standard(0xadbfc3, { metalness: 0.87, roughness: 0.28 }),
    paint: standard(0xa6533b, { metalness: 0.24 }),
    orange: standard(0xc05e42),
    wood: standard(0x685044),
    rope: standard(0x908374),
    white: standard(0xd9d6bd),
    seaWall: standard(0x697f84, {
      map: concrete,
      bumpMap: concrete,
      bumpScale: 0.07,
    }),
    glass: standard(0x436474, { metalness: 0.6, roughness: 0.26 }),
    glassLit: standard(0x866640, {
      emissive: 0xe3a260,
      emissiveIntensity: 0.39,
      metalness: 0.26,
      roughness: 0.32,
    }),
    lamp: standard(0xefddac, {
      emissive: 0xffc787,
      emissiveIntensity: 1.35,
      roughness: 0.47,
    }),
    redLamp: standard(0x943727, { emissive: 0xe53c20, emissiveIntensity: 0.8 }),
    dirt: standard(0x4b5740, { map: pavers }),
    grass: standard(0x435949, { map: pavers }),
    trunks: standard(0x5b5145),
    leaves: [0x547453, 0x618667, 0x78865a, 0x959161].map((color) =>
      standard(color, { map: foliage, roughness: 0.91 }),
    ),
    cargo: [
      standard(0x993b2e, {
        map: warehouse,
        bumpMap: warehouse,
        bumpScale: 0.06,
        metalness: 0.2,
      }),
      standard(0x3f8190, {
        map: warehouse,
        bumpMap: warehouse,
        bumpScale: 0.06,
        metalness: 0.2,
      }),
      standard(0xbb8c53, { map: warehouse, metalness: 0.18 }),
      standard(0x769085, {
        map: warehouse,
        bumpMap: warehouse,
        bumpScale: 0.06,
        metalness: 0.22,
      }),
    ],
  };
  mats.shopGlass = cafeGlass();
  mats.facades = Object.fromEntries(
    Object.keys(FACADES).map((k) => [k, facade(k)]),
  );
  return mats;
}
export function labelMaterial(
  text,
  {
    sub = "",
    bg = "#18303c",
    ink = "#f4e4c9",
    accent = "#f09866",
    height = 120,
    border = true,
    night = 0.22,
  } = {},
) {
  const cn = document.createElement("canvas");
  cn.width = 512;
  cn.height = height;
  const c = cn.getContext("2d");
  c.fillStyle = bg;
  c.fillRect(0, 0, 512, height);
  if (border) {
    c.strokeStyle = accent;
    c.globalAlpha = 0.72;
    c.lineWidth = 3;
    c.strokeRect(7, 7, 498, height - 14);
    c.globalAlpha = 1;
  }
  const font = Math.min(height * 0.49, (405 / Math.max(3, text.length)) * 1.42);
  c.font = `700 ${font}px 'Barlow Condensed', sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = ink;
  c.fillText(text, 256, sub ? height * 0.412 : height * 0.515, 467);
  if (sub) {
    c.font = `${height * 0.142}px 'IBM Plex Mono', monospace`;
    c.fillStyle = accent;
    c.fillText(sub, 256, height * 0.735, 440);
  }
  const t = new T.CanvasTexture(cn);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return standard(0xffffff, {
    map: t,
    emissive: 0xffffff,
    emissiveMap: t,
    emissiveIntensity: night,
    roughness: 0.74,
    side: T.FrontSide,
  });
}
export const radialTexture = (center, middle) =>
  surface(64, (c, n) => {
    const k = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    k.addColorStop(0, center);
    k.addColorStop(0.42, middle);
    k.addColorStop(1, "#0000");
    c.fillStyle = k;
    c.fillRect(0, 0, n, n);
  });
