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
