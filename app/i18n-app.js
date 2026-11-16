/* ============ KREO — i18n additions : espace créateur (après connexion) ============ */
(function () {
  'use strict';
  if (!window.KREO_I18N) return;

  Object.assign(window.KREO_I18N.fr, {
    'app.title': 'Espace créateur — KREO',
    'app.tag': 'Espace créateur',
    'app.home': 'Accueil',
    'app.mygames': 'Mes jeux',
    'app.discover': 'Découvrir',
    'app.communityNav': 'Communauté',
    'app.hi': 'Salut, Léo 👋',
    'app.sub': 'Que veux-tu créer aujourd\'hui ?',
    'app.new': 'Nouveau projet',
    'app.import': 'Importer',
    'app.s1': 'Mes jeux',
    'app.s2': 'Parties jouées',
    'app.s3': 'Joueurs ce mois',
    'app.s4': 'J\'aime',
    'app.projects': 'Mes projets',
    'app.seeAll': 'Tout voir',
    'app.published': 'Publié',
    'app.draft': 'Brouillon',
    'app.plays': 'parties',
    'app.newCard': 'Nouveau projet',
    'app.newCardSub': 'Commence de zéro',
    'app.activity': 'Activité récente',
    'app.a1': 'Sky Runner a atteint 100 joueurs',
    'app.a2': 'Maya a commenté Neon Drift',
    'app.a3': 'Défi hebdo : jeux de plateforme',
    'app.a4': 'Nova Strike a été joué 12 fois aujourd\'hui',
    'app.t1': 'il y a 2 h',
    'app.t2': 'il y a 5 h',
    'app.t3': 'hier',
    'app.t4': 'il y a 2 jours',
    'app.communityTitle': 'La communauté',
    'app.communitySub': 'Défis créatifs, entraide et avant-premières — sur Discord.',
    'app.discord': 'Rejoindre le Discord',
    'app.free': 'Compte gratuit',
    'app.previewNote': 'Aperçu visuel — le système de connexion arrive bientôt.'
  });

  Object.assign(window.KREO_I18N.en, {
    'app.title': 'Creator space — KREO',
    'app.tag': 'Creator space',
    'app.home': 'Home',
    'app.mygames': 'My games',
    'app.discover': 'Discover',
    'app.communityNav': 'Community',
    'app.hi': 'Hi, Léo 👋',
    'app.sub': 'What do you want to create today?',
    'app.new': 'New project',
    'app.import': 'Import',
    'app.s1': 'My games',
    'app.s2': 'Games played',
    'app.s3': 'Players this month',
    'app.s4': 'Likes',
    'app.projects': 'My projects',
    'app.seeAll': 'See all',
    'app.published': 'Published',
    'app.draft': 'Draft',
    'app.plays': 'plays',
    'app.newCard': 'New project',
    'app.newCardSub': 'Start from scratch',
    'app.activity': 'Recent activity',
    'app.a1': 'Sky Runner reached 100 players',
    'app.a2': 'Maya commented on Neon Drift',
    'app.a3': 'Weekly challenge: platformers',
    'app.a4': 'Nova Strike was played 12 times today',
    'app.t1': '2h ago',
    'app.t2': '5h ago',
    'app.t3': 'yesterday',
    'app.t4': '2 days ago',
    'app.communityTitle': 'The community',
    'app.communitySub': 'Creative challenges, help and early previews — on Discord.',
    'app.discord': 'Join the Discord',
    'app.free': 'Free account',
    'app.previewNote': 'Visual preview — the login system is coming soon.'
  });

  // re-apply with the new keys + page-specific title
  function fixTitle() { document.title = window.kreoT('app.title'); }
  document.addEventListener('kreo:langchange', fixTitle);
  if (window.kreoApplyLang) {
    window.kreoApplyLang(window.kreoCurrentLang());
    fixTitle();
  }
})();
