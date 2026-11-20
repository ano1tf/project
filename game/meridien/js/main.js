import {
  MAP_PLACES,
  PLACES,
  VEHICLES,
  GARAGE_STOCK,
  STORY,
  COURIER,
  CONTACT_SCENE,
  FINAL_SCENE,
  CAST,
  ENDINGS,
  WEATHER,
  FOOD_PRICE,
  RAIN_PRICE,
  REPAIR_PRICE,
  districtName,
} from "./data.mjs";
import { WORLD } from "./sectors.mjs";
import { clamp, distance } from "./core.mjs";
import {
  freshProgress,
  readSelectedSlot,
  readSlot,
  SAVE_SLOTS,
  slotName,
  writeSelectedSlot,
  readSettings,
  writeSettings,
  CONTROL_SECONDS,
} from "./progress.mjs";
import {
  ECHO_TITLE,
  ECHO_EVIDENCE,
  ECHO_OUTCOMES,
  ECHO_VOICES,
  echoBrief,
  echoPhase,
  echoScene,
} from "./echo.mjs";
import { VOICES } from "./voices.mjs";
import { HarborAudio } from "./audio.js";
import { SceneAudio } from "./cinema.mjs";
import { CHART_COLORS, drawChart } from "./cartography.js";
import { PROFILES } from "./render-budget.mjs";
import { ViewLook } from "./view-look.js";
import { createPortUI } from "./phone-port.js";
import { createLittoralUI } from "./littoral-ui.js";
import { createPassageUI } from "./passage-ui.js";
import { PASSAGE_TITLE, passageBrief, passagePhase } from "./passage.mjs";

const $ = (id) => document.getElementById(id),
  title = $("title-screen"),
  play = $("play-screen"),
  viewport = $("viewport");
const dialog = $("overlay"),
  panel = $("panel-body"),
  panelTitle = $("panel-title");
let storage;
try {
  storage = window.localStorage;
} catch {
  storage = null;
}
const prefs = readSettings(storage),
  audio = new HarborAudio(prefs),
  speech = new SceneAudio(prefs);
const keys = new Set(),
  holds = new Map();
let game = null,
  starting = false,
  selectedSlot = readSelectedSlot(storage),
  panelType = "",
  phoneTab = "messages",
  cutscene = null,
  streetOffer = null,
  currentButton = null,
  mapObserver = null;
const mouseDevice = matchMedia("(any-pointer: fine)");
const viewLook = new ViewLook(viewport, {
  available: () =>
    game &&
    !starting &&
    !game.paused &&
    !dialog.open &&
    !document.hidden &&
    game.mode !== "plan",
  direct: () => prefs.mouseLook === "direct",
  orbit: (dx, dy) => game.orbit(dx, dy),
  change: () => {
    if (!game) return;
    game.setMouseAiming(viewLook.active);
    syncMouseHint(game);
    setInput();
  },
  lost: clearInput,
});
const moneyFormat = new Intl.NumberFormat("fr-FR");
const euro = (value) => `${moneyFormat.format(value)} €`;
const setText = (id, text) => {
  const el = $(id);
  if (el.textContent !== text) el.textContent = text;
};
const clock = (time) =>
  `${String(Math.floor(time / 60)).padStart(2, "0")}:${String(Math.floor(time % 60)).padStart(2, "0")}`;
const duration = (s) =>
  `${Math.floor(Math.ceil(s) / 60)}:${String(Math.ceil(s) % 60).padStart(2, "0")}`;
const record = (s) =>
  `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0").replace(".", ",")}`;
