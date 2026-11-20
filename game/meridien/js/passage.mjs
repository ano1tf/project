import { gameMinute, postCash } from "./accounts.mjs";
import { scheduled, RIDE_MINUTES } from "./sondes.mjs";

export const PASSAGE_TITLE = "Le Cahier de la passe";
export const PASSAGE_REWARD = 170;
export const CHANNELS = Object.freeze({
  nord: "Darse Nord",
  greves: "Passe des Grèves",
  verrieres: "Chenal des Verrières",
});
export const PASSAGE_OUTCOMES = Object.freeze({
  bulletin: {
    label: "Afficher le tracé sans noms",
    text: "Le tracé anonymisé est affiché au comptoir des Grèves. Les voix et les noms ne figurent pas sur le plan.",
  },
  families: {
    label: "Remettre le tracé aux familles",
    text: "Le tracé est remis aux familles. Au comptoir des Grèves, une note les oriente vers Mina sans exposer leur itinéraire.",
  },
});
export const SOURCE = Object.freeze({
  archive:
    "Deux familles ont annoté la transcription publique de 02 h 09. Avec leur accord, Salomé demande de retrouver l’amer marqué sur le cahier, sans reprendre la voix.",
  seal: "La bande reste sous scellé chez Salomé. Les familles autorisent uniquement la comparaison de l’heure corrigée, 02 h 09, avec le cahier du quai. La voix ne quitte pas l’atelier.",
});
export const LAUNCH_NOTE =
  "Plan tamponné à bord : amer 07 — Passe des Grèves ; amer 12 — Chenal des Verrières ; amer 17 — Darse Nord. La numérotation d’origine est encore gravée sur les bornes.";
export const TIDE_LOG =
  "Cahier du bâtiment pilote, heure du quai : à 02 h 09, alignement sur l’amer 07 ; à 02 h 17, signal de dégagement près de l’amer 17. L’heure imprimée sur la bobine n’est pas l’heure du quai.";
export const freshPassage = () => ({
  accepted: false,
  sample: null,
  matched: false,
  outcome: null,
  filed: null,
});
export function restorePassage(raw, echo, at) {
  const p = freshPassage();
  if (!echo.outcome || raw?.accepted !== true) return p;
  p.accepted = true;
  if (!scheduled("port", raw.sample) || raw.sample + RIDE_MINUTES > at)
    return p;
  p.sample = raw.sample;
  if (raw.matched !== true) return p;
  p.matched = true;
  if (
    typeof raw.outcome === "string" &&
    Object.hasOwn(PASSAGE_OUTCOMES, raw.outcome) &&
    Number.isSafeInteger(raw.filed) &&
    raw.filed >= p.sample + RIDE_MINUTES &&
    raw.filed <= at
  ) {
    p.outcome = raw.outcome;
    p.filed = raw.filed;
  }
  return p;
}
export function passagePhase(p) {
  if (!p.echo.outcome) return "locked";
  if (p.passage.outcome) return "closed";
  if (!p.passage.accepted) return "lead";
  if (p.passage.sample === null) return "sail";
  return p.passage.matched ? "file" : "compare";
}
export function passageBrief(p) {
  switch (passagePhase(p)) {
    case "lead":
      return {
        title: PASSAGE_TITLE,
        text: "Les familles ont retrouvé un numéro de borne dans un ancien cahier. Salomé vous attend à l’Atelier des Ondes.",
        target: "ondes",
      };
    case "sail":
      return {
        title: "Relever les amers de la passe",
        text: "Traversez avec la navette des Sondes depuis l’embarcadère des Marées. Le plan tamponné à bord identifie les anciennes bornes. Place de relevé prise en charge.",
        target: "sondesPort",
      };
    case "compare":
      return {
        title: "Rapprocher le cahier du quai",
        text: "Aux Grèves, lisez le registre à l’intérieur de l’atelier. Recoupez l’heure réelle de l’appel et le plan ramené de la navette.",
        target: "grevesLog",
      };
    case "file":
      return {
        title: "Où déposer le tracé ?",
        text: "Décidez avec le comptoir des Grèves à qui remettre le plan. L’issue du dossier des Ondes reste inchangée.",
        target: "grevesLog",
      };
    case "closed":
      return {
        title: PASSAGE_TITLE,
        text: PASSAGE_OUTCOMES[p.passage.outcome].text,
        target: null,
      };
    default:
      return null;
  }
}
export function passageEvent(p, event, value) {
  if (p.custody || p.alert.level || p.transit.ride) return false;
  const phase = passagePhase(p),
    q = p.passage;
  if (phase === "lead" && event === "accept") {
    q.accepted = true;
    if (p.courier.stage === "idle" && !p.port.job) p.tracking = "passage";
  } else if (
    phase === "sail" &&
    event === "sample" &&
    value?.from === "port" &&
    scheduled(value.from, value.departure) &&
    gameMinute(p) >= value.departure + RIDE_MINUTES &&
    p.transit.last?.departure === value.departure
  ) {
    q.sample = value.departure;
  } else if (phase === "compare" && event === "match" && value === "greves") {
    q.matched = true;
  } else if (
    phase === "file" &&
    event === "file" &&
    typeof value === "string" &&
    Object.hasOwn(PASSAGE_OUTCOMES, value)
  ) {
    q.outcome = value;
    q.filed = gameMinute(p);
    postCash(p, PASSAGE_REWARD, "passage");
    if (p.tracking === "passage") p.tracking = "story";
  } else return false;
  return true;
}
