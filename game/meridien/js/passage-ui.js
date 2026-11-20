import { gameMinute } from "./accounts.mjs";
import { portClock } from "./port.mjs";
import {
  DOCKS,
  LINE_NAME,
  RIDE_MINUTES,
  departures,
  otherDock,
  fareFor,
} from "./sondes.mjs";
import {
  CHANNELS,
  LAUNCH_NOTE,
  PASSAGE_OUTCOMES,
  PASSAGE_REWARD,
  PASSAGE_TITLE,
  SOURCE,
  TIDE_LOG,
  passageBrief,
  passagePhase,
} from "./passage.mjs";

export function createPassageUI({
  game,
  openPanel,
  closePanel,
  tag,
  btn,
  flow,
  info,
  euro,
}) {
  const note = (t) => tag("p", t, "panel-note");
  const back = (label = "Reprendre") => flow(btn(label, closePanel));
  function invitation(body) {
    const g = game(),
      phase = passagePhase(g.progress);
    if (phase === "locked") return;
    const lead = phase === "lead";
    body.append(
      tag("h3", PASSAGE_TITLE, "journal-heading"),
      note(
        lead ? SOURCE[g.progress.echo.outcome] : passageBrief(g.progress).text,
      ),
    );
    if (lead)
      body.append(
        flow(
          btn(
            "Ouvrir le dossier de la passe",
            () => {
              if (g.caseAction("accept")) closePanel();
              else
                invitationError.textContent =
                  "Salomé attend la fin du contrôle de la sûreté.";
            },
            { primary: true, pict: "diamond" },
          ),
        ),
      );
    const invitationError = note("");
    invitationError.setAttribute("role", "status");
    if (lead) body.append(invitationError);
  }
  function log() {
    const g = game(),
      p = g.progress,
      phase = passagePhase(p);
    const body = openPanel(
      "landmark",
      "Registre des Calfats",
      "ATELIER DES GRÈVES  /  CAHIER DU BÂTIMENT PILOTE",
    );
    body.append(tag("p", TIDE_LOG));
    if (g.life.alert.level && (phase === "compare" || phase === "file")) {
      body.append(
        note(
          "Le registre reste consultable, mais le comptoir ne valide pas de dépôt pendant un contrôle.",
        ),
        back(),
      );
      return;
    }
    if (phase === "locked" || phase === "lead")
      body.append(
        note(
          "Le cahier est consultable librement. Pour dater l’appel, il faudra le relevé du poste de veille et le plan des amers.",
        ),
      );
    else if (phase === "sail")
      body.append(
        note(
          "Sans le plan tamponné à bord de la navette des Marées, le numéro de la borne n’identifie pas encore la passe.",
        ),
      );
    else {
      body.append(note(LAUNCH_NOTE));
      if (phase === "compare") {
        const reply = note(
          "Registre et bobine ne donnent pas la même heure. Utilisez l’heure réelle consignée dans le Journal.",
        );
        reply.setAttribute("role", "status");
        body.append(
          tag("h3", "Par où est passé le remorqueur ?", "journal-heading"),
          flow(
            ...Object.entries(CHANNELS).map(([id, label]) =>
              btn(label, () => {
                if (g.caseAction("match", id)) log();
                else
                  reply.textContent =
                    "Ce choix ne rapproche pas les deux relevés. Regardez l’entrée de 02 h 09 et le numéro correspondant sur le plan embarqué.";
              }),
            ),
          ),
          reply,
        );
      } else if (phase === "file") {
        const status = note("");
        status.setAttribute("role", "status");
        body.append(
          tag(
            "h3",
            "Le remorqueur suivait la passe des Grèves",
            "journal-heading",
          ),
          tag(
            "p",
            `Déposez le tracé pour clore le dossier (${euro(PASSAGE_REWARD)}). La bande des Ondes n’est jamais déplacée ni publiée ici.`,
          ),
          info(
            Object.entries(PASSAGE_OUTCOMES).map(([key, result]) => ({
              title: result.label,
              desc: result.text,
              action: btn(
                key === "bulletin" ? "Afficher" : "Confier",
                () => {
                  if (g.caseAction("file", key)) log();
                  else
                    status.textContent =
                      "Impossible de déposer le tracé pendant ce contrôle.";
                },
                { primary: true },
              ),
            })),
          ),
          status,
        );
      } else if (phase === "closed") {
        body.append(
          tag(
            "h3",
            p.passage.outcome === "bulletin"
              ? "Affiche du quai · consultable"
              : "Pochette des familles · conservée",
            "journal-heading",
          ),
          tag("p", PASSAGE_OUTCOMES[p.passage.outcome].text),
          note(
            `Trace déposée ${portClock(p.passage.filed)} · règlement inscrit dans Banque.`,
          ),
        );
      }
    }
    body.append(back());
  }
  function terminal(from) {
    const g = game(),
      p = g.progress,
      now = gameMinute(p),
      fare = fareFor(p),
      t = departures(from, now);
    const d = DOCKS[from],
      dest = DOCKS[otherDock(from)];
    const body = openPanel("landmark", LINE_NAME, d.label.toUpperCase());
    const status = note(
      t.open
        ? "Embarquement ouvert."
        : t.prior == null
          ? "Le premier embarquement n’est pas encore ouvert."
          : `Dernier départ : ${portClock(t.prior)}. Prenez le suivant ou revenez par le pont.`,
    );
    status.setAttribute("role", "status");
    body.append(
      info([
        {
          title: dest.label,
          desc: `Départ ${portClock(t.next)} · Arrivée ${portClock(t.arrives)} · ${fare ? euro(fare) : "place de relevé prise en charge"}`,
        },
      ]),
      status,
      note(
        `Piétons uniquement. Embarquement dès ${portClock(t.opens)}. Le véhicule reste en stationnement et les échéances continuent de courir.`,
      ),
    );
    if (t.open)
      body.append(
        flow(
          btn(
            fare ? `Embarquer · ${euro(fare)}` : "Embarquer · Place de relevé",
            () => {
              if (g.boardLaunch(from, t.next)) closePanel();
              else
                status.textContent =
                  "Embarquement non disponible : vérifiez le solde et l’absence de contrôle.";
            },
            { primary: true, pict: "arrow" },
          ),
        ),
      );
    else if (g.canWait())
      body.append(
        flow(
          btn(
            `Attendre jusqu’à ${portClock(t.opens)}`,
            () => {
              if (g.restAtDock(from, t.opens)) terminal(from);
              else status.textContent = "L’attente n’est plus disponible.";
            },
            { primary: true, pict: "keys" },
          ),
        ),
      );
    else
      body.append(
        note(
          "Pas d’attente accélérée pendant une course, un bordereau ou un contrôle. Le pont reste ouvert.",
        ),
      );
    body.append(back("Quitter l’embarcadère"));
  }
  function onboard() {
    const p = game().progress,
      r = p.transit.ride;
    if (!r) return;
    const body = openPanel("landmark", LINE_NAME, "LIGNE S2  /  À BORD");
    body.append(
      info([
        {
          title: `${DOCKS[r.from].label} → ${DOCKS[otherDock(r.from)].label}`,
          desc: `Départ ${portClock(r.departure)} · Arrivée ${portClock(r.departure + RIDE_MINUTES)} · ${r.fare ? euro(r.fare) : "Place de relevé"}`,
        },
      ]),
      note(
        "Le trajet est conservé dans le carnet. À l’arrivée, vous descendrez sur le quai.",
      ),
      back("Reprendre le passage"),
    );
  }
  function journal(body) {
    const g = game(),
      p = g.progress,
      clue = passageBrief(p);
    if (clue) {
      const entries = [
        {
          title: clue.title,
          desc: clue.text,
          action: clue.target
            ? btn(
                "Suivre l’enquête de la passe",
                () => {
                  g.setTracking("passage");
                  closePanel();
                },
                { pict: "pin", disabled: p.tracking === "passage" },
              )
            : null,
        },
      ];
      if (p.passage.accepted)
        entries.push({
          title:
            p.echo.outcome === "seal"
              ? "Appel conservé sous scellé"
              : "Transcription anonymisée",
          desc: SOURCE[p.echo.outcome],
        });
      if (p.passage.sample !== null)
        entries.push({
          title: `Relevé de la navette · ${portClock(p.passage.sample)}`,
          desc: LAUNCH_NOTE,
        });
      if (p.passage.matched)
        entries.push({
          title: "Rapprochement des deux horloges",
          desc: TIDE_LOG + " Le remorqueur avait pris la passe des Grèves.",
        });
      if (p.passage.filed !== null)
        entries.push({
          title: `Dossier clos · ${portClock(p.passage.filed)}`,
          desc: `Règlement : ${euro(PASSAGE_REWARD)}`,
        });
      body.append(
        tag("h3", `DOSSIER 03 · ${PASSAGE_TITLE}`, "journal-heading"),
        info(entries),
      );
    }
    const last = p.transit.ride || p.transit.last;
    if (last)
      body.append(
        tag("h3", LINE_NAME, "journal-heading"),
        info([
          {
            title: p.transit.ride ? "Billet en cours" : "Dernier passage",
            desc: `${DOCKS[last.from].label} → ${DOCKS[otherDock(last.from)].label} · ${portClock(last.departure)}–${portClock(last.departure + RIDE_MINUTES)} · ${last.fare ? euro(last.fare) : "Place de relevé"}`,
          },
        ]),
      );
  }
  return { invitation, log, terminal, onboard, journal };
}
