import * as T from "three";

export const DIAL_START = Math.PI * 0.75;
export const DIAL_SWEEP = Math.PI * 1.5;
const themes = {
  coupe: ["MISTRAL · 84", "#ffc980", "#8e6c4d"],
  sport: ["BORÉAL · GT", "#ffad94", "#87524a"],
  van: ["ESTUAIRE · V2", "#c3e2b2", "#6c8064"],
  sedan: ["PORT-LUMIÈRE", "#b5dedf", "#54747d"],
  patrol: ["SÛRETÉ  /  PL-02", "#addcff", "#59789b"],
};

export function instrumentFace(spec) {
  const [title, ink, dim] = themes[spec.type] || themes.sedan;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 208;
  const ctx = canvas.getContext("2d"),
    max = Math.ceil((spec.max * 3.6) / 20) * 20,
    center = { x: 143, y: 101, r: 80 };
  const finish = ctx.createLinearGradient(0, 0, 0, canvas.height);
  finish.addColorStop(0, "#22272b");
  finish.addColorStop(0.68, "#0c1418");
  finish.addColorStop(1, "#1b2629");
  ctx.fillStyle = finish;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = dim;
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
  const ring = (x, y, r, color, width) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.stroke();
  };
  const { x, y, r } = center;
  ring(x, y, r + 4, dim, 3);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "600 15px monospace";
  for (let n = 0; n <= max; n += 5) {
    const t = DIAL_START + DIAL_SWEEP * (n / max),
      big = n % 20 === 0,
      xx = Math.cos(t),
      yy = Math.sin(t),
      len = big ? 13 : n % 10 === 0 ? 8 : 5;
    ctx.strokeStyle = n >= max - 15 ? "#e87761" : big ? ink : dim;
    ctx.lineWidth = big ? 2.6 : 1.2;
    ctx.beginPath();
    ctx.moveTo(x + xx * (r - len), y + yy * (r - len));
    ctx.lineTo(x + xx * r, y + yy * r);
    ctx.stroke();
    if (big) {
      ctx.fillStyle = ink;
      ctx.fillText(n, x + xx * (r - 26), y + yy * (r - 26));
    }
  }
  ctx.fillStyle = ink;
  ctx.font = "600 15px monospace";
  ctx.fillText("km/h", x, y + 38);
  ctx.fillRect(278, 45, 185, 1);
  ctx.fillRect(278, 82, 185, 1);
  ctx.font = "700 19px monospace";
  ctx.fillText(title, 370, 65, 178);
  ctx.font = "14px monospace";
  ctx.fillStyle = "#a5b5ad";
  ctx.fillText(spec.type === "van" ? "SÉRIE 02" : "PORT-LUMIÈRE", 370, 112);
  for (let n = 0; n < 8; n++) {
    ctx.fillStyle = n < 3 ? ink : dim;
    ctx.fillRect(311 + n * 15, 138, 10, 5);
  }
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  return {
    face: new T.MeshBasicMaterial({ map }),
    u: x / canvas.width - 0.5,
    v: 0.5 - y / canvas.height,
    needle: (r - 14) / canvas.width,
    ratio: canvas.height / canvas.width,
    max,
  };
}
