import { postCash } from "./accounts.mjs";

// Optional investigation. Keep the existing chapter, courier and save version independent.
export const ECHO_TITLE = "Fréquences de veille";
export const ECHO_EVIDENCE = Object.freeze({
  watch: {
    title: "Registre de veille",
    text: "02 h 09 — poste de veille : appel relayé depuis la passe. L’horloge d’enregistrement du standard est en avance de huit minutes. Horodatage sur la bobine : 02 h 17.",
  },
  badge: {
    title: "Plaque du commutateur",
    text: "A — capitainerie. B — manœuvres de quai. C — écoute et enregistrement du relais de la passe. Pour isoler l’appel archivé, utiliser la voie du relais.",
  },
});
export const ECHO_OUTCOMES = Object.freeze({
  archive: {
    label: "Déposer la transcription",
    desc: "Une copie sans les voix est affichée au poste de veille. Les familles peuvent confronter l’heure réelle au registre.",
    message:
      "La transcription est au poste, sans la voix de la relayeuse. Deux familles comparent déjà leurs carnets.",
    reward: 125,
  },
  seal: {
    label: "Sceller la bande originale",
    desc: "Salomé garde la bande entière sous scellé. Le poste indique où demander une écoute privée avec l’accord des familles.",
    message:
      "J’ai scellé la bobine à l’atelier. Le poste renvoie les familles ici. Personne n’écoutera cette voix sans leur accord.",
    reward: 125,
  },
});
export const ECHO_VOICES = { salome: "Salomé Renaud" };
const brief = {
  lead: {
    title: ECHO_TITLE,
    text: "Salomé a reconnu le timbre du relais. Retrouvez-la dans l’Atelier des Ondes, au passage des Verrières.",
    target: "ondes",
  },
  watch: {
    title: "Deux horloges",
    text: "Consultez le registre au poste de veille du quai. La différence entre l’heure réelle et celle du standard compte.",
    target: "watch",
  },
  badge: {
    title: "Les voies du standard",
    text: "Relevez le code du relais sur la plaque de commutation, dans l’atelier.",
    target: "badge",
  },
  decode: {
    title: "Isoler la fréquence",
    text: "Sur le récepteur, choisissez la voie et l’heure lue sur la bobine. Vos relevés sont dans le Journal.",
    target: "receiver",
  },
  debrief: {
    title: "À qui appartient cette voix ?",
    text: "Racontez à Salomé ce que révèle la bande. Décidez où conserver la preuve.",
    target: "ondes",
  },
};
export const freshEcho = () => ({
  accepted: false,
  watch: false,
  badge: false,
  tuned: false,
  outcome: null,
});
export function restoreEcho(input, stage) {
  const next = freshEcho();
  if (stage !== "done" || input?.accepted !== true) return next;
  next.accepted = true;
  next.watch = input.watch === true;
  next.badge = input.badge === true;
  next.tuned = next.watch && next.badge && input.tuned === true;
  if (
    next.tuned &&
    typeof input.outcome === "string" &&
    Object.hasOwn(ECHO_OUTCOMES, input.outcome)
  )
    next.outcome = input.outcome;
  return next;
}
export function echoPhase(progress) {
  if (progress.stage !== "done") return "locked";
  const e = progress.echo;
  if (e?.outcome) return "closed";
  if (!e?.accepted) return "lead";
  if (e.tuned) return "debrief";
  return e.watch && e.badge ? "decode" : "gather";
}
export function echoBrief(progress) {
  const phase = echoPhase(progress);
  if (phase === "closed")
    return {
      title: ECHO_TITLE,
      text: ECHO_OUTCOMES[progress.echo.outcome].message,
      target: null,
    };
  if (phase === "gather") return brief[progress.echo.watch ? "badge" : "watch"];
  return brief[phase] ?? null;
}
export function echoEvent(progress, event, choice) {
  if (progress.custody) return false;
  const phase = echoPhase(progress),
    e = progress.echo;
  if (event === "accept" && phase === "lead") {
    e.accepted = true;
    // Don't derail a live timed assignment.
    if (progress.courier.stage === "idle") progress.tracking = "echo";
  } else if (
    phase === "gather" &&
    Object.hasOwn(ECHO_EVIDENCE, event) &&
    !e[event]
  ) {
    e[event] = true;
  } else if (
    phase === "decode" &&
    event === "tune" &&
    choice?.track === "C" &&
    choice.stamp === "0217"
  ) {
    e.tuned = true;
  } else if (
    phase === "debrief" &&
    event === "finish" &&
    typeof choice === "string" &&
    Object.hasOwn(ECHO_OUTCOMES, choice)
  ) {
    e.outcome = choice;
    postCash(progress, ECHO_OUTCOMES[choice].reward, "echo");
    if (progress.tracking === "echo") progress.tracking = "story";
  } else return false;
  return true;
}

export function echoScene(ending, debrief = false) {
  const couplet = debrief
    ? [
        [
          "noa",
          "reverse",
          "paper",
          "L’appel est passé par le relais de la passe à deux heures neuf. La bande dit deux heures dix-sept. Quelqu’un a confondu les deux horloges.",
        ],
        [
          "salome",
          "close",
          "confide",
          "Ce n’est pas un faux appel, mais huit minutes qui changent la route possible du remorqueur. On garde la voix sous scellé ou on rend l’heure publique ?",
        ],
      ]
    : [
        [
          "salome",
          "wide",
          "look",
          ending === "publish"
            ? "J’ai lu l’article d’Aya. Les familles reconnaissent la voix, mais personne ne s’accorde sur l’heure. J’ai gardé le récepteur du vieux standard."
            : "Inès m’a envoyé les horaires, pas les noms. Elle a bien fait. J’ai gardé le récepteur du vieux standard. On peut dater l’appel sans trahir sa source.",
        ],
        [
          "noa",
          "reverse",
          "question",
          "Mon frère suivait les feux de la passe. Si je retrouve l’heure exacte, je saurai de quel côté il naviguait.",
        ],
        [
          "salome",
          "profile",
          "indicate",
          "Note l’heure de la bobine au poste de veille, puis relève la voie sur la plaque ici. Le récepteur me dira si ces deux indices concordent.",
        ],
      ];
  return {
    id: "ondes",
    title: debrief ? "Huit minutes de plus" : ECHO_TITLE,
    chapter: "DOSSIER 02",
    index: debrief ? "04" : "03",
    place: "Atelier des Ondes",
    frequency: "RELAIS · LA PASSE",
    lines: couplet.map(([speaker, shot, cue, text], i) => ({
      id: `ondes-${debrief ? 2 : 1}-${i}`,
      speaker,
      shot,
      cue,
      text,
    })),
  };
}