const icon = (name) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
    use = document.createElementNS(svg.namespaceURI, "use");
  use.setAttribute("href", "#i-" + name);
  svg.setAttribute("aria-hidden", "true");
  svg.append(use);
  return svg;
};
function tag(type, text = "", classes = "") {
  const el = document.createElement(type);
  if (text) el.textContent = text;
  if (classes) el.className = classes;
  return el;
}
function btn(
  text,
  fn,
  { primary = false, className, disabled = false, pict } = {},
) {
  const b = tag(
    "button",
    "",
    className || (primary ? "primary" : "small-button"),
  );
  b.type = "button";
  b.disabled = disabled;
  if (pict) b.append(icon(pict));
  b.append(document.createTextNode(text));
  if (fn) b.addEventListener("click", fn);
  return b;
}
function flow(...contents) {
  const el = tag("div", "", "panel-flow");
  el.append(...contents);
  return el;
}
function info(entries) {
  const el = tag("ul", "", "info-list");
  for (const { title, desc, action } of entries) {
    const line = tag("li"),
      left = tag("div");
    left.append(tag("strong", title));
    if (desc) left.append(tag("small", desc));
    line.append(left);
    if (action) line.append(action);
    el.append(line);
  }
  return el;
}
function notify(text, type = "info") {
  const stack = $("toast-stack"),
    el = tag("div", text, "toast" + (type === "warning" ? " warning" : ""));
  stack.append(el);
  while (stack.childElementCount > 3) stack.firstElementChild.remove();
  setTimeout(() => el.remove(), type === "warning" ? 5000 : 3950);
}
function syncSound() {
  const b = $("title-sound");
  b.querySelector("use").setAttribute(
    "href",
    prefs.sound ? "#i-sound" : "#i-muted",
  );
  b.querySelector("span").textContent = prefs.sound
    ? "SON ACTIVÉ"
    : "SON COUPÉ";
  b.setAttribute("aria-pressed", String(prefs.sound));
  b.setAttribute(
    "aria-label",
    prefs.sound ? "Couper le son" : "Activer le son",
  );
}
const slotStatus = {
  ready: "Sauvegardé",
  empty: "Libre",
  invalid: "Illisible",
  unavailable: "Indisponible",
};
function setMenu() {
  const { status } = readSlot(storage, selectedSlot);
  const label =
    status === "ready"
      ? "REPRENDRE LA PARTIE"
      : status === "invalid"
        ? "CARNET ILLISIBLE"
        : "ENTRER DANS LA VILLE";
  setText("carnet-name", slotName(selectedSlot));
  setText("carnet-state", slotStatus[status]);
  $("choose-slot").dataset.status = status;
  $("start-game").querySelector("span").textContent = label;
  $("new-game").hidden = status !== "ready";
  syncSound();
}
function chooseSlot() {
  const body = openPanel(
      "slot-panel",
      "Carnets de Noa",
      "PORT-LUMIÈRE  /  SAUVEGARDES LOCALES",
    ),
    list = tag("div", "", "slot-list");
  body.append(
    tag(
      "p",
      "Chaque carnet garde sa propre enquête, ses véhicules et ses comptes. Les paramètres d’affichage et de son sont partagés sur cet appareil.",
    ),
    list,
  );
  for (const slot of SAVE_SLOTS) {
    const { status, progress: p } = readSlot(storage, slot);
    const b = btn(
      slotName(slot),
      () => {
        selectedSlot = slot;
        writeSelectedSlot(storage, slot);
        setMenu();
        $("start-status").hidden = true;
        closePanel();
      },
      { className: "slot-card", pict: p ? "diamond" : "keys" },
    );
    b.dataset.status = status;
    b.setAttribute("aria-pressed", String(slot === selectedSlot));
    b.append(
      tag("b", slotStatus[status]),
      tag(
        "small",
        p
          ? `${STORY[p.stage].title} · ${euro(p.cash)} · Jour ${p.port.day + 1}`
          : status === "invalid"
            ? "Données conservées. Remplacement uniquement sur confirmation."
            : status === "empty"
              ? "Aucune partie dans ce carnet."
              : "Le navigateur n’autorise pas la lecture du carnet.",
      ),
    );
    list.append(b);
  }
}
function clearInput() {
  keys.clear();
  holds.clear();
  viewLook.reset();
  game?.setInput({});
}
function openPanel(type, name, kicker, { focus = true } = {}) {
  const was = dialog.open;
  mapObserver?.disconnect();
  mapObserver = null;
  if (!was) currentButton = document.activeElement;
  if (panelType === "cutscene" && type !== "cutscene") endCutscene();
  panelType = type;
  dialog.className = "overlay " + type;
  const handset = type === "phone-panel";
  $("phone-status").hidden = !handset;
  $("phone-home").hidden = !handset;
  $("close-panel").setAttribute(
    "aria-label",
    type === "cutscene" ? "Quitter la scène" : "Fermer",
  );
  panelTitle.textContent = name;
  $("panel-kicker").textContent = kicker;
  panel.replaceChildren();
  if (!was) {
    clearInput();
    game?.pause(true);
    dialog.showModal();
    play.classList.add("panel-open");
  }
  dialog.scrollTop = 0;
  if (handset) panel.scrollTop = 0;
  if (focus) panelTitle.focus({ preventScroll: true });
  play.classList.toggle("cinematic", type === "cutscene");
  $("letterbox").hidden = type !== "cutscene";
  return panel;
}
function afterPanelClose() {
  if (!panelType || dialog.open) return;
  panelType = "";
  mapObserver?.disconnect();
  mapObserver = null;
  play.classList.remove("panel-open", "cinematic");
  $("letterbox").hidden = true;
  endCutscene();
  if (game && !starting) {
    game.pause(false);
    viewport.focus({ preventScroll: true });
  } else if (!starting) currentButton?.focus({ preventScroll: true });
  clearInput();
}
function closePanel() {
  if (dialog.open) dialog.close();
  afterPanelClose();
}
dialog.addEventListener("cancel", (e) => {
  e.preventDefault();
  closePanel();
});
dialog.addEventListener("close", afterPanelClose);
$("close-panel").addEventListener("click", closePanel);
function controls() {
  openPanel("controls", "Commandes", "GUIDE DE TERRAIN").append(
    $("controls-template").content.cloneNode(true),
  );
}
function settings(returnTo) {
  openPanel("settings", "Paramètres", "OPTIONS DE JEU");
  const options = tag("div", "", "setting-list");
  const apply = (render = false) => {
    writeSettings(storage, prefs);
    syncSound();
    if (render) game?.settings();
    else audio.volume();
  };
  const s = tag("div");
  s.append(
    tag("span", "Son"),
    btn(prefs.sound ? "Activé" : "Coupé", (e) => {
      prefs.sound = !prefs.sound;
      e.currentTarget.textContent = prefs.sound ? "Activé" : "Coupé";
      e.currentTarget.setAttribute("aria-pressed", String(prefs.sound));
      if (prefs.sound && game) audio.start();
      apply();
    }),
  );
  s.lastChild.setAttribute("aria-pressed", String(prefs.sound));
  options.append(s);
  const l = tag("label", "Volume général"),
    range = tag("input");
  range.type = "range";
  range.min = "0";
  range.max = "100";
  range.value = Math.round(prefs.volume * 100);
  range.addEventListener("input", () => {
    prefs.volume = Number(range.value) / 100;
    apply();
  });
  l.append(range);
  options.append(l);
  const sel = (name, key, values) => {
    const a = tag("label", name),
      b = tag("select");
    for (const [k, text] of Object.entries(values)) {
      const node = tag("option", text);
      node.value = k;
      b.append(node);
    }
    b.value =
      key === "guideMode"
        ? prefs.guide
          ? "yes"
          : "no"
        : key === "voicesMode"
          ? prefs.voices
            ? "yes"
            : "no"
          : prefs[key];
    b.addEventListener("change", () => {
      if (key === "guideMode") prefs.guide = b.value === "yes";
      else if (key === "voicesMode") prefs.voices = b.value === "yes";
      else prefs[key] = b.value;
      apply(key !== "voicesMode");
    });
    a.append(b);
    options.append(a);
  };
  sel("Qualité graphique", "quality", {
    auto: "Automatique",
    low: "Éco · 3D légère",
    standard: "Soigné · 3D",
    high: "Cinéma · 3D avec ombres",
    plan: "Plan · vue de dessus",
  });
  sel("Point de vue 3D", "view", {
    third: "Troisième personne · épaule / poursuite",
    first: "Première personne · à pied / au volant",
  });
  sel("Suivi à pied (3e personne)", "camera", {
    follow: "Suivre Noa automatiquement",
    orbit: "Rotation manuelle",
  });
  sel("Souris (vue 3D)", "mouseLook", {
    direct: "Rotation directe après un clic",
    drag: "Rotation en glissant",
  });
  sel("Voix des cinématiques", "voicesMode", {
    yes: "Voix et sous-titres",
    no: "Sous-titres seuls",
  });
  sel("Guidage en jeu", "guideMode", {
    yes: "Chevrons et direction",
    no: "Carte uniquement",
  });
  sel("Météo", "weather", WEATHER);
  panel.append(
    options,
    tag(
      "p",
      "La 3D adapte sa résolution selon les performances. Si Éco reste saccadé, choisissez Plan : la vue est en 2D, mais le quartier, les missions et la sauvegarde ne changent pas.",
      "panel-note",
    ),
  );
  panel.append(
    tag(
      "p",
      "Voix synthétiques produites avec VoiceStudio : Kokoro pour Inès, Supertonic-3 pour Noa et Aya. Les pistes sont lues localement.",
      "panel-note voice-credit",
    ),
  );
  if (game) {
    const fromPhone = typeof returnTo === "function";
    panel.append(
      flow(
        btn(
          fromPhone ? "Retour aux applications" : "Retour à la pause",
          fromPhone ? returnTo : pauseMenu,
          { pict: "left" },
        ),
      ),
    );
  }
}
function pauseMenu() {
  if (!game) return;
  openPanel(
    "pause-panel",
    "Partie en pause",
    `MÉRIDIEN  /  ${slotName(game.slot).toUpperCase()}`,
  );
  const note = tag(
    "p",
    "La ville et les chronos restent en pause pendant la consultation des menus.",
  );
  panel.append(
    note,
    ...(game.stats.fps
      ? [
          tag(
            "p",
            `${PROFILES[game.mode].label} · ${game.stats.fps} i/s mesurées${game.mode === "plan" ? "" : " · " + Math.round(game.stats.scale * 100) + " % de résolution"}`,
            "panel-note",
          ),
        ]
      : []),
    flow(
      btn("REPRENDRE", closePanel, { primary: true, pict: "play" }),
      btn("Commandes", controls, { pict: "keys" }),
      btn("Paramètres", settings, { pict: "settings" }),
      btn("Sauvegarder", () => {
        note.textContent = game.save()
          ? `Progression enregistrée dans ${slotName(game.slot)}.`
          : "La sauvegarde est indisponible. Laissez cet onglet ouvert pour continuer.";
      }),
    ),
    btn("Revenir à l’écran titre", confirmQuit, { className: "text-button" }),
  );
}
function confirmQuit() {
  openPanel("confirm", "Revenir au titre ?", "MENU PRINCIPAL");
  const p = tag(
    "p",
    "Votre progression sera enregistrée avant le retour au titre.",
  );
  panel.append(
    p,
    flow(
      btn(
        "SAUVEGARDER ET QUITTER",
        () => {
          if (game.save()) location.reload();
          else
            p.textContent =
              "Sauvegarde indisponible. Vous pouvez annuler pour conserver la partie ouverte.";
        },
        { primary: true, pict: "left" },
      ),
      btn("Annuler", pauseMenu),
    ),
  );
}
function confirmNew() {
  const slot = selectedSlot;
  const damaged = readSlot(storage, slot).status === "invalid";
  openPanel(
    "confirm",
    damaged ? "Remplacer le carnet illisible ?" : "Repartir de zéro ?",
    slotName(slot).toUpperCase(),
  );
  panel.append(
    tag(
      "p",
      damaged
        ? `La partie dans ${slotName(slot)} ne peut pas être lue. Annuler laisse ses données intactes. Une nouvelle partie remplacera uniquement ce carnet.`
        : `Une nouvelle partie remplacera uniquement ${slotName(slot)} sur cet appareil. Les autres carnets ne changeront pas.`,
    ),
    flow(
      btn(
        damaged ? "REMPLACER CE CARNET" : "NOUVELLE PARTIE",
        () => {
          closePanel();
          start(true, slot);
        },
        { primary: true, pict: "play" },
      ),
      btn("Annuler", closePanel),
    ),
  );
}
async function start(restart = false, slot = selectedSlot) {
  if (starting || game) return;
  if (!restart && readSlot(storage, slot).status === "invalid") {
    confirmNew();
    return;
  }
  starting = true;
  const controls = [$("start-game"), $("new-game"), $("choose-slot")];
  controls.forEach((b) => (b.disabled = true));
  const status = $("start-status");
  status.hidden = false;
  status.textContent = "Chargement du quartier…";
  if (prefs.sound) audio.start();
  try {
    await Promise.all([
      document.fonts.ready,
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    ]);
    const { Meridien } = await import("./game.js");
    const entry = readSlot(storage, slot);
    if (!restart && entry.status === "invalid") {
      status.hidden = true;
      setMenu();
      return;
    }
    const p = (!restart && entry.progress) || freshProgress();
    game = new Meridien(
      viewport,
      p,
      prefs,
      storage,
      audio,
      {
        update: updateHUD,
        frame: frameHUD,
        notice: notify,
        transfer: showTransfer,
        fault: graphicsFault,
        recovered: graphicsBack,
      },
      slot,
    );
    game.prepare();
    title.hidden = true;
    play.hidden = false;
    status.hidden = true;
    game.rescale();
    game.pause(false);
    game.begin();
    const saved = game.save(false, restart);
    updateHUD(game);
    game.announce();
    if (!saved)
      notify(
        "Carnet inaccessible en écriture · la partie reste ouverte, mais ne sera pas conservée tant que la sauvegarde échoue.",
        "warning",
      );
    viewport.focus({ preventScroll: true });
  } catch (e) {
    console.error("Méridien : démarrage impossible", e);
    game = null;
    viewport.replaceChildren();
    status.textContent =
      "Impossible de lancer Méridien. Essayez Paramètres → Qualité graphique → Plan, puis relancez.";
    status.hidden = false;
  } finally {
    starting = false;
    controls.forEach((b) => (b.disabled = false));
  }
}
function graphicsFault() {
  openPanel("fault", "Affichage interrompu", "GRAPHISMES").append(
    tag(
      "p",
      "La 3D s’est interrompue. Reprenez ici même en vue de dessus sans perdre votre progression.",
    ),
    flow(
      btn(
        "PASSER EN VUE PLAN",
        () => {
          prefs.quality = "plan";
          writeSettings(storage, prefs);
          game.settings();
          closePanel();
        },
        { primary: true },
      ),
      btn("Recharger", () => location.reload()),
    ),
  );
}
function graphicsBack() {
  if (panelType === "fault") closePanel();
}

