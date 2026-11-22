# KREO · Jeux et éditeur 3D

La [landing page](index.html#showcase) donne accès à **trois démos jouables** : [Méridien](game/meridien/), [KREO Racing](game/course/) et [KREO Arena](game/fps/). Les visuels de cette galerie sont des captures des jeux.

```sh
python3 tools/serve.py 8000
```

Ouvrir [http://localhost:8000/](http://localhost:8000/), puis **Jouer aux démos** ou **Commencer à créer**. Aucune installation npm n’est nécessaire pour utiliser le site.

## Portail machine · production 3D

Le [portail Méridien](portal/) est la fenêtre sur la machine qui fabrique la 3D du jeu :

```sh
python3 tools/portal-server.py 8080
```

Ouvrir [http://localhost:8080/](http://localhost:8080/) (redirige vers `/portal/`). Le portail expose l’état du dépôt et de la machine, l’arborescence des fichiers, le journal d’activité, la galerie des visuels et modèles produits (avec inspecteur 3D), et une **boîte à commandes** (`photo`, `modèle`, `décors`, `véhicule`, `personnage`) enregistrée dans `portal/boite/`. Les visuels générés sont signalés comme tels, conformément à la charte du jeu. La connexion du service de génération **Triple 3D** (photos de référence et maillages) se branche depuis le portail ; les commandes déposées sont traitées par la machine de production.

## Atelier Arena · créer de la 3D et des animations

1. Dans l’[éditeur 3D](editor/), ouvrir **Connexion à Arena** dans le panneau Scène. Écrire un brief. Par défaut, il n’inclut **aucune donnée de scène** ; l’ajout de repères est facultatif.
2. Copier le prompt, avec son lien de protocole, dans le **mode Agent d’Arena.ai**. L’agent utilise uniquement le dépôt déjà autorisé ou les fichiers que l’auteur transmet. Le lien ne donne aucun accès au projet ni au terminal.
3. Dans l’Atelier, ouvrir le `.kreo-asset.json` produit ou coller sa réponse. Vérifier la géométrie et les mouvements dans l’aperçu, puis **Ajouter au niveau**. L’ajout, les maillages et les pivots restent éditables et les animations sont jouées dans le test et les exports HTML/ZIP.

Pour essayer sans compte ni dépôt, choisir [**Charger l’exemple**](editor/?atelier=exemple). Le [contrat de format](editor/atelier/PROTOCOL.md) décrit les primitives, maillages et clés, ainsi que la validation locale : `node tools/kreo-atelier.mjs validate <fichier>`. L’Atelier Arena est indépendant du jeu **KREO Arena**.

## Méridien 0.12 · Les deux rives

Dans [Méridien](game/meridien/), ouvrez **Carte → Atelier des Grèves** : le pont se traverse à pied ou en voiture. Essayez un bordereau **Balise Nord → Atelier des Grèves**, puis entrez au banc de Mina pour contrôler un lot de joints. Dans **Agenda**, consultez les permanences et les départs de la navette. Après *Fréquences de veille*, demandez à Salomé d’ouvrir **Le Cahier de la passe**. Les deux fins du dossier précédent sont conservées. Tous ces parcours sont jouables en **Plan** sans WebGL.

Le [parcours détaillé et les vérifications](game/meridien/LITTORAL.md) expliquent la livraison, les horaires et les reprises. Le [lot des Grèves](editor/?atelier=greves) est éditable dans l’Atelier. Les carnets v1 restent intacts : le jeu les reprend puis enregistre dans un emplacement v2 séparé.

## Méridien 0.9 · La Relève du Port

Dans [Méridien](game/meridien/), ouvrez **La Traverse** (**Tab**) → **Applications → Fret**, ou les bordereaux dans le message de Jo. Réservez une remise aux Halles des Verrières ou au Garage Estuaire (ou aux Grèves depuis la 0.10). Une Mistral peut emporter deux caisses ; l’Estuaire V2, cinq. Suivez le fret sur la carte et arrêtez-vous **dans la baie marquée** : **E** charge à la Balise Nord, puis remet les caisses à destination. Le bordereau est lié au véhicule déclaré. Téléphone et pause arrêtent le chrono ; il reprend en jeu, même lorsque vous ne suivez plus le fret.

Après une première remise, **Immobilier → Localiser le Comptoir** vous mène au **Comptoir 12**. Consultez la concession devant le rideau (315 €), puis entrez à pied. Au terminal, déposez une avance de caisse, choisissez l’accord de distribution et autorisez les tournées. Elles partent aux créneaux indiqués dans **Agenda**, si les stocks, le client et la caisse le permettent. La caisse professionnelle est distincte du portefeuille de Noa. **Banque** retrace les opérations ; **Actualités** reprend les mouvements réellement enregistrés par votre partie.

Les **Carnets** sur l’écran titre proposent trois emplacements locaux. Les anciens carnets v1 restent lisibles ; aucun remplacement d’un carnet illisible sans confirmation. L’[asset du Comptoir](editor/?atelier=comptoir) est inspectable et éditable dans l’Atelier Kreo. La concession et le fret fonctionnent aussi en **Plan**, sans charger le lot 3D.

Voir le [plan de transformation](game/meridien/OVERHAUL.md) : cette étape étoffe les Docks existants, pas encore l’île entière.

## Méridien 0.8 · Fréquences de veille

**À voir dès le départ :** ouvrez la carte (**M**) et suivez **Atelier des Ondes**. Explorez les Tisserands, traversez le passage Cormoran et entrez dans le véritable atelier de Salomé. Le **poste de veille** est une autre escale, côté estuaire. Les deux lieux sont aussi visitables en vue Plan.

**Après Sous la surface :** reprenez votre sauvegarde (aucune remise à zéro), ouvrez **La Traverse** (**Tab**) et choisissez **Suivre le dossier** dans le message de Salomé. *Fréquences de veille* fait recouper deux sources, régler un récepteur et décider du sort de la bande. Le **Journal** garde les relevés. Votre décision modifie l’avis au poste de veille ; elle ne remplace ni la fin du premier chapitre ni vos activités en cours.

Au **parvis du Sillage**, le **Sémaphore des Marées** est monté à partir du même [lot JSON](editor/atelier/exemples/semaphore.kreo-asset.json) que l’exemple de l’Atelier. La tête et l’aiguille s’animent indépendamment ; sur place, **E** ouvre la plaque du marégraphe. Le repère et le socle existent aussi en vue Plan, sans télécharger l’asset 3D.

Méridien est un jeu d’enquête en monde ouvert, dans le quartier portuaire de Port-Lumière. Ouvrir [Méridien](game/meridien/) puis **Entrer dans la ville**. La 3D (WebGL 2) se joue à l’épaule ou à la première personne, avec une vue de dessus légère en repli.

- **Souris en 3D** : cliquez une fois dans la vue puis bougez la souris pour l’orienter. À pied, maintenez ensuite le clic gauche pour avancer ; relâchez pour vous arrêter. **Échap** libère la souris, **V** recentre la vue.
- **B** ou le bouton **œil** : passer de l’épaule / poursuite à la première personne, à pied comme au volant. Le choix est conservé dans les paramètres.
- **ZQSD / WASD / flèches** : déplacement ou conduite. Le glissé avec le bouton droit et au doigt reste disponible.
- **Maj / X** : courir / marcher lentement · **C** : s’accroupir · **Espace** : sauter ou freiner à main.
- **E** : interagir, monter ou descendre à faible vitesse · **M** : carte · **Tab** : téléphone · **Échap** : pause.
- **F** : voler un passant ou prendre une voiture à l’arrêt. Sur mobile, toucher l’action lorsqu’elle apparaît. La sûreté peut se lancer à votre poursuite.
- **Sauvegarde** : automatique sur ce navigateur, ou manuelle depuis la pause. Suivez les chevrons jusqu’à l’entrée du café Le Sillage.

Sur une machine peu puissante, choisir **Paramètres → Qualité graphique → Éco · 3D légère**. Si la 3D reste saccadée, **Plan · vue de dessus** conserve les trajets, la conduite, les missions et la sauvegarde sans rendu WebGL. Le réglage est disponible depuis l’écran titre ou pendant la partie (`Échap`).

En 3D, le réticule reste au centre de l’écran pendant le jeu, sans modifier les interactions ; il disparaît dans les menus, les cinématiques et la vue Plan. En troisième personne, la caméra se replace derrière l’épaule droite de Noa. Le réglage **Suivi à pied (3e personne)** permet de conserver la rotation manuelle hors du mode souris directe. Pour rétablir le glissé classique avec le bouton gauche, choisissez **Paramètres → Souris (vue 3D) → Rotation en glissant**. Les voitures volées restent dans la partie et sont indiquées sur la carte, sans rejoindre le garage.

La circulation s’arrête avant la ligne aux feux rouges et laisse passer les piétons qui traversent, y compris devant Le Sillage. Les conducteurs restent visibles de l’extérieur. Au volant en vue habitacle, le volant, les mains de Noa et le compteur réagissent à la conduite. En voiture, **S / ↓** freine avant de reculer ; **Espace** actionne le frein à main. Pour les livraisons de Jo, les deux arrêts marqués **LIVRAISON** permettent la remise à la portière à faible vitesse. Le meilleur chrono est conservé dans le journal du téléphone.

**Arrestation.** Si Noa reste immobile près d’une patrouille qui l’a repérée, le niveau 1 mène à un contrôle avec amende. Aux niveaux 2 et 3, elle est transférée au **commissariat des Docks**, visible sur la carte. Marchez jusqu’au guichet et utilisez **E** (ou touchez **Terminer le contrôle**) pour ouvrir la grille et sortir. La livraison est mise en pause pendant la retenue. Recharger la partie ne fait perdre ni la progression de l’enquête ni le véhicule laissé sur place ; une retenue en cours reprend au commissariat.

**Carte et bruitages.** La carte (M) affiche les escales, la distance, les zones surveillées et la fin du tracé si l’objectif doit être rejoint à pied. Touchez un lieu, un véhicule garé ou un point libre pour le suivre. Les pas changent entre asphalte, pavés, jardins et intérieurs ; la pluie s’entend aussi sous les pneus. Les portières, chocs et sirènes sont synthétisés dans le navigateur.

**Cinématiques.** Parlez à Inès au Sillage, puis à Aya au belvédère pour les deux séquences du chapitre. Les huit répliques synthétiques en français ont été produites hors ligne avec [VoiceStudio](https://github.com/debpalash/VoiceStudio). En 0.4, les trois prises d’Inès ont été refaites avec Kokoro ; Noa et Aya gardent leurs prises Supertonic-3. Les pistes locales (environ 300 Kio au total) ne sont chargées que pendant la lecture. Chaque scène a des sous-titres, des commandes pour réécouter, couper les voix ou passer, et reste jouable en vue Plan. Les nouvelles scènes de Salomé sont mises en scène et sous-titrées, sans nouvelles prises doublées. Les scènes terminées sont accessibles dans **Téléphone → Journal → Archives des séquences**. Voir le [dossier du doublage](game/meridien/voice/README.md) pour les crédits et la procédure d’export.

Pour le périmètre, les décisions et les mesures de rendu : [dossier de développement](game/meridien/DESIGN.md).

```sh
node --test tools/kreo-atelier.test.mjs tools/meridien*.test.mjs
node tools/check.mjs                    # vérifications de KREO Arena
node tools/kreo-atelier.mjs validate editor/atelier/exemples/semaphore.kreo-asset.json
node tools/kreo-atelier.mjs validate editor/atelier/exemples/comptoir-12.kreo-asset.json
```

Avec Playwright et Chromium installés, `node tools/kreo-atelier.browser.mjs` vérifie l’éditeur, les exports hors ligne et le lancement des trois démos depuis la landing ; `node tools/meridien.browser.mjs` vérifie le chapitre et les interactions ; `node tools/meridien.ondes.browser.mjs` couvre le dossier, les collisions des Tisserands et les deux choix en 3D et en Plan ; `node tools/meridien.port.browser.mjs` suit le fret et la concession à travers les reprises, le passage en 3D et les carnets tactiles. Servir le dépôt d’abord. `KREO_URL` et `MERIDIEN_URL` permettent de choisir les URLs de test ; `WEBGL_SOFTWARE=1` active SwiftShader si nécessaire.
