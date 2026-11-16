/* ============================================================
   KREO — i18n de l'éditeur (clés complémentaires)
   Ajoute les nouvelles clés ed.* au dictionnaire partagé.
   Doit être chargé APRÈS ../assets/i18n.js.
   ============================================================ */
(function () {
  'use strict';

  const FR = {
    'ed.undo': "Annuler",
    'ed.redo': "Rétablir",
    'ed.grid': "Grille",
    'ed.snap': "Aimantation",
    'ed.duplicate': "Dupliquer",
    'ed.forward': "Monter",
    'ed.backward': "Descendre",
    'ed.eyeShow': "Afficher",
    'ed.eyeHide': "Masquer",
    'ed.scene': "Scène",
    'ed.sceneName': "Nom de la scène",
    'ed.bgColor': "Couleur de fond",
    'ed.gravity': "Gravité",
    'ed.opacity': "Opacité",
    'ed.name': "Nom",
    'ed.saved': "Enregistré",
    'ed.modified': "Modifié",
    'ed.help': "Aide",
    'ed.shortcuts': "Raccourcis clavier",
    'ed.sc1': "Déplacer la sélection (flèches, + Maj = 8 px)",
    'ed.sc2': "Supprimer l'objet sélectionné",
    'ed.sc3': "Dupliquer la sélection",
    'ed.sc4': "Lancer / arrêter le jeu",
    'ed.sc5': "Annuler / rétablir",
    'ed.sc6': "Souris : sélectionner, déplacer, redimensionner",
    'ed.sc7': "Molette + Ctrl : zoom",
    'ed.winTitle': "Gagné ! 🏆",
    'ed.loseTitle': "Perdu… 💥",
    'ed.replay': "Rejouer",
    'ed.backToEdit': "Retour à l'éditeur",
    'ed.mute': "Son activé",
    'ed.muted': "Son coupé",
    'ed.objectsLabel': "objets",
    'ed.close': "Fermer",
    'ed.sceneSettings': "Réglages de la scène — cliquez sur un objet pour l'inspecter.",
    'ed.renameHint': "Double-cliquez pour renommer",
    'ed.saveOk': "Projet enregistré !",
    'ed.newObj': "Objet ajouté",
    'ed.deletedToast': "Objet supprimé",
    'ed.copiedToast': "Objet dupliqué",
    'ed.applied': "Code appliqué !",
    'ed.snapOn': "Aimantation activée",
    'ed.snapOff': "Aimantation désactivée",
    'ed.demoLoaded': "Scène de démo chargée ⭐",
    'ed.scoreLabel': "Score",
    'ed.tryAgain': "Réessaie — tu peux le faire.",
    'ed.new': "Nouveau",
    'ed.demo': "Démo",
    'ed.objects': "Objets",
    'ed.delete': "Supprimer",
    'ed.jump': "Saut",
    'ed.coinValue': "Valeur",
    'ed.flagMsg': "Message de victoire",
    'ed.content': "Contenu",
    'ed.fontSize': "Taille du texte",
    'ed.textColor': "Couleur du texte",
    'ed.apply': "Appliquer le code",
    'ed.resetCode': "Réinitialiser",
    'ed.player': "Joueur",
    'ed.platform': "Plateforme",
    'ed.ground': "Sol",
    'ed.enemy': "Ennemi",
    'ed.coin': "Pièce",
    'ed.flag': "Drapeau",
    'ed.text': "Texte"
  };

  const EN = {
    'ed.undo': "Undo",
    'ed.redo': "Redo",
    'ed.grid': "Grid",
    'ed.snap': "Snap",
    'ed.duplicate': "Duplicate",
    'ed.forward': "Bring forward",
    'ed.backward': "Send backward",
    'ed.eyeShow': "Show",
    'ed.eyeHide': "Hide",
    'ed.scene': "Scene",
    'ed.sceneName': "Scene name",
    'ed.bgColor': "Background color",
    'ed.gravity': "Gravity",
    'ed.opacity': "Opacity",
    'ed.name': "Name",
    'ed.saved': "Saved",
    'ed.modified': "Modified",
    'ed.help': "Help",
    'ed.shortcuts': "Keyboard shortcuts",
    'ed.sc1': "Move selection (arrows, + Shift = 8 px)",
    'ed.sc2': "Delete the selected object",
    'ed.sc3': "Duplicate the selection",
    'ed.sc4': "Start / stop the game",
    'ed.sc5': "Undo / redo",
    'ed.sc6': "Mouse: select, move, resize",
    'ed.sc7': "Ctrl + wheel: zoom",
    'ed.winTitle': "You win! 🏆",
    'ed.loseTitle': "Game over… 💥",
    'ed.replay': "Play again",
    'ed.backToEdit': "Back to editor",
    'ed.mute': "Sound on",
    'ed.muted': "Sound off",
    'ed.objectsLabel': "objects",
    'ed.close': "Close",
    'ed.sceneSettings': "Scene settings — click an object to inspect it.",
    'ed.renameHint': "Double-click to rename",
    'ed.saveOk': "Project saved!",
    'ed.newObj': "Object added",
    'ed.deletedToast': "Object deleted",
    'ed.copiedToast': "Object duplicated",
    'ed.applied': "Code applied!",
    'ed.snapOn': "Snap enabled",
    'ed.snapOff': "Snap disabled",
    'ed.demoLoaded': "Demo scene loaded ⭐",
    'ed.scoreLabel': "Score",
    'ed.tryAgain': "Try again — you can do it.",
    'ed.new': "New",
    'ed.demo': "Demo",
    'ed.objects': "Objects",
    'ed.delete': "Delete",
    'ed.jump': "Jump",
    'ed.coinValue': "Value",
    'ed.flagMsg': "Win message",
    'ed.content': "Content",
    'ed.fontSize': "Font size",
    'ed.textColor': "Text color",
    'ed.apply': "Apply the code",
    'ed.resetCode': "Reset",
    'ed.player': "Player",
    'ed.platform': "Platform",
    'ed.ground': "Ground",
    'ed.enemy': "Enemy",
    'ed.coin': "Coin",
    'ed.flag': "Flag",
    'ed.text': "Text"
  };

  if (window.KREO_I18N) {
    Object.assign(window.KREO_I18N.fr, FR);
    Object.assign(window.KREO_I18N.en, EN);
  }

  function apply() {
    if (window.kreoApplyLang) window.kreoApplyLang(window.kreoCurrentLang());
    window.dispatchEvent(new Event('kreo:editor-render'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }

  window.addEventListener('kreo:langchange', function () {
    apply();
    window.dispatchEvent(new Event('kreo:editor-render'));
  });
})();