const transferCard = $("station-transfer");
function showTransfer() {
  clearInput();
  transferCard.hidden = false;
}
transferCard.addEventListener("animationend", () => {
  transferCard.hidden = true;
});
function syncPerspective(g) {
  const control = $("toggle-view");
  control.hidden = g.mode === "plan";
  control.setAttribute("aria-pressed", String(g.firstPerson));
}
function togglePerspective() {
  if (!game || dialog.open || game.mode === "plan" || starting) return;
  prefs.view = game.firstPerson ? "third" : "first";
  game.syncPerspective();
  writeSettings(storage, prefs);
  syncPerspective(game);
}
function syncMouseHint(g) {
  const on =
    mouseDevice.matches && g.mode !== "plan" && prefs.mouseLook === "direct";
  $("mouse-hint").hidden = !on;
  play.classList.toggle("mouse-aim", viewLook.active);
  if (on)
    setText(
      "mouse-hint",
      !viewLook.active
        ? "Clic dans la vue · souris directe"
        : g.hero.car
          ? "Souris active · Échap pour libérer"
          : "Clic maintenu : avancer · Échap : libérer",
    );
}
function updateHUD(g) {
  syncMouseHint(g);
  syncPerspective(g);
  const p = g.progress,
    h = g.hero,
    a = g.life.alert,
    target = g.target(),
    [district, street] = districtName(h.x, h.z);
  setText(
    "district",
    p.transit.ride ? "NAVETTE DES SONDES" : district.toUpperCase(),
  );
  setText(
    "radar-road",
    p.transit.ride
      ? "LIGNE S2"
      : p.custody
        ? "COMMISSARIAT"
        : street.toUpperCase(),
  );
  setText(
    "world-time",
    clock(p.time) + "  /  " + WEATHER[g.climate.current].toUpperCase(),
  );
  setText("cash", euro(p.cash));
  const unread = Math.min(p.port.news.length, p.port.serial - p.port.seen);
  const phoneButton = $("open-phone");
  phoneButton.dataset.unread = unread ? String(unread) : "";
  phoneButton.setAttribute(
    "aria-label",
    unread
      ? `Téléphone (Tab) · ${unread} dépêche${unread > 1 ? "s" : ""}`
      : "Téléphone (Tab)",
  );
  const isPlan = g.mode === "plan";
  play.classList.toggle("plan-mode", isPlan);
  play.classList.toggle("eco-mode", g.mode === "low");
  play.classList.toggle("cockpit-mode", g.firstPerson && !!h.car);
  $("display-mode").hidden = !isPlan && !g.firstPerson;
  setText(
    "display-mode",
    isPlan
      ? "PLAN · VUE DE DESSUS"
      : h.car
        ? "VUE HABITACLE"
        : "VUE SUBJECTIVE",
  );
  const showStats = g.mode !== "plan" && g.stats.fps > 0 && g.stats.fps < 27;
  $("display-stats").hidden = !showStats;
  if (showStats)
    setText(
      "display-stats",
      `${PROFILES[g.mode].label.toUpperCase()} · ${g.stats.fps} i/s`,
    );
  const heat = $("heat");
  heat.hidden = !a.level;
  setText("heat", "◆".repeat(a.level) + "◇".repeat(3 - a.level));
  heat.setAttribute("aria-label", `Niveau d’alerte ${a.level} sur 3`);
  setText("objective-type", target.type);
  setText(
    "log-index",
    p.custody
      ? "CONTRÔLE"
      : p.transit.ride
        ? "À BORD"
        : p.tracking === "passage"
          ? "DOSSIER 03"
          : p.tracking === "courier"
            ? "COURSE"
            : p.tracking === "echo"
              ? `${[p.echo.watch, p.echo.badge].filter(Boolean).length} / 2 INDICES`
              : p.tracking === "freight" && p.port.job
                ? `${p.port.job.qty} CAISSES · ${p.port.job.stage === "loaded" ? "EN SOUTE" : "RÉSERVÉES"}`
                : p.tracking === "custom"
                  ? "REPÈRE"
                  : {
                      contact: "01 / 04",
                      hangar: "02 / 04",
                      archive: "03 / 04",
                      belvedere: "04 / 04",
                      done: "CLOS",
                    }[p.stage] || "01",
  );
  setText("objective-title", target.title);
  setText("objective-text", target.text);
  const d = g.remaining(target),
    danger =
      g.life.exposure > 0.02 && g.progress.stage === "archive" && !a.level;
  const suffix = a.level
    ? ` · ${
        a.stop > 0.09
          ? `${a.level >= 2 ? "INTERPELLATION" : "CONTRÔLE"} ${Math.floor((a.stop * 100) / CONTROL_SECONDS)} %`
          : a.unseen > 2
            ? "RECHERCHE"
            : "EN VUE"
      }`
    : danger
      ? ` · REPÉRAGE ${Math.round(g.life.exposure * 100)} %`
      : h.crouch
        ? " · ACCROUPIE"
        : "";
  setText(
    "objective-distance",
    (d === null
      ? target.timer == null
        ? ""
        : duration(target.timer)
      : `${Math.max(0, Math.round(d))} M${target.timer == null ? "" : "  /  " + duration(target.timer)}`) +
      suffix,
  );
  const turn = prefs.guide ? g.guidance(target) : null;
  const direction = $("route-turn");
  direction.hidden = !turn;
  if (turn) {
    setText("route-copy", turn.text);
    direction.querySelector("svg").style.transform =
      `rotate(${Math.round(turn.angle * 57.2958)}deg)`;
  }
  const action = g.action();
  streetOffer = g.streetAction();
  $("interaction").hidden = !action && !streetOffer;
  $("interact-button").hidden = !action;
  $("street-button").hidden = !streetOffer;
  setText("interaction-text", action?.label || "");
  setText("street-text", streetOffer?.label || "");
  $("stamina").firstElementChild.style.width =
    100 * (p.sprintBonus > 0 ? 1 : h.stamina) + "%";
  $("stamina").firstElementChild.style.background = p.sprintBonus
    ? "#ffb186"
    : "";
  $("speedometer").hidden = !h.car;
  if (h.car) {
    const c = h.car;
    setText(
      "vehicle-name",
      c.spec.name.toUpperCase() + (c.trafficId ? " · VOLÉ" : ""),
    );
    setText("speed", String(Math.round(Math.abs(c.speed) * 3.6)));
    setText("drive-gear", c.gear || "N");
    const grip = Math.abs(c.slip || 0) > 0.17 && Math.abs(c.speed) > 3.9;
    const status = c.braking
      ? "FREIN"
      : grip
        ? "GLISSE"
        : g.climate.roadWet > 0.52
          ? "MOUILLÉ"
          : "SEC";
    setText("drive-grip", status);
    $("speedometer").classList.toggle("slipping", grip);
    $("speedometer").classList.toggle("braking", !!c.braking);
    $("speed-fill").style.width =
      clamp(Math.abs(c.speed / c.spec.max) * 100, 0, 100) + "%";
    setText("car-condition", `ÉTAT ${Math.round((1 - c.damage) * 100)} %`);
  }
  const mode = h.car ? "drive" : "foot",
    hint = $("keyhint");
  if (hint.dataset.mode !== mode) {
    hint.dataset.mode = mode;
    hint.replaceChildren(
      tag("kbd", "ZQSD"),
      document.createTextNode(h.car ? " Conduire " : " Bouger "),
      tag("span"),
      tag("kbd", h.car ? "ESPACE" : "C"),
      document.createTextNode(h.car ? " Frein à main" : " Discrétion"),
    );
  }
  if (
    !g.radarAt ||
    g.elapsed >= g.radarAt ||
    g.lastRadarTarget !== target.point
  ) {
    g.radarAt = g.elapsed + (g.mode === "low" ? 0.22 : 0.15);
    g.lastRadarTarget = target.point;
    drawChart($("radar-map"), g);
  }
}
function frameHUD(g) {
  cutscene?.tick();
  const el = $("world-label");
  if (!prefs.guide || g.mode === "plan" || g.sceneShot) {
    el.hidden = true;
    return;
  }
  const target = g.target(),
    p = g.marker(target);
  const v = p && g.projected(p);
  el.hidden = !v || !!g.sceneShot || g.remaining(target) < 2.2;
  if (!el.hidden) {
    el.style.transform = `translate(calc(${v[0]}vw - 50%),calc(${v[1]}dvh - 50%))`;
    const t = el.querySelector("small"),
      text = (p.sign || p.label || "REPÈRE").toUpperCase();
    if (t.textContent !== text) t.textContent = text;
  }
}
function actStreet(offered = null) {
  if (game && !dialog.open && !starting) game.streetAct(offered);
}
function act() {
  if (!game || dialog.open || starting) return;
  const a = game.action();
  if (!a) return;
  switch (a.type) {
    case "release":
      game.releaseCustody();
      break;
    case "enter":
      game.enter(a.car);
      break;
    case "exit":
      game.exit();
      break;
    case "contact":
      dialogue(CONTACT_SCENE, game.life.ines, {
        after: () => {
          game.story("contact");
          game.notice("Objectif actualisé · Hangar 07");
        },
      });
      break;
    case "archive":
      if (game.story("take"))
        game.notice(
          "Registre des manifestes copié · nouveau message d’Aya",
          "reward",
        );
      break;
    case "finale":
      if (game.life.alert.level)
        game.notice("Aya ne veut pas parler tant que la sûreté est en alerte.");
      else dialogue(FINAL_SCENE, game.life.aya, { choices: ENDINGS });
      break;
    case "ondes":
      visitOndes();
      break;
    case "watch":
    case "badge":
      evidencePanel(a.type);
      break;
    case "receiver":
      receiverPanel();
      break;
    case "courier":
      courierShop();
      break;
    case "delivery-stop":
      game.notice(
        "Ralentissez, puis appuyez sur E pour remettre la livraison.",
      );
      break;
    case "freight-stop":
      game.notice("Freinez dans la baie, puis validez l’action de fret.");
      break;
    case "freight-load":
    case "freight-drop":
      if (!game.freightAction(a.type.slice(8)))
        game.notice("Ce mouvement de fret n’est plus disponible.", "warning");
      break;
    case "freight-return":
      portUI.returnLoad();
      break;
    case "sondes-dock":
      passageUI.terminal(a.from);
      break;
    case "sondes-ride":
      passageUI.onboard();
      break;
    case "greves-log":
      passageUI.log();
      break;
    case "greves-bench":
      littoralUI.bench();
      break;
    case "greves-greet":
      game.greetShore(a.resident);
      break;
    case "port-property":
      portUI.property();
      break;
    case "port-desk":
      portUI.operations();
      break;
    case "relay":
      game.takeCourier("relay");
      break;
    case "depot":
      game.takeCourier("depot");
      break;
    case "cafe":
      cafeShop();
      break;
    case "semaphore":
      openPanel(
        "landmark",
        PLACES.semaphore.label,
        "PORT-LUMIÈRE  /  PARVIS DU SILLAGE",
      );
      panel.append(
        tag(
          "p",
          "« Pour entrer dans la Darse, guettez les volets. Pour amarrer, lisez le cadran. » — plaque des lamaneurs, 1938.",
        ),
        tag(
          "p",
          "Le sémaphore signalait l’arrivée des chalands. L’aiguille du marégraphe monte et redescend pendant que les volets balayent les quais.",
        ),
        btn("Reprendre la balade", closePanel, { primary: true }),
      );
      break;
    case "garage":
      garageShop();
      break;
    case "repair":
      repairShop();
      break;
    case "greet":
      game.greet(a.walker);
      break;
  }
}
function visitOndes() {
  const p = game.progress,
    phase = echoPhase(p);
  if (phase === "lead" || phase === "debrief") {
    const debrief = phase === "debrief";
    dialogue(
      echoScene(p.ending, debrief),
      game.life.salome,
      debrief
        ? {
            choices: ECHO_OUTCOMES,
            choiceTitle: "Où garder la preuve ?",
            choiceIntro:
              "La correction peut être rendue publique. La voix, elle, n’a pas à circuler.",
            onChoice: (key) => {
              if (!game.investigate("finish", key)) return false;
              game.notice(
                `Dossier clos · +${euro(ECHO_OUTCOMES[key].reward)}`,
                "reward",
              );
              return true;
            },
          }
        : {
            after: () => {
              if (game.investigate("accept"))
                game.notice(
                  "Dossier ouvert · deux indices à relever",
                  "reward",
                );
            },
          },
    );
    return;
  }
  const body = openPanel(
    "landmark",
    PLACES.ondes.label,
    "SALOMÉ RENAUD  /  ATELIER RADIO",
  );
  panel.append(
    tag(
      "p",
      echoBrief(p)?.text ||
        "Je répare les postes des équipages depuis quinze ans. Ici, on écoute d’abord la mer. Si Inès t’a donné rendez-vous, elle est au Sillage.",
    ),
    flow(
      ...(phase === "locked"
        ? []
        : [
            btn("Voir le dossier", () => phone("journal"), { pict: "diamond" }),
          ]),
    ),
  );
  if (phase === "closed") passageUI.invitation(body);
  body.append(flow(btn("Reprendre", closePanel)));
}
function evidencePanel(id) {
  const item = ECHO_EVIDENCE[id];
  if (game.investigate(id))
    game.notice("Indice consigné dans le Journal", "reward");
  const outcome = id === "watch" && ECHO_OUTCOMES[game.progress.echo.outcome];
  openPanel(
    "landmark",
    item.title,
    id === "watch" ? "QUAI DES MARÉES" : "ATELIER DES ONDES",
  );
  panel.append(tag("p", item.text));
  if (outcome) panel.append(tag("p", outcome.desc, "evidence-note"));
  panel.append(
    flow(
      btn("Journal", () => phone("journal"), { pict: "diamond" }),
      btn("Reprendre", closePanel, { primary: true }),
    ),
  );
}
function receiverPanel() {
  const p = game.progress,
    phase = echoPhase(p);
  openPanel("receiver", "Récepteur à bande", "ATELIER DES ONDES  /  POSTE 04");
  if (phase === "debrief" || phase === "closed") {
    const sealed = p.echo.outcome === "seal";
    panel.append(
      tag(
        "b",
        sealed ? "C · BOBINE SOUS SCELLÉ" : "C · 02 H 17 → 02 H 09",
        "receiver-readout",
      ),
      tag(
        "p",
        sealed
          ? "La bande reste ici. Seule la référence du relais est consultable."
          : "Le relais de la passe a reçu l’appel à 02 h 09, huit minutes avant l’heure inscrite sur la bobine.",
      ),
      flow(
        ...(sealed
          ? []
          : [
              btn("Réécouter le signal de calage", () => audio.radio(true), {
                pict: "wave",
                disabled: !prefs.sound || prefs.volume === 0,
              }),
            ]),
        btn("Reprendre", closePanel, { primary: true }),
      ),
    );
    return;
  }
  if (phase !== "decode") {
    panel.append(
      tag(
        "p",
        "Le récepteur ne peut pas isoler la bande sans la voie du standard et l’horodatage du registre.",
      ),
      btn("Reprendre", closePanel, { primary: true }),
    );
    return;
  }
  const form = tag("form", "", "receiver-form");
  const readout = tag("b", "— · RECHERCHE DU RELAIS", "receiver-readout"),
    hint = tag(
      "p",
      "Recoupez les deux indices, puis lancez le calage.",
      "receiver-result",
    );
  hint.setAttribute("role", "status");
  const select = (name, values) => {
    const label = tag("label", name),
      input = tag("select");
    for (const [value, title] of values) {
      const option = tag("option", title);
      option.value = value;
      input.append(option);
    }
    label.append(input);
    form.append(label);
    return input;
  };
  form.append(readout);
  const track = select("Voie du standard", [
    ["", "Sélectionner une voie"],
    ["A", "Voie A"],
    ["B", "Voie B"],
    ["C", "Voie C"],
  ]);
  const stamp = select("Heure inscrite sur la bobine", [
    ["", "Sélectionner une heure"],
    ["0209", "02 h 09"],
    ["0217", "02 h 17"],
    ["0225", "02 h 25"],
  ]);
  const validate = btn(
    "Caler le récepteur",
    () => {
      if (!ready()) return;
      if (
        game.investigate("tune", { track: track.value, stamp: stamp.value })
      ) {
        audio.radio(true);
        game.notice("Signal isolé · retournez parler à Salomé", "reward");
        receiverPanel();
      } else {
        audio.radio(false);
        hint.textContent =
          "Le signal ne concorde pas. Vérifiez la voie dans la plaque et l’heure gravée (pas l’heure réelle) dans le registre.";
      }
    },
    { primary: true, pict: "wave", disabled: true },
  );
  const ready = () => Boolean(track.value && stamp.value);
  form.addEventListener("change", () => {
    validate.disabled = !ready();
    readout.textContent = `${track.value || "—"} · ${stamp.value ? stamp.selectedOptions[0].textContent : "—"}`;
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    validate.click();
  });
  form.append(
    hint,
    flow(
      btn("Relire le Journal", () => phone("journal"), { pict: "diamond" }),
      validate,
    ),
  );
  panel.append(form);
  track.focus({ preventScroll: true });
}
function endCutscene() {
  if (!cutscene) return;
  cutscene = null;
  speech.stop();
  audio.cinema(null);
  game?.setShot(null);
}
function dialogue(
  scene,
  npc,
  {
    after,
    choices = null,
    review = false,
    choiceTitle = "L’heure du choix",
    choiceIntro = "Le registre peut sortir ce soir, avec ou sans les noms.",
    onChoice = (key) => {
      if (!game.story("finish", key)) return false;
      game.notice(`Chapitre terminé · +${euro(ENDINGS[key].reward)}`, "reward");
      return true;
    },
  } = {},
) {
  let cursor = 0;
  let advance, meter, status, voiceToggle, toggleIcon;
  const kicker = `SÉQUENCE ${scene.index} / ${scene.frequency}`;
  const slate = $("scene-slate");
  slate.querySelector("b").textContent = scene.title;
  slate.querySelector("span").textContent =
    `${scene.chapter || "CHAPITRE 01"}  /  ${scene.place.toUpperCase()}`;
  slate.querySelector("small").textContent = scene.frequency;
  const finish = (key) => {
    if (onChoice(key)) closePanel();
  };
  const next = () => {
    if (cutscene !== session || cursor >= scene.lines.length) return;
    cursor++;
    render();
  };
  const skip = () => {
    if (cutscene !== session) return;
    cursor = scene.lines.length;
    render();
  };
  const updateVoiceMenu = () => {
    let msg = "VOIX SYNTHÉTIQUES";
    if (speech.state === "unavailable") msg = "VOIX INDISPONIBLE · SOUS-TITRES";
    if (!speech.audible || !VOICES[speech.line]) msg = "SOUS-TITRES SEULS";
    if (status.textContent !== msg) status.textContent = msg;
    const label = speech.audible ? "Couper les voix" : "Activer les voix";
    if (voiceToggle.getAttribute("aria-label") !== label) {
      voiceToggle.setAttribute("aria-label", label);
      voiceToggle.title = label;
      voiceToggle.setAttribute("aria-pressed", String(speech.audible));
      toggleIcon.setAttribute("href", speech.audible ? "#i-sound" : "#i-muted");
    }
  };
  const session = {
    tick() {
      if (!dialog.open || panelType !== "cutscene" || !speech.active) return;
      const done = speech.tick(performance.now());
      meter.style.setProperty(
        "--take",
        `${Math.min(100, Math.floor((speech.elapsed / speech.length) * 100))}%`,
      );
      updateVoiceMenu();
      // If a pointer/keyboard user is operating replay, audio or skip, leave
      // the controls and subtitle in place until they choose to continue.
      if (
        done &&
        (document.activeElement === advance ||
          document.activeElement === panelTitle)
      )
        next();
    },
  };
  function render() {
    if (cursor >= scene.lines.length) {
      speech.stop();
      if (!choices) {
        after?.();
        if (review) phone("journal");
        else closePanel();
        return;
      }
      openPanel("cutscene", choiceTitle, kicker);
      game.setShot(
        scene.id,
        npc,
        { shot: "choice", speaker: scene.lines.at(-1).speaker },
        speech,
      );
      dialog.classList.add("scene-choice");
      panel.append(tag("p", choiceIntro, "choice-intro"));
      const options = tag("div", "", "scene-options");
      for (const [i, [key, value]] of Object.entries(choices).entries()) {
        const b = btn(value.label, () => finish(key), {
          className: "scene-option",
        });
        const desc = tag("span", value.desc);
        desc.id = `ending-${key}`;
        b.setAttribute("aria-label", value.label);
        b.setAttribute("aria-describedby", desc.id);
        b.replaceChildren(
          tag("small", `OPTION ${i + 1}`),
          tag("strong", value.label),
          desc,
          icon("arrow"),
        );
        options.append(b);
      }
      panel.append(
        options,
        flow(
          btn("Quitter sans choisir", closePanel, { className: "text-button" }),
        ),
      );
      return;
    }
    const line = scene.lines[cursor];
    openPanel(
      "cutscene",
      CAST[line.speaker] || ECHO_VOICES[line.speaker],
      `${kicker}  ·  ${cursor + 1}/${scene.lines.length}`,
      { focus: false },
    );
    dialog.dataset.speaker = line.speaker;
    const subtitle = tag("p", line.text, "scene-subtitle");
    subtitle.setAttribute("aria-live", "polite");
    meter = tag("div", "", "scene-meter");
    meter.setAttribute("aria-hidden", "true");
    for (let i = 0; i < scene.lines.length; i++) {
      const part = tag("span");
      if (i < cursor) part.className = "played";
      if (i === cursor) part.className = "playing";
      meter.append(part);
    }
    advance = btn(
      cursor === scene.lines.length - 1 && !choices ? "REPRENDRE" : "CONTINUER",
      next,
      { primary: true, pict: "arrow" },
    );
    voiceToggle = btn(
      "",
      () => {
        const enabled = !speech.audible;
        prefs.voices = enabled;
        if (enabled) {
          prefs.sound = true;
          if (prefs.volume === 0) prefs.volume = 0.62;
          audio.start();
          speech.begin(line);
        } else speech.fallback("silent");
        writeSettings(storage, prefs);
        syncSound();
        updateVoiceMenu();
      },
      { className: "icon-button", pict: "sound" },
    );
    toggleIcon = voiceToggle.querySelector("use");
    const replay = btn(
      "",
      () => {
        speech.begin(line);
        game.setShot(scene.id, npc, line, speech);
        advance.focus({ preventScroll: true });
      },
      { className: "icon-button", pict: "replay" },
    );
    replay.setAttribute("aria-label", "Réécouter la réplique");
    replay.title = "Réécouter la réplique";
    status = tag("span", "", "voice-status");
    const bar = tag("div", "", "scene-controls"),
      left = tag("div", "", "scene-voice");
    if (VOICES[line.id]) left.append(voiceToggle, replay);
    left.append(status);
    bar.append(
      left,
      flow(btn("Passer la scène", skip, { className: "text-button" }), advance),
    );
    panel.append(subtitle, meter, bar);
    speech.begin(line);
    audio.cinema(scene.id);
    game.setShot(scene.id, npc, line, speech);
    updateVoiceMenu();
    advance.focus({ preventScroll: true });
  }
  cutscene = session;
  render();
}
function courierShop() {
  openPanel("shop", "Courses de la Darse", "JO  /  QUAI DES MARÉES");
  panel.append(
    tag(
      "p",
      "« Un colis frais pour les Verrières, puis le reçu à la Balise Nord. En voiture, arrête-toi sur les places marquées LIVRAISON et remets-le à la portière. »",
    ),
    info([
      {
        title: "Livraison en deux étapes",
        desc:
          "2 min 35 s en jeu · 145 € à l’arrivée" +
          (game.progress.courier.best
            ? " · Record " + record(game.progress.courier.best)
            : " · Record personnel à établir"),
        action: btn(
          "ACCEPTER",
          () => {
            game.takeCourier("start");
            closePanel();
          },
          { primary: true },
        ),
      },
    ]),
  );
}
function cafeShop() {
  const p = game.progress,
    free = p.ending === "protect";
  openPanel("shop", "Café Le Sillage", "COMPTOIR  /  " + euro(p.cash));
  panel.append(
    tag(
      "p",
      free
        ? "« Inès m’a dit de t’offrir le café. Tu peux le prendre avec toi. »"
        : "« Pas besoin de rester au comptoir. Je te mets ça dans un gobelet. »",
    ),
    info([
      {
        title: "Café à emporter",
        desc: `Endurance renforcée pendant 90 s, à boire depuis le sac. En stock : ${p.coffees}/9.`,
        action: btn(
          free ? "Offert" : euro(FOOD_PRICE),
          () => {
            if (game.buy("coffee")) cafeShop();
          },
          { disabled: (p.cash < FOOD_PRICE && !free) || p.coffees >= 9 },
        ),
      },
      {
        title: "Veste de pluie",
        desc: p.hasRaincoat
          ? "La veste est dans votre garde-robe."
          : "Supprime le ralentissement dû à la pluie.",
        action: btn(
          p.hasRaincoat ? "Achetée" : euro(RAIN_PRICE),
          () => {
            if (game.buy("outfit")) cafeShop();
          },
          { disabled: p.hasRaincoat || p.cash < RAIN_PRICE },
        ),
      },
    ]),
    flow(
      btn("Changer de tenue", wardrobe, { pict: "bag" }),
      btn("Voir le sac", () => phone("bag"), { pict: "phone" }),
    ),
  );
}
function wardrobe() {
  const p = game.progress;
  openPanel("shop", "Garde-robe", "NOA VIDAL  /  TENUES");
  panel.append(
    info(
      [
        {
          key: "ruste",
          title: "Veste rouille",
          desc: "La veste de travail de Noa.",
        },
        {
          key: "night",
          title: "Veste nuit",
          desc: "Une veste sobre pour les traversées nocturnes.",
        },
        {
          key: "rain",
          title: "Veste de pluie",
          desc: p.hasRaincoat
            ? "Équipée contre les averses."
            : "Disponible au café Le Sillage.",
        },
      ].map((o) => ({
        ...o,
        action: btn(
          p.wardrobe === o.key ? "Portée" : "Équiper",
          () => {
            if (game.changeOutfit(o.key)) wardrobe();
          },
          {
            disabled:
              p.wardrobe === o.key || (o.key === "rain" && !p.hasRaincoat),
          },
        ),
      })),
    ),
    flow(btn("Ouvrir le sac", () => phone("bag"), { pict: "bag" })),
  );
}
function garageShop() {
  const p = game.progress;
  openPanel("shop", "Garage Estuaire", "ÉLIAS  /  " + euro(p.cash));
  panel.append(
    tag(
      "p",
      "Les véhicules acquis vous attendent devant l’atelier. Leur position et leur état sont sauvegardés.",
    ),
    info(
      GARAGE_STOCK.map((id) => {
        const s = VEHICLES[id];
        return {
          title: s.name,
          desc:
            id === "boreal"
              ? "Sportive · accélération vive · 126 km/h"
              : "Utilitaire · moteur coupleux · 79 km/h",
          action: btn(
            p.vehicles[id] ? "Acquis" : euro(s.price),
            () => {
              if (game.buy("car", id)) garageShop();
            },
            { disabled: !!p.vehicles[id] || p.cash < s.price },
          ),
        };
      }),
    ),
  );
}
function repairShop() {
  const p = game.progress;
  openPanel("shop", "Atelier du Ressac", "STATION  /  " + euro(p.cash));
  const cars = [...game.life.owned.values()].filter(
    (c) => distance(PLACES.repair, c) < 13,
  );
  if (!cars.length) {
    panel.append(
      tag(
        "p",
        "Garez l’un de vos véhicules près de la station, puis revenez au comptoir.",
      ),
      btn("Fermer", closePanel),
    );
    return;
  }
  panel.append(
    tag(
      "p",
      "Une réparation restaure l’accélération et la vitesse maximale du véhicule.",
    ),
    info(
      cars.map((c) => ({
        title: c.spec.name,
        desc: `État : ${Math.round((1 - c.damage) * 100)} %`,
        action: btn(
          c.damage < 0.045 ? "Bon état" : euro(REPAIR_PRICE),
          () => {
            if (game.buy("repair", c.id)) repairShop();
          },
          { disabled: c.damage < 0.045 || p.cash < REPAIR_PRICE },
        ),
      })),
    ),
  );
}
function mapScreen(returnTo) {
  if (!game) return;
  openPanel(
    "map-panel",
    "Carte de Port-Lumière",
    "NAVIGATION  /  LES DEUX RIVES",
  );
  const layout = tag("div", "", "map-layout"),
    canvas = tag("canvas", "", "map-surface"),
    sidebar = tag("div", "", "map-tools");
  canvas.setAttribute(
    "aria-label",
    "Carte des deux rives, orientée au nord. Cliquez ou touchez pour placer un repère. Les destinations sont aussi disponibles dans les raccourcis.",
  );
  canvas.setAttribute("role", "img");
  const key = tag("div", "", "map-key");
  for (const [kind, label, shape] of [
    ["hero", "Vous", "arrow"],
    ["target", "Point suivi", "diamond"],
    ["routeEnd", "Fin du tracé", "circle"],
    ["owned", "Véhicule possédé", "square"],
    ["seized", "Véhicule volé", "square"],
    ["shop", "Commerce", "square"],
    ["station", "Commissariat", "diamond"],
    ["side", "Livraison", "circle"],
    ["transport", "Embarcadère S2", "diamond"],
    ["caution", "Zone surveillée", "sector"],
  ]) {
    const row = tag("span"),
      mark = tag("i");
    mark.dataset.shape = shape;
    mark.style.setProperty("--key-color", CHART_COLORS[kind]);
    row.append(mark, document.createTextNode(label));
    key.append(row);
  }
  const places = tag("div", "", "map-places"),
    tracks = tag("div", "", "map-places map-tracks"),
    status = tag("p", "", "map-status");
  status.setAttribute("role", "status");
  const go = (p) => {
    game.setTracking("custom", p);
    refresh();
  };
  const track = (mode) => {
    game.setTracking(mode);
    refresh();
  };
  const echo = echoBrief(game.progress)?.target
    ? btn("Suivre le dossier", () => track("echo"), { pict: "diamond" })
    : null;
  const story = btn("Suivre l’histoire", () => track("story"), {
    pict: "diamond",
  });
  tracks.append(story);
  const courier =
    game.progress.courier.stage !== "idle"
      ? btn("Suivre la livraison", () => track("courier"), { pict: "pin" })
      : null;
  const freight = game.progress.port.job
    ? btn("Suivre le fret", () => track("freight"), { pict: "pin" })
    : null;
  const passage = passageBrief(game.progress)?.target
    ? btn("Suivre l’enquête de la passe", () => track("passage"), {
        pict: "diamond",
      })
    : null;
  if (passage) tracks.append(passage);
  if (freight) tracks.append(freight);
  if (echo) tracks.append(echo);
  if (courier) tracks.append(courier);
  for (const id of MAP_PLACES)
    places.append(btn(PLACES[id].label, () => go(PLACES[id]), { pict: "pin" }));
  sidebar.append(
    status,
    tracks,
    tag("b", "ESCALES", "map-subhead"),
    places,
    key,
  );
  layout.append(canvas, sidebar);
  panel.append(layout);
  if (typeof returnTo === "function")
    panel.append(
      flow(btn("Retour aux applications", returnTo, { pict: "left" })),
    );
  let projection;
  const redraw = () => {
    projection = drawChart(canvas, game, true);
  };
  const refresh = () => {
    redraw();
    const target = game.target(),
      length = game.remaining(target),
      tracking = game.progress.tracking;
    story.setAttribute("aria-pressed", String(tracking === "story"));
    courier?.setAttribute("aria-pressed", String(tracking === "courier"));
    echo?.setAttribute("aria-pressed", String(tracking === "echo"));
    freight?.setAttribute("aria-pressed", String(tracking === "freight"));
    passage?.setAttribute("aria-pressed", String(tracking === "passage"));
    status.replaceChildren(
      tag(
        "b",
        game.progress.transit.ride
          ? "NAVETTE S2 · PASSAGE EN COURS"
          : length == null
            ? "AUCUN TRAJET SUIVI"
            : `${target.custom ? "REPÈRE" : "TRAJET"} · ${Math.round(length)} m`,
      ),
      tag(
        "span",
        target.point || game.progress.transit.ride
          ? target.title
          : "Choisissez une escale ou touchez la carte.",
      ),
    );
  };
  canvas.addEventListener("click", (e) => {
    if (!projection) return;
    const r = canvas.getBoundingClientRect(),
      x = e.clientX - r.left - canvas.clientLeft,
      y = e.clientY - r.top - canvas.clientTop;
    const point =
      projection.pick(x, y, e.pointerType === "touch" ? 15 : 12) ||
      projection.world(x, y);
    if (!WORLD.allows(point.x, point.z, 0.43)) {
      status.textContent = "Placez le repère à terre ou sur le pont.";
      return;
    }
    go(point);
  });
  refresh();
  if (typeof ResizeObserver !== "undefined") {
    mapObserver = new ResizeObserver(redraw);
    mapObserver.observe(canvas);
  }
}

