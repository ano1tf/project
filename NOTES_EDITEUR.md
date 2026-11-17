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

## Direction technique — Passage « AAA » (16 nov. 2026)

Objectif : sortir de la démo et viser un rendu et un game feel de niveau
production. Tout ce qui suit est **livré et testé** (harnais Node exécutant
les vrais modules, WebGL non testable en sandbox).

### Rendu
- **Pipeline HDR** : `game/*/js/post.js` (EffectComposer, cible HalfFloat,
  MSAA 4x) → GTAO (occlusion ambiante) → bloom physique (UnrealBloom)
  → grading maison (contraste, saturation, lift/gain, vignette, grain,
  aberration chromatique radiale, netteté, flash de dégâts/headshot)
  → OutputPass (ACES + sRGB).
- **IBL réel** : `assets/env/moonless_golf_1k.hdr` (nuit) et
  `venice_sunset_1k.hdr` (course, jour) chargés en PMREM.
- **Viewmodel séparé** : l'arme est rendue dans sa propre scène avec son
  propre éclairage et un `clearDepth` → plus de clipping dans les murs,
  flash de bouche dédié.
- **Qualité adaptative** : FPS mesurés en continu, l'AO puis la résolution
  puis le post sont désactivés si la machine décroche.
- `PCFSoftShadowMap` (supprimé de three r187) → `PCFShadowMap`.

### Personnages et animations
- `assets.js` : `CharacterAsset` (GLB riggé, normalisation de hauteur,
  clonage de squelette, matériaux dupliqués) + `Animator` (blend/crossfade).
- `assets/models/RobotExpressive.glb` : 14 clips (Idle, Walking, Running,
  Punch, Death…). Les ennemis sont des robots animés teintés par type,
  avec volants de collision invisibles (tête / corps) pour les headshots.
- Repli procédural automatique si le GLB ne charge pas.

### Game feel
- `juice.js` : **hitstop** (gel du temps 35–75 ms à l'impact), screenshake,
  kick de caméra + FOV, décroissance frame-rate indépendante.
- Sons : moteur de synthèse réécrit — détonation en 3 couches, queue de
  salle par convolution (IR générée), pas avec matière, ambiance
  drone + vent + grondement.

### Éditeur
- Bouton **Importer un modèle 3D** + glisser-déposer d'un `.glb` dans le
  viewport (GLTFLoader + DRACOLoader vendorisés).
- Nouveau type d'objet `model` : clone riggé, animation jouée dans
  l'éditeur, sérialisé dans le JSON (nom + index d'animation).

### Landing
- Carte « Importe tes modèles 3D / rendu studio », et les deux jeux
  jouables (KREO Arena, KREO Racing) ajoutés à la galerie avec liens.

### Ce qui reste pour un vrai AAA
Voir la réponse : assets sous licence, capture de mouvement, direction
artistique (DA) unifiée, level design itéré, backend/multijoueur,
QA et certification. La technique ne représente qu'une partie du chemin.

## Éditeur 3D (état actuel — 16/11/2026)

L'éditeur de `editor/` n'est plus la v0 2D : c'est un éditeur 3D temps réel
avec un runtime FPS, et il produit un jeu autonome.

### Ce qui est livré
- **Export jeu `.html`** : un fichier de ~2,3 Mo, double-cliquable, jouable
  hors ligne (`file://`). three.js + runtime + scène + modèles sont inlinés.
- **Runtime FPS complet** : vue subjective, viewmodel, sprint/accroupi/glissade,
  coyote time, franchissement de marche, hitscan avec recul et gerbe,
  munitions/rechargement, armes en données (pistolet, fusil, fusil à pompe),
  ennemis IA, projectiles, particules, pickups, dégâts/régénération.
- **Rendu** : IBL (PMREM) pour les métaux, textures procédurales (béton, métal,
  grille, damier, bois, bruit), post-traitement (ACES filmique, sRGB, étalonnage,
  vignette, grain, aberration chromatique pilotée par les dégâts).
- **Audio procédural** : bus, compresseur, réverbération par IR générée ;
  11 effets de jeu ; sons assignables par objet avec atténuation de distance.
- **Niveaux multiples**, **prefabs embarqués dans le projet** (transportés avec le `.kreo3d.json`), **groupes et sélection multiple**,
  **parenté persistée**, **débogueur** (colliders, rayons, états, valeurs, objectifs, vagues et erreurs de scripts).
- **Console de commandes** avec `help`, `select`, `tp`, `spawn`, `delete`, `play`/`stop`, `debug`, `stats`, `clean`, `save` et `export` ; historique ↑/↓.
- **Menu Ajouter (Maj+A)** inspiré de Shift+A dans Blender : primitives de maillage éditables (cube, plan, sphère UV, icosphère, cylindre, cône, tore), objets de jeu, terrain, lumières et import GLB ; recherche intégrée, focus automatique et édition directe (extrusion, inset, subdivision, boucle, soudure, miroir, lissage).
- **Ciel / soleil / ambiance / exposition** réglables, repris à l'identique
  dans l'export.
- **Scripting** : `api` fusionne l'API globale et l'objet courant ; `print()`
  remonte dans la console ; erreurs attribuées à l'objet et au hook ;
  14 extraits de code insérés en un clic.

### Ce qui reste volontairement hors périmètre
- **Assets 3D AAA** (modèles, armes, mocap) : intégrés plus tard par
  l'utilisateur. Les systèmes qui les consommeront sont en place :
  import GLB/GLTF, modèles embarqués en data URL, machines à états
  d'animation par clip, viewmodel découplé.
- **Comptes, backend, publication par lien, multijoueur** : nécessitent une
  infrastructure, non commencés.
- **Éditeur de blocs visuels** : pas encore commencé.
