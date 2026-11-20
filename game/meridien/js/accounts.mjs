// Portefeuille unique : les systèmes historiques et le fret utilisent le même relevé.
export const CASH_LIMIT = 999999;
export const LEDGER_LIMIT = 36;
export const ACCOUNT_LABELS = Object.freeze({
  chapter: "Clôture · Sous la surface",
  echo: "Clôture · Fréquences de veille",
  courier: "Course de Jo",
  car: "Achat · Garage Estuaire",
  outfit: "Vêtements · Les Halles",
  coffee: "Le Sillage",
  repair: "Réparation · Le Ressac",
  fine: "Amende de la sûreté",
  street: "Espèces récupérées dans la rue",
  freight: "Règlement de fret",
  inspection: "Contrôle des joints · Atelier des Grèves",
  ferry: "Billet · Navette des Sondes",
  passage: "Clôture · Le Cahier de la passe",
  property: "Acquisition · Comptoir 12",
  fixture: "Aménagement · Comptoir 12",
  float: "Dépôt dans la caisse du Comptoir",
  draw: "Retrait de la caisse du Comptoir",
});
export const gameMinute = (p) => (p.port?.day ?? 0) * 1440 + Math.floor(p.time);

export function postCash(p, amount, kind) {
  if (!Object.hasOwn(ACCOUNT_LABELS, kind) || !Number.isSafeInteger(amount))
    return false;
  if (p.cash + amount < 0) return false;
  const balance = Math.min(CASH_LIMIT, p.cash + amount);
  const delta = balance - p.cash;
  p.cash = balance;
  if (delta) {
    const rows = (p.ledger ??= []);
    rows.unshift({ kind, delta, balance, at: gameMinute(p) });
    if (rows.length > LEDGER_LIMIT) rows.length = LEDGER_LIMIT;
  }
  return true;
}

export function restoreLedger(raw, at) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, LEDGER_LIMIT).flatMap((r) => {
    if (
      typeof r?.kind !== "string" ||
      !Object.hasOwn(ACCOUNT_LABELS, r.kind) ||
      !Number.isSafeInteger(r.at) ||
      r.at < 0 ||
      r.at > at ||
      !Number.isSafeInteger(r.balance) ||
      r.balance < 0 ||
      r.balance > CASH_LIMIT ||
      !Number.isSafeInteger(r.delta) ||
      !r.delta ||
      r.balance - r.delta < 0 ||
      r.balance - r.delta > CASH_LIMIT
    )
      return [];
    return [{ kind: r.kind, delta: r.delta, balance: r.balance, at: r.at }];
  });
}