const passageUI = createPassageUI({
  game: () => game,
  openPanel,
  closePanel,
  tag,
  btn,
  flow,
  info,
  euro,
});
const littoralUI = createLittoralUI({
  game: () => game,
  openPanel,
  closePanel,
  tag,
  btn,
  flow,
  info,
  euro,
});
const portUI = createPortUI({
  game: () => game,
  openPanel,
  closePanel,
  phone,
  tag,
  flow,
  info,
  btn,
  icon,
  euro,
  duration,
  mapScreen: () => mapScreen(() => phone("apps")),
  settings: () => settings(() => phone("apps")),
});
function phone(tab = phoneTab) {
  if (!game) return;
  phoneTab = tab;
  const p = game.progress;
  const time = $("phone-time");
  time.dateTime = time.textContent = clock(p.time);
  openPanel("phone-panel", "LA TRAVERSE", "RÉSEAU PORTUAIRE");
  const net = tag("div", "", "phone-network");
  const vhf = tag("span", "", "phone-vhf");
  vhf.append(icon("signal"), tag("span", "VHF 16"));
  const apps = btn("Applications", () => phone("apps"), {
    className: "phone-launch",
    pict: "app-grid",
  });
  apps.setAttribute("aria-pressed", String(tab === "apps"));
  net.append(vhf, apps);
  const tabs = tag("nav", "", "phone-tabs");
  tabs.setAttribute("aria-label", "Rubriques du téléphone");
  for (const [id, label, pict] of [
    ["messages", "Messages", "message"],
    ["contacts", "Contacts", "contacts"],
    ["journal", "Journal", "notebook"],
    ["bag", "Sac", "bag"],
  ]) {
    const b = btn(label, () => phone(id), { className: "phone-tab", pict });
    b.setAttribute("aria-pressed", String(id === tab));
    tabs.append(b);
  }
  const body = tag("div", "", "phone-content");
  panel.append(net, tabs, body);
  body.dataset.app = tab;
  if (tab === "apps") portUI.apps(body);
  else if (tab === "messages") {
    const box = (name, text) => {
      const m = tag("div", "", "message");
      m.append(tag("strong", name), tag("p", text));
      return m;
    };
    if (p.ending === "publish")
      body.append(
        box(
          "AYA LE GUEN · 02:17",
          "L’article est en ligne. La capitainerie dément, mais trois familles veulent nous parler.",
        ),
        box(
          "INÈS KADER · HORS LIGNE",
          "J’ai lu l’article. Je vais couper la radio quelques jours. Prends soin de toi.",
        ),
      );
    else if (p.ending === "protect")
      body.append(
        box(
          "INÈS KADER · CANAL 16",
          "J’ai retiré les noms et mis le registre à l’abri. Passe au Sillage : Malo t’offre le café.",
        ),
        box(
          "AYA LE GUEN · 02:17",
          "J’attends la version d’Inès. On publiera les horaires du dernier signal sans exposer l’équipage.",
        ),
      );
    else {
      if (p.stage === "belvedere")
        body.append(
          box(
            "AYA LE GUEN · NOUVEAU",
            "J’ai vu le fichier. Je suis au belvédère. Laisse retomber l’alerte éventuelle, puis viens me voir.",
          ),
        );
      body.append(
        box(
          "INÈS KADER · CANAL 16",
          p.stage === "contact"
            ? "Noa, retrouve-moi au café Le Sillage. J’ai entendu quelque chose sur la fréquence de ton frère."
            : "Hangar 07, Darse Nord. Prends la Mistral si tu veux longer les quais plus vite.",
        ),
      );
    }
    const dossier = echoBrief(p);
    if (dossier)
      body.prepend(
        box(
          "SALOMÉ RENAUD · ATELIER DES ONDES",
          p.echo.outcome
            ? dossier.text
            : p.echo.accepted
              ? `Dossier en cours : ${dossier.text}`
              : p.ending === "publish"
                ? "L’article d’Aya me rappelle un appel enregistré au standard. Passe à l’atelier des Tisserands. La bande s’y trouve encore."
                : "Inès m’a confié les horaires. J’ai la bande du relais, sans nom ni adresse. Retrouve-moi à l’Atelier des Ondes.",
        ),
      );
    body.append(
      flow(
        ...(dossier?.target
          ? [
              btn(
                "Suivre le dossier",
                () => {
                  game.setTracking("echo");
                  closePanel();
                },
                { primary: true, pict: "pin" },
              ),
            ]
          : []),
        btn("Ouvrir la carte", mapScreen, { pict: "map" }),
      ),
    );
    if (passagePhase(p) === "lead") {
      body.append(
        box(`SALOMÉ RENAUD · ${PASSAGE_TITLE}`, passageBrief(p).text),
        flow(
          btn(
            "Suivre l’enquête de la passe",
            () => {
              game.setTracking("passage");
              closePanel();
            },
            { primary: true, pict: "pin" },
          ),
        ),
      );
    }
    if (!p.port.completed || p.port.job) {
      body.append(
        box(
          "JO · SERVICE DES MOUVEMENTS",
          p.port.job
            ? "Ton bordereau est dans Fret. Les quais ne remettent les caisses qu’au véhicule déclaré."
            : "La Balise Nord ouvre ses réserves aux indépendants. Les Halles et Élias attendent leurs caisses. La Mistral suffit pour une petite remise.",
        ),
        flow(
          btn("Ouvrir les bordereaux", () => phone("freight"), { pict: "pin" }),
        ),
      );
    }
  } else if (tab === "contacts") {
    const guide = (id) =>
      btn(
        "Localiser",
        () => {
          game.setTracking("custom", PLACES[id]);
          closePanel();
        },
        { pict: "pin" },
      );
    const entries = [
      {
        title: "Inès Kader",
        desc: "Canal 16 · Café Le Sillage",
        action: guide("cafe"),
      },
    ];
    if (["belvedere", "done"].includes(p.stage))
      entries.push({
        title: "Aya Le Guen",
        desc: "Journaliste · Belvédère des Marées",
        action: guide("belvedere"),
      });
    if (p.stage === "done")
      entries.push({
        title: "Salomé Renaud",
        desc: "Radio marine · Les Tisserands",
        action: guide("ondes"),
      });
    entries.push({
      title: "Mina Derval",
      desc: "Calfatage · Banc ouvert 07:30–11:45 et 14:00–19:15",
      action: guide("grevesDesk"),
    });
    entries.push({
      title: "Jo",
      desc: "Coursière · Quai des Marées",
      action: guide("courier"),
    });
    body.append(info(entries));
  } else if (tab === "journal") {
    const main = STORY[p.stage],
      side = COURIER[p.courier.stage];
    const tracking = (mode) => {
      game.setTracking(mode);
      closePanel();
    };
    body.append(
      info([
        {
          title: main.title,
          desc: main.text,
          action: btn(
            p.tracking === "story" ? "Suivi" : "Suivre",
            () => tracking("story"),
            {
              disabled: p.tracking === "story",
            },
          ),
        },
        {
          title: side.title,
          desc:
            side.text +
            (p.courier.time ? " · " + duration(p.courier.time) : "") +
            ` · ${p.courier.runs} terminée(s)` +
            (p.courier.best ? ` · Record ${record(p.courier.best)}` : ""),
          action: btn(
            p.tracking === "courier" ? "Suivi" : "Suivre",
            () => tracking("courier"),
            {
              disabled: p.tracking === "courier",
            },
          ),
        },
      ]),
      flow(btn("Navigation", mapScreen, { pict: "map" })),
    );
    const dossier = echoBrief(p);
    if (dossier) {
      const notes = Object.entries(ECHO_EVIDENCE).map(([key, note]) =>
        p.echo[key]
          ? { title: note.title, desc: note.text }
          : {
              title: "Indice non relevé",
              desc:
                key === "watch"
                  ? "Poste de veille des Marées"
                  : "Atelier des Ondes",
            },
      );
      if (p.echo.tuned)
        notes.push({
          title: "Relevé du récepteur",
          desc: "Voie C · bobine 02 h 17 · appel à 02 h 09 (heure du quai).",
        });
      body.append(
        tag("h3", `DOSSIER 02 · ${ECHO_TITLE}`, "journal-heading"),
        info([
          {
            title: dossier.title,
            desc: dossier.text,
            action: dossier.target
              ? btn("Suivre le dossier", () => tracking("echo"), {
                  pict: "pin",
                  disabled: p.tracking === "echo",
                })
              : null,
          },
          ...(p.echo.accepted ? notes : []),
        ]),
      );
    }
    passageUI.journal(body);
    if (p.port.job) {
      const target = game.target("freight");
      body.append(
        tag("h3", "La Relève du Port", "journal-heading"),
        info([
          {
            title: target.title,
            desc: target.text,
            action: btn("Suivre le fret", () => tracking("freight"), {
              pict: "pin",
            }),
          },
        ]),
      );
    }
    const scenes = [];
    for (const [clip, npc, unlocked] of [
      [CONTACT_SCENE, game.life.ines, p.stage !== "contact"],
      [FINAL_SCENE, game.life.aya, p.stage === "done"],
      [echoScene(p.ending), game.life.salome, p.echo.accepted],
      [echoScene(p.ending, true), game.life.salome, !!p.echo.outcome],
    ])
      if (unlocked)
        scenes.push({
          title: clip.title,
          desc: `${clip.place} · Séquence ${clip.index}`,
          action: btn("Revoir", () => dialogue(clip, npc, { review: true }), {
            pict: "replay",
          }),
        });
    if (scenes.length)
      body.append(
        tag("h3", "Archives des séquences", "journal-heading"),
        info(scenes),
      );
  } else if (tab === "bag") {
    const entries = [
      {
        title: `Cafés à emporter × ${p.coffees}`,
        desc:
          p.sprintBonus > 0
            ? `${Math.ceil(p.sprintBonus)} s d’endurance renforcée.`
            : "Recharge d’endurance. Disponible au Sillage.",
        action: btn(
          "Boire",
          () => {
            if (game.useFood()) phone("bag");
          },
          { disabled: !p.coffees || p.sprintBonus > 15 },
        ),
      },
    ];
    if (["belvedere", "done"].includes(p.stage))
      entries.push({
        title: "Copie des manifestes",
        desc: "Objet d’enquête · Hangar 07",
      });
    if (p.courier.stage !== "idle")
      entries.push({
        title:
          p.courier.stage === "relay"
            ? "Colis des halles"
            : "Reçu de livraison",
        desc: "Course pour Jo · ne pas perdre de temps",
      });
    entries.push({
      title: "Clés du garage",
      desc: Object.keys(p.vehicles)
        .map((id) => VEHICLES[id].name)
        .join(" · "),
    });
    body.append(
      info(entries),
      flow(btn("Garde-robe", wardrobe, { pict: "bag" })),
    );
  } else portUI.render(tab, body);
}

