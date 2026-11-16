# Notes — Éditeur KREO (informations produit)

> Notes de travail conservées pour la construction de l'éditeur. **Ne PAS intégrer à la landing page.**

## Vision produit
- **Ambition : faire un éditeur meilleur qu'Unreal Engine.** Puissance, professionnalisme, mais accessible à tous.
- **Le code sera nécessaire** : pas de promesse « 100 % no-code ». Positionnement honnête :
  - **Blocs visuels** pour débuter et aller vite
  - **Vrai code (JavaScript)** pour la puissance et les possibilités infinies
  - Le message marketing doit refléter ça (« commence sans code, va plus loin avec du vrai code »)
- **Système de connexion / comptes : PLUS TARD** — pas maintenant.
- **Public : tout le monde** (débutants → créateurs expérimentés).
- **100 % web** (navigateur, aucune installation).
- **Entièrement gratuit** (validé le 15/11/2026).

## État du projet
- [x] Landing page terminée (style Apple, GSAP, mode sombre, FR/EN)
- [x] Logo KREO (`assets/kreo-logo.png`)
- [ ] **Éditeur — en cours** : v0 livrée dans `editor/`
- [ ] Connexion / comptes (plus tard)
- [ ] Hébergement des jeux publiés (à définir)

## Éditeur v0 (livrée) — fonctionnalités
- Éditeur de scène : ajout d'objets (rectangle, cercle, plateforme, joueur, pièce, ennemi, drapeau)
- Sélection, déplacement (grille 4 px), redimensionnement, suppression
- Inspecteur : nom, position, taille, rotation, couleur, comportement, vitesse, solidité
- Arbre de scène
- **Mode Jeu** : gravité, saut, collisions solides, pièces à collecter, ennemis en patrouille, drapeau = victoire
- **Code JavaScript** par projet : `onStart(scene)`, `onUpdate(scene, dt)`, `onCollide(a, b)`
- Sauvegarde locale (localStorage) + export / import `.json`
- Interface FR / EN

## Pistes pour la suite de l'éditeur
- Éditeur de niveaux au pinceau (tuiles), caméra multi-écrans
- Éditeur de blocs visuels (glisser-déposer) + pont vers le code
- Bibliothèque d'assets (sprites, sons) intégrée
- Sons / musique, animations de sprites, particules
- Multiplayer temps réel
- Publication par lien (backend à prévoir)
- Comptes / connexion (étape future validée)

## Direction technique — Éditeur 3D (nov. 2026)

L'éditeur est maintenant un **environnement 3D complet**, dans l'esprit des
vrais moteurs (Godot, Unreal, Unity) :
- Viewport 3D (three.js) avec caméra orbitale, ciel, ombres, brouillard
- **Gizmos** de transformation : Déplacer (W) / Pivoter (E) / Échelle (R),
  aimantation (grille 0.5 / 15° / 0.1)
- Arbre de scène + inspecteur complet (transform XYZ, matériau PBR, lumières,
  comportement, code) + **console de sortie**
- Types d'objets : cube, sphère, cylindre, cône, sol, tore, lumière du jour,
  lumière ponctuelle, **joueur**, **pièce**, **objectif**
- **Mode jeu 3e personne** : WASD/ZQSD, saut, gravité, collisions AABB,
  pièces, objectif, HUD, sons, écrans victoire/défaite
- Code JS par objet : onStart / onUpdate / onCollide + API scene/player
- Sauvegarde JSON (.kreo3d.json), undo/redo, autosave

Ambition inchangée : **mieux qu'Unreal Engine**. Blocs pour démarrer,
vrai JavaScript pour aller plus loin. Comptes/connexion : plus tard.
