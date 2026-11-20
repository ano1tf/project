import { DELIVERY_BAYS, PLACES, VEHICLES } from "./data.mjs";
import { DOCKS, LINE_NAME, departures, FARE } from "./sondes.mjs";
import { nextBench, shiftPhase } from "./littoral.mjs";
import { ACCOUNT_LABELS, gameMinute } from "./accounts.mjs";
import {
  agenda,
  CLIENTS,
  FLOAT,
  PORT_CALLS,
  PROPERTY_PRICE,
  quoteFreight,
  RACK_PRICE,
  portClock,
  vehicleCapacity,
} from "./port.mjs";

export const PORT_APPS = [
  ["freight", "Fret", "parcel", "Bordereaux & stocks"],
  ["bank", "Banque", "bag", "Relevé des opérations"],
  ["news", "Actualités", "wave", "Mouvements du quai"],
  ["agenda", "Agenda", "keys", "Horaires du port"],
  ["estate", "Immobilier", "diamond", "Concession & titre"],
  ["vehicles", "Véhicules", "replay", "Garage & positions"],
  ["atlas", "Carte", "map", "Port-Lumière"],
  ["settings", "Paramètres", "settings", "Affichage & son"],
];
const count = (n, noun) => `${n} ${noun}${n !== 1 ? "s" : ""}`;
const people = CLIENTS;

function headline(e) {
  const person = people[e.id],
    vessel = PORT_CALLS[e.trip]?.name;
  switch (e.kind) {
    case "arrival":
      return [`${vessel} à quai`, "Arrivée enregistrée à la Balise Nord."];
    case "unload":
      return [
        "Manifeste rapproché",
        `${vessel} · ${count(e.qty, "caisse")} réceptionnée(s) dans le stock de la Balise.`,
      ];
    case "departure":
      return [
        `${vessel} a largué ses amarres`,
        "La cargaison débarquée reste dans la réserve du port.",
      ];
    case "shelves":
      return [
        `Rupture · ${person?.name || "quai"}`,
        `Il a manqué ${count(e.qty, "caisse")} lors de la vente.`,
      ];
    case "restock":
      return [
        `Réassort · ${person?.name || "quai"}`,
        `Le service du port a transféré ${count(e.qty, "caisse")} depuis la Balise.`,
      ];
    case "dispatch":
      return [
        "Tournée confiée par Jo",
        `${count(e.qty, "caisse")} pour ${person?.name || "le quai"} · Compte du Comptoir débité.`,
      ];
    case "settled":
      return [
        "Tournée soldée",
        `${person?.name || "Le client"} a pris livraison de ${count(e.qty, "caisse")} et réglé le Comptoir.`,
      ];
    case "delivered":
      return [
        "Bordereau retourné",
        `${person?.person || "Le client"} a réceptionné ${count(e.qty, "caisse")} transportée(s) par Noa Vidal.`,
      ];
    case "returned":
      return [
        "Fret restitué",
        `${count(e.qty, "caisse")} réintégrée(s) à la Balise Nord, sans règlement.`,
      ];
    case "expired":
      return [
        "Bordereau échu",
        `Le port a libéré le créneau de ${person?.name || "livraison"}.`,
      ];
    case "property":
      return [
        "Un nouveau nom sur le quai",
        "Noa Vidal a acquis le Comptoir 12.",
      ];
    case "agreement":
      return e.id
        ? [
            "Accord de quartier",
            "Le Comptoir donne la priorité aux Halles à tarif réduit.",
          ]
        : ["Accord ouvert", "Le Comptoir dessert de nouveau les deux clients."];
    default:
      return ["Registre du port", "Mouvement enregistré."];
  }
}