function keyName(e) {
  return e.code || e.key;
}
const keyList = new Set([
  "KeyW",
  "KeyZ",
  "KeyS",
  "KeyA",
  "KeyQ",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ShiftLeft",
  "ShiftRight",
  "AltLeft",
  "AltRight",
  "KeyX",
  "Space",
  "KeyC",
  "KeyV",
  "KeyB",
  "KeyE",
  "KeyF",
  "KeyM",
  "Tab",
  "Escape",
]);
function setInput() {
  if (!game) return;
  const has = (...codes) => codes.some((k) => keys.has(k)),
    opt = has("AltLeft", "AltRight"),
    touch = [...holds.values()];
  game.setInput({
    forward:
      (!game.hero.car && viewLook.walking) ||
      touch.includes("forward") ||
      has("KeyW", "KeyZ", "ArrowUp"),
    back: touch.includes("back") || has("KeyS", "ArrowDown"),
    left:
      touch.includes("left") ||
      has("KeyA", "KeyQ") ||
      (!opt && has("ArrowLeft")),
    right:
      touch.includes("right") || has("KeyD") || (!opt && has("ArrowRight")),
    sprint: has("ShiftLeft", "ShiftRight"),
    walk: has("KeyX"),
    handbrake: touch.includes("brake") || has("Space"),
    lookLeft: viewLook.edge < 0 || (opt && has("ArrowLeft")),
    lookRight: viewLook.edge > 0 || (opt && has("ArrowRight")),
  });
}
window.addEventListener("keydown", (e) => {
  if (!game || starting || dialog.open) return;
  const code = keyName(e);
  if (
    !keyList.has(code) ||
    e.metaKey ||
    e.ctrlKey ||
    (e.altKey &&
      !["AltLeft", "AltRight", "ArrowLeft", "ArrowRight"].includes(code))
  )
    return;
  if (
    (code === "Space" || code === "Tab") &&
    document.activeElement instanceof HTMLButtonElement
  )
    return;
  if (code === "Tab" && e.shiftKey) return;
  e.preventDefault();
  if (code === "Escape" && viewLook.active) {
    clearInput();
    return;
  }
  if (code === "Escape" && e.repeat) return;
  keys.add(code);
  if (!e.repeat) {
    if (code === "KeyE") act();
    if (code === "KeyF") actStreet();
    if (code === "KeyC") game.crouch();
    if (code === "KeyV") game.recenter();
    if (code === "KeyB") togglePerspective();
    if (code === "Space" && !game.hero.car) game.jump();
    if (code === "KeyM") mapScreen();
    if (code === "Tab") phone();
    if (code === "Escape") pauseMenu();
  }
  setInput();
});
window.addEventListener("keyup", (e) => {
  keys.delete(keyName(e));
  setInput();
});
window.addEventListener("blur", clearInput);
document.addEventListener("visibilitychange", () => {
  speech.visibility(document.hidden);
  audio.visibility(document.hidden);
  if (document.hidden) {
    clearInput();
    game?.save();
    audio.pause(true);
  } else if (game && !dialog.open) audio.pause(false);
});
window.addEventListener("pagehide", () => {
  clearInput();
  speech.visibility(true);
  audio.visibility(true);
  if (game && !starting) game.save();
});
window.addEventListener("pageshow", () => {
  speech.visibility(document.hidden);
  audio.visibility(document.hidden);
});
for (const b of document.querySelectorAll("[data-hold],[data-act]")) {
  const pressed = (e) => {
    if (!game || dialog.open) return;
    e.preventDefault();
    const k = b.dataset.hold,
      a = b.dataset.act;
    if (k) holds.set(e.pointerId, k);
    else if (a === "crouch") game.crouch();
    else if (game.hero.car) holds.set(e.pointerId, "brake");
    else game.jump();
    try {
      b.setPointerCapture(e.pointerId);
    } catch {}
    setInput();
  };
  const up = (e) => {
    if (holds.delete(e.pointerId)) setInput();
  };
  b.addEventListener("pointerdown", pressed);
  for (const e of ["pointerup", "pointercancel", "lostpointercapture"])
    b.addEventListener(e, up);
}
$("start-game").addEventListener("click", () => start());
$("new-game").addEventListener("click", confirmNew);
$("choose-slot").addEventListener("click", chooseSlot);
window.addEventListener("storage", () => {
  if (!game && !starting) setMenu();
});
$("title-controls").addEventListener("click", controls);
$("title-settings").addEventListener("click", settings);
$("title-sound").addEventListener("click", () => {
  prefs.sound = !prefs.sound;
  writeSettings(storage, prefs);
  syncSound();
  audio.volume();
});
$("toggle-view").addEventListener("click", () => {
  togglePerspective();
  viewport.focus({ preventScroll: true });
});
$("open-map").addEventListener("click", mapScreen);
$("radar-open").addEventListener("click", mapScreen);
$("open-phone").addEventListener("click", () => phone());
$("open-pause").addEventListener("click", pauseMenu);
$("interact-button").addEventListener("click", () => {
  act();
  if (!dialog.open) viewport.focus({ preventScroll: true });
});
$("street-button").addEventListener("click", () => {
  if (streetOffer) actStreet(streetOffer);
  if (!dialog.open) viewport.focus({ preventScroll: true });
});
setMenu();
