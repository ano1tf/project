import { gameMinute } from "./accounts.mjs";
import { portClock } from "./port.mjs";
import {
  WORKSHOP_TITLE,
  WORKSHOP_FEE,
  controlSheet,
  nextBench,
  shiftPhase,
  workshopStatus,
} from "./littoral.mjs";

const mm = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const format = (n) => `${mm.format(n / 100)} mm`;
export function createLittoralUI({
  game,
  openPanel,
  closePanel,
  tag,
  btn,
  flow,
  info,
  euro,
}) {
  function bench() {
    const g = game(),
      p = g.progress;
    const body = openPanel(
      "shop",
      WORKSHOP_TITLE,
      "QUAI DES CALFATS  /  MINA DERVAL",
    );
    const status = workshopStatus(p);
    const done = () => flow(btn("Quitter le banc", closePanel));
    if (status === "alert") {
      body.append(
        tag(
          "p",
          "Mina ne valide pas les opérations pendant un contrôle de la sûreté.",
        ),
        done(),
      );
      return;
    }
    if (status === "done") {
      body.append(
        tag(
          "p",
          `Lot du jour poinçonné à ${portClock(p.workshop.last)}. Le règlement de ${euro(WORKSHOP_FEE)} figure dans Banque.`,
        ),
        done(),
      );
      return;
    }
    if (status === "closed") {
      const next = nextBench(gameMinute(p));
      body.append(
        tag(
          "p",
          shiftPhase(p.time) === "round"
            ? "Mina fait le tour des jauges. L’atelier reste ouvert, mais la validation reprend à 14 h."
            : "Le poste de contrôle est au repos. Les chauffeurs peuvent toujours utiliser la baie.",
        ),
        tag(
          "p",
          `Permanences : 07:30–11:45 et 14:00–19:15 · reprise ${portClock(next)}.`,
        ),
        g.canWait()
          ? flow(
              btn(
                `Attendre ici jusqu’à ${portClock(next)}`,
                () => {
                  if (g.restAtBench(next)) bench();
                },
                { primary: true, pict: "keys" },
              ),
            )
          : tag(
              "p",
              "Terminez le fret ou la course avant d’attendre.",
              "panel-note",
            ),
        done(),
      );
      return;
    }
    const s = controlSheet(p.port.day);
    const feedback = tag(
      "p",
      "Une seule pièce du lot respecte la tolérance.",
      "panel-note",
    );
    feedback.setAttribute("role", "status");
    const readings = info(
      s.readings.map((n, i) => {
        const name = "ABC"[i];
        return {
          title: `Joint ${name}`,
          desc: `Lecture brute : ${format(n)}`,
          action: btn(`Valider ${name}`, () => {
            const r = g.inspectAtBench(i);
            if (r.status === "paid") bench();
            else
              feedback.textContent =
                r.status === "wrong"
                  ? `${name} mesure ${format(r.measured)} après correction : hors tolérance. Essayez une autre pièce.`
                  : r.status === "funds"
                    ? "Le règlement réservataire de fret bloque la caisse. Revenez après le prochain réassort ou une remise."
                    : "Le contrôle n’est plus disponible. Relisez la feuille de poste.";
          }),
        };
      }),
    );
    body.append(
      tag(
        "p",
        `Lot ${s.reference} · Cote demandée : ${format(s.nominal)} ± ${format(s.tolerance)}. Prime : ${euro(WORKSHOP_FEE)}.`,
      ),
      tag(
        "p",
        `Comparateur à vide : ${s.zero < 0 ? "−" : "+"}${format(Math.abs(s.zero))}. Soustrayez ce zéro à chaque lecture brute avant de choisir.`,
      ),
      readings,
      feedback,
      done(),
    );
  }
  return { bench };
}
