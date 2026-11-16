/* ============================================================
   KREO — Client d'authentification partagé (assets/auth.js)
   Utilisé par l'espace créateur (app/) et l'éditeur (editor/).
   ============================================================ */
window.KREO_AUTH = (function () {
  'use strict';

  async function me() {
    try {
      const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (!r.ok) return null;
      const d = await r.json();
      return d.user || null;
    } catch {
      return null;
    }
  }

  /** Redirige vers /login/ si non connecté. Retourne l'utilisateur sinon. */
  async function require() {
    const u = await me();
    if (!u) {
      const next = encodeURIComponent(location.pathname + location.search);
      location.replace('/login/?next=' + next);
      return null;
    }
    return u;
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch { /* */ }
    location.href = '/';
  }

  return { me: me, require: require, logout: logout };
})();