export function createPortUI({
  game,
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
  mapScreen,
  settings,
}) {
  const track = (point) => {
    game().setTracking("custom", point);
    closePanel();
  };
  const note = (text) => tag("p", text, "panel-note");
  const heading = (text) => tag("h3", text, "journal-heading");
  const cards = (entries) => {
    const grid = tag("div", "", "port-stats");
    for (const [value, label] of entries) {
      const tile = tag("div");
      tile.append(tag("small", label), tag("b", String(value)));
      grid.append(tile);
    }
    return grid;
  };
  const followJob = () =>
    btn(
      "Suivre le fret",
      () => {
        game().setTracking("freight");
        closePanel();
      },
      { className: "primary freight-follow", pict: "pin" },
    );

  function freight(body) {
    const g = game(),
      p = g.progress,
      port = p.port,
      j = port.job;
    body.append(
      heading("Service des mouvements"),
      cards([
        [port.depot.market, "Vivres · Balise"],
        [port.depot.garage, "Pièces · Balise"],
        [port.completed, "Remises validées"],
      ]),
    );
    if (j) {
      const ticket = tag("article", "", "freight-ticket");
      const head = tag("header", "", "freight-ticket-head");
      const parcel = tag("span", "", "freight-ticket-icon");
      parcel.append(icon("parcel"));
      const destination = tag("div");
      destination.append(
        tag("h4", people[j.id].name),
        tag(
          "p",
          j.stage === "collect"
            ? "À charger · Balise Nord"
            : "En soute · à livrer",
        ),
      );
      head.append(parcel, destination);
      const facts = tag("div", "", "freight-ticket-facts");
      const summary = tag("p", "", "freight-ticket-summary");
      summary.append(
        tag("span", `${count(j.qty, "caisse")} · ${VEHICLES[j.vehicle].name}`),
        tag("strong", euro(j.pay)),
      );
      const due = tag("p", "", "freight-ticket-due");
      due.append(
        icon("clock"),
        tag(
          "span",
          `Échéance ${portClock(j.due)} (${duration((j.due - gameMinute(p)) / 1.03)})`,
        ),
      );
      facts.append(summary, due);
      ticket.append(head, facts);
      const actions = flow(
        followJob(),
        j.stage === "collect"
          ? btn(
              "Annuler la réservation",
              () => {
                if (g.cancelFreight()) phone("freight");
              },
              {
                className: "small-button freight-cancel",
                disabled: !!p.custody,
              },
            )
          : btn(
              "Localiser la baie de retour",
              () => track(DELIVERY_BAYS.depot),
              { className: "small-button freight-return", pict: "pin" },
            ),
      );
      actions.classList.add("freight-actions");
      body.append(ticket, actions);
      if (j.stage === "loaded")
        body.append(
          note(
            "Pour restituer le chargement, revenez à la Balise Nord avec le véhicule déclaré. Une restitution ne rapporte rien ; une cargaison échue entame la confiance.",
          ),
        );
      return;
    }
    body.append(
      note(
        "Réservez un chargement, puis chargez et livrez à la portière dans les zones marquées. Il est possible de faire du fret sans avancer dans l’enquête.",
      ),
    );
    if (p.custody || g.life.alert.level) {
      body.append(
        note(
          "La sûreté bloque les nouveaux bordereaux tant que le contrôle n’est pas terminé.",
        ),
      );
      return;
    }
    const available = Object.keys(p.vehicles).filter(
      (id) => vehicleCapacity(id) > 0,
    );
    if (!available.length) {
      body.append(
        note("Un véhicule personnel avec une capacité de fret est nécessaire."),
      );
      return;
    }
    const selectLabel = tag("label", "Véhicule de fret", "port-select"),
      select = tag("select");
    for (const id of available) {
      const o = tag(
        "option",
        `${VEHICLES[id].name} · ${vehicleCapacity(id)} caisses max.`,
      );
      o.value = id;
      select.append(o);
    }
    if (available.includes(g.hero.car?.id)) select.value = g.hero.car.id;
    selectLabel.append(select);
    const offers = tag("div", "", "port-offers");
    const redraw = () => {
      const v = select.value;
      offers.replaceChildren();
      for (const [id, c] of Object.entries(people)) {
        const a = port.clients[id],
          card = tag("section", "", "port-offer");
        card.append(
          tag("h3", `${c.name} · ${c.goods}`),
          tag(
            "p",
            `${c.person} · Rayon ${a.stock}/${c.capacity} · Confiance ${a.trust >= 0 ? "+" : ""}${a.trust}${id === "greves" ? ` · ${port.depot.greves} joints à la Balise` : ""}`,
          ),
        );
        if (a.shortage)
          card.append(tag("small", "URGENT · rayon incomplet", "port-urgent"));
        let offered = false;
        const actions = [];
        for (const qty of [2, 5]) {
          if (vehicleCapacity(v) < qty) continue;
          const quote = quoteFreight(p, id, v, qty);
          if (!quote) continue;
          offered = true;
          actions.push(
            btn(
              `Signer · ${qty} caisses · ${euro(quote.pay)}`,
              () => {
                if (g.signedFreight(id, v, qty)) phone("freight");
                else redraw();
              },
              { primary: true },
            ),
          );
        }
        if (offered) card.append(flow(...actions));
        else
          card.append(
            note(
              "Pas de créneau pour ce véhicule : vérifiez la quantité au port, les rayons et la prochaine escale.",
            ),
          );
        offers.append(card);
      }
    };
    select.addEventListener("change", redraw);
    redraw();
    body.append(selectLabel, offers);
    if (port.lost)
      body.append(note(`${count(port.lost, "bordereau")} échu(s).`));
  }

  function render(tab, body) {
    const g = game(),
      p = g.progress,
      port = p.port,
      b = port.venture;
    if (tab === "freight") freight(body);
    else if (tab === "bank") {
      body.append(
        heading("Compte Vidal"),
        cards([
          [euro(p.cash), "Disponible"],
          [euro(b.reserve), "Caisse professionnelle"],
        ]),
        note(
          "Le relevé conserve les opérations enregistrées depuis la mise à jour ; le solde des anciennes parties est repris tel quel.",
        ),
      );
      if (p.ledger.length)
        body.append(
          info(
            p.ledger.map((row) => ({
              title: `${row.delta < 0 ? "−" : "+"}${euro(Math.abs(row.delta))} · ${ACCOUNT_LABELS[row.kind]}`,
              desc: `${portClock(row.at)} · Solde après opération : ${euro(row.balance)}`,
            })),
          ),
        );
      else body.append(note("Aucune nouvelle opération dans ce carnet."));
    } else if (tab === "news") {
      body.append(
        heading("Le Fil des Marées"),
        note(
          "Les dépêches sont issues du registre de cette partie. Elles ne font pas avancer le temps.",
        ),
      );
      if (port.news.length)
        body.append(
          info(
            port.news.map((e) => {
              const [title, text] = headline(e);
              return { title, desc: `${portClock(e.at)} · ${text}` };
            }),
          ),
        );
      else
        body.append(
          note(
            "Pas encore de mouvement publié. Les prochaines escales figurent dans Agenda.",
          ),
        );
      if (port.seen !== port.serial) {
        port.seen = port.serial;
        g.save();
      }
    } else if (tab === "agenda") {
      const shift = shiftPhase(p.time);
      body.append(
        heading(`Horaires · ${portClock(gameMinute(p))}`),
        info(
          Object.entries(DOCKS).map(([from, dock]) => {
            const slot = departures(from, gameMinute(p));
            return {
              title: `${LINE_NAME} · ${dock.label}`,
              desc: `Départ ${portClock(slot.next)} · Quais piétons · Tarif ${euro(FARE)}`,
              action: btn("Guider", () => track(dock), { pict: "pin" }),
            };
          }),
        ),
        info([
          {
            title: "Banc des Grèves",
            desc: `${shift === "bench" ? "En service" : `Reprise ${portClock(nextBench(gameMinute(p)))}`} · 07:30–11:45 et 14:00–19:15`,
            action: btn("Localiser", () => track(PLACES.grevesDesk), {
              pict: "pin",
            }),
          },
        ]),
        info(
          agenda(p).map((e) => ({
            title: `${portClock(e.at)} · ${
              e.kind === "deadline"
                ? "Fin du bordereau"
                : e.kind === "eta"
                  ? "Accusé de réception de Jo"
                  : e.kind === "dispatch"
                    ? "Créneau Jo (si les stocks et la caisse le permettent)"
                    : e.kind === "restock"
                      ? "Réassort régulier des commerces"
                      : headline(e)[0]
            }`,
            desc:
              e.kind === "unload"
                ? "Les volumes effectifs dépendent de la place à la Balise."
                : null,
          })),
        ),
      );
    } else if (tab === "estate") {
      body.append(
        heading("Registre des concessions"),
        info([
          {
            title: "Comptoir 12 · Quai des Marées",
            desc: b.owned
              ? `Titre de Noa Vidal · ${b.rack ? "Réserve équipée" : "Bureau d’origine"} · ${count(b.trips, "tournée")} soldée(s).`
              : `${euro(PROPERTY_PRICE)} · Accès et achat devant le rideau, après une remise de fret validée.`,
            action: btn("Localiser le Comptoir", () => track(PLACES.comptoir), {
              pict: "pin",
            }),
          },
        ]),
      );
      if (b.owned)
        body.append(
          note(
            "Les décisions d’exploitation se prennent au terminal à l’intérieur. Le portefeuille n’est jamais débité automatiquement.",
          ),
        );
    } else if (tab === "vehicles") {
      body.append(
        heading("Garage local"),
        info(
          [...g.life.owned.values(), ...g.life.seized.values()].map((v) => ({
            title:
              v.spec.name +
              (v.trafficId ? " · non immatriculé à votre nom" : ""),
            desc: `État ${Math.round((1 - v.damage) * 100)} % · ${v.trafficId ? "Non admis au fret" : count(vehicleCapacity(v.id), "caisse") + " de capacité"}${p.port.job?.vehicle === v.id ? " · bordereau en cours" : ""}`,
            action: btn(
              "Localiser",
              () => track({ x: v.x, z: v.z, label: v.spec.name }),
              { pict: "pin" },
            ),
          })),
        ),
      );
    }
  }

  function property() {
    const g = game(),
      p = g.progress,
      b = p.port.venture;
    const body = openPanel(
      "property-panel",
      "Comptoir 12",
      "QUAI DES MARÉES  /  CONCESSION",
    );
    body.append(
      tag(
        "p",
        b.owned
          ? "Le titre est enregistré au nom de Noa Vidal. Le rideau est levé. Le terminal de gestion se trouve à gauche en entrant."
          : "« Le précédent locataire avait tout misé sur les grands cargos. Moi, je préfère une petite tournée qui arrive à l’heure. » — Jo",
      ),
    );
    body.append(
      cards([
        [b.owned ? "Acquis" : euro(PROPERTY_PRICE), "Concession"],
        [p.port.completed, "Remises de Noa"],
      ]),
    );
    if (!b.owned)
      body.append(
        note(
          !p.port.completed
            ? "Remettez un premier chargement pour être recommandée par un client du port."
            : "Le titre inclut l’accès au local et au compte professionnel. L’exploitation est facultative.",
        ),
      );
    body.append(
      flow(
        ...(b.owned
          ? []
          : [
              btn(
                `Acquérir · ${euro(PROPERTY_PRICE)}`,
                () => {
                  if (g.managePort("buy")) property();
                },
                {
                  primary: true,
                  disabled:
                    !p.port.completed ||
                    p.cash < PROPERTY_PRICE ||
                    !!g.life.alert.level,
                },
              ),
            ]),
        btn("Reprendre", closePanel, { primary: b.owned }),
      ),
    );
  }

  function operations() {
    const g = game(),
      p = g.progress,
      port = p.port,
      b = port.venture;
    const body = openPanel(
      "operations-panel",
      "Caisse du Comptoir 12",
      "CHÊNE & ZINC  /  BUREAU DE POINTAGE",
    );
    const command = (label, op, opts = {}) =>
      btn(
        label,
        () => {
          if (g.managePort(op)) operations();
        },
        { ...opts, disabled: !!g.life.alert.level || !!opts.disabled },
      );
    body.append(
      cards([
        [euro(b.reserve), "Caisse"],
        [euro(b.earned), "Encaissements"],
        [euro(b.costs), "Frais engagés"],
      ]),
      tag(
        "p",
        b.order
          ? `La navette de Jo transporte ${count(b.order.qty, "caisse")} pour ${people[b.order.id].name}. Accusé attendu ${portClock(b.order.eta)}.`
          : b.enabled
            ? "Autorisation active. Jo part au prochain créneau si les clients ont de la place, si le port a du stock et si la caisse couvre la tournée."
            : "Jo attend votre autorisation. Une tournée coûte 16 € de transport, plus les caisses ; le client règle à réception.",
      ),
      flow(
        command(
          b.enabled
            ? "Suspendre les prochains départs"
            : "Autoriser les tournées de Jo",
          "toggle",
          { primary: true },
        ),
        command(`Déposer ${euro(FLOAT)}`, "fund", { disabled: p.cash < FLOAT }),
        command("Retirer la caisse disponible", "draw", {
          disabled: !b.reserve,
        }),
      ),
      heading("Contrat de distribution"),
      tag(
        "p",
        b.policy === "market"
          ? "Priorité aux Halles : Jo réserve ses tournées à Lina, avec 3 € de remise par caisse. Les expéditions livrées renforcent sa confiance."
          : port.clients.market.trust > 0
            ? "« S’il vous reste du choix, j’ai besoin d’un prix qui tienne pour mon étal. » — Lina Mercier"
            : "Accord ouvert : Jo choisit entre les deux clients. Après une livraison aux Halles, Lina pourra solliciter votre soutien.",
      ),
      flow(
        command(
          b.policy === "market"
            ? "Revenir à l’accord ouvert"
            : "Donner la priorité aux Halles",
          b.policy === "market" ? "open" : "market",
          { disabled: b.policy === "open" && port.clients.market.trust < 1 },
        ),
      ),
      heading("Aménagement"),
      note(
        b.rack
          ? "La réserve est montée. Jo peut expédier quatre caisses à la fois quand la demande le permet."
          : "Les rayons de réserve doublent la capacité des tournées groupées, de deux à quatre caisses.",
      ),
      flow(
        ...(b.rack
          ? []
          : [
              command(`Monter les rayons · ${euro(RACK_PRICE)}`, "rack", {
                disabled: p.cash < RACK_PRICE,
              }),
            ]),
        btn("Reprendre", closePanel),
      ),
    );
  }

  function apps(body) {
    const p = game().progress,
      grid = tag("div", "", "phone-apps");
    for (const [id, label, pict, desc] of PORT_APPS) {
      const button = btn(
        label,
        id === "atlas"
          ? mapScreen
          : id === "settings"
            ? settings
            : () => phone(id),
        { pict, className: "phone-app" },
      );
      button.setAttribute("aria-label", label);
      button.append(
        tag(
          "small",
          id === "news" && p.port.serial > p.port.seen
            ? "Nouvelles dépêches"
            : desc,
        ),
      );
      grid.append(button);
    }
    body.append(grid);
  }
  function returnLoad() {
    const body = openPanel(
      "return-panel",
      "Restituer les caisses ?",
      "BALISE NORD  /  MOUVEMENTS",
    );
    body.append(
      note(
        "Les caisses réintégreront le stock du port. Le bordereau sera clôturé sans paiement ni pénalité de confiance.",
      ),
      flow(
        btn(
          "Restituer le chargement",
          () => {
            if (game().freightAction("return")) closePanel();
          },
          { primary: true },
        ),
        btn("Garder le chargement", closePanel),
      ),
    );
  }
  return { render, property, operations, apps, returnLoad };
}
