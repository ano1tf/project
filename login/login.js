/* ============================================================
   KREO — Page de connexion / inscription (login.js)
   Bascule connexion ↔ inscription, validation, appels à
   l'API /api/auth/*, gestion des erreurs (FR/EN).
   ============================================================ */
(function () {
  'use strict';

  const $ = (s) => document.getElementById(s);
  const t = (k) => (window.kreoT ? window.kreoT(k) : k);

  let mode = 'login'; // 'login' | 'register'

  const form = $('authForm');
  const errBox = $('authError');

  function showError(key) {
    errBox.textContent = t(key) || key;
    errBox.classList.add('show');
  }
  function clearError() {
    errBox.classList.remove('show');
    errBox.textContent = '';
  }

  function setMode(m) {
    mode = m;
    clearError();
    const isReg = m === 'register';
    $('fieldName').hidden = !isReg;
    $('fieldConfirm').hidden = !isReg;
    $('tabLogin').classList.toggle('active', !isReg);
    $('tabRegister').classList.toggle('active', isReg);
    $('authTitle').textContent = t(isReg ? 'auth.register' : 'auth.login');
    $('authSubmit').textContent = t(isReg ? 'auth.submitRegister' : 'auth.submitLogin');
    $('footText').textContent = t(isReg ? 'auth.haveAccount' : 'auth.noAccount');
    $('footLink').textContent = t(isReg ? 'auth.login' : 'auth.register');
    $('fPassword').setAttribute('autocomplete', isReg ? 'new-password' : 'current-password');
    $('fName').hidden = false; // géré par le parent, mais garde le focus correct
  }

  $('tabLogin').addEventListener('click', () => setMode('login'));
  $('tabRegister').addEventListener('click', () => setMode('register'));
  $('footLink').addEventListener('click', (e) => {
    e.preventDefault();
    setMode(mode === 'login' ? 'register' : 'login');
  });

  // Réapplique les textes traduits au changement de langue
  document.addEventListener('kreo:langchange', () => setMode(mode));

  function safeNext() {
    const p = new URLSearchParams(location.search).get('next') || '/';
    // uniquement des chemins internes (anti open-redirect)
    return (p.startsWith('/') && !p.startsWith('//')) ? p : '/';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    const name = $('fName').value.trim();
    const email = $('fEmail').value.trim();
    const password = $('fPassword').value;
    const confirm = $('fConfirm').value;

    if (mode === 'register') {
      if (name.length < 2) return showError('auth.errInvalid');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showError('auth.errEmail');
      if (password.length < 8) return showError('auth.errPassword');
      if (password !== confirm) return showError('auth.errMatch');
    } else {
      if (!email || !password) return showError('auth.errInvalid');
    }

    const btn = $('authSubmit');
    btn.disabled = true;
    try {
      const r = await fetch('/api/auth/' + (mode === 'register' ? 'register' : 'login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(mode === 'register' ? { name, email, password } : { email, password })
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.user) {
        location.href = safeNext();
        return;
      }
      const map = {
        exists: 'auth.errExists',
        credentials: 'auth.errCredentials',
        rate: 'auth.errRate',
        name: 'auth.errInvalid',
        email: 'auth.errEmail',
        password: 'auth.errPassword'
      };
      showError(map[data.error] || 'auth.errGeneric');
    } catch {
      showError('auth.errGeneric');
    } finally {
      btn.disabled = false;
    }
  });

  setMode('login');
})();
