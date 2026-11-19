# Méridien — dossier de développement

## Cap créatif

**Port-Lumière** est une ville fictive d’estuaire. Une ligne de chemin de fer et les anciennes darses ont distribué les métiers autour du port ; les verrières et les immeubles récents occupent les îlots plus à l’est. Dans ce premier secteur, les usages se lisent dans les enseignes, les façades, la largeur des voies, les grues et les quais.

**Noa Vidal** est une ancienne technicienne des radios portuaires devenue conductrice indépendante. Le signal de 02 h 17, enregistré alors que le remorqueur de son frère était déjà déclaré perdu, la ramène à la Darse Nord. **Inès Kader** admet avoir conservé la trace ; **Aya Le Guen** peut la publier, mais ne peut pas promettre de préserver la source si le registre paraît brut. Le conflit porte sur ce que Noa accepte de perdre en rendant les faits publics.

**Boucle de jeu** : recevoir une information → choisir un itinéraire à pied ou en voiture → franchir une zone surveillée → décider quoi faire de la preuve. En dehors de ce chapitre, la livraison réutilise le réseau routier, finance les véhicules, et permet de découvrir des lieux différents.

**Direction artistique** : ardoise, verts d’estuaire et points chauds de sodium ; héros lisible en veste rouille ; berlines et utilitaires aux silhouettes sobres ; signalétique française. L’écran titre est une illustration générée, explicitement indiquée comme telle. Le rendu du jeu est une 3D stylisée créée dans le moteur, pas un décor vidéo ni une promesse de photoréalisme AAA.

## 0.7 : le Sémaphore des Marées

Sur le parvis du Sillage, un marégraphe en fonte et laiton sert de repère de promenade. Le joueur peut suivre le lieu sur la carte et lire sa plaque avec **E**. L’assemblage vient du [lot d’exemple de l’Atelier Arena](../../editor/atelier/exemples/semaphore.kreo-asset.json) : un pivot tourne en 12 s, un autre oscille en 9 s.

Le modèle est chargé à la première activation du rendu 3D. Il suit le choix de qualité graphique, ne s’anime pas au loin et garde une pose fixe si le mouvement est réduit. Le socle fixe, le repère et l’interaction restent utilisables en Plan. Aucun changement de scénario ou de format de sauvegarde.

## Livraison 0.6 : Sous la surface

| Domaine      | Jouable dans cette version                                                                                                                                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monde        | Un secteur continu d’environ **369 × 331 m** : quais, Darse Nord, Sillage, Verrières et Ateliers. Promenade des quais et parvis du Sillage habillés. Café, hangar, garage et commissariat visitables sans chargement. Les navires et la silhouette urbaine au loin sont des décors, non des zones accessibles.      |
| Personnage   | Noa à l’épaule ou en vue subjective (**B** ou bouton œil), également en voiture. Allure lente, course, endurance, saut, accroupissement, trois vestes, commande directe à la souris et glissé. Réticule fixe en jeu 3D.                                                                                             |
| Conduite     | Mistral 84 possédée dès le départ, Boréal GT et Estuaire V2 à acquérir. Braquage progressif avec la vitesse, inertie latérale et adhérence sur route mouillée, freinage avant la marche arrière, témoins de frein et de glisse, feux stop et mouvements de caisse ; réparation au Ressac.                           |
| Vie urbaine  | 19 véhicules de circulation avec conducteurs visibles, feux synchronisés avec leurs phases, files d’attente, piétons sur des boucles et des passages protégés, réactions de proximité, discussions gestuelles. Un incident routier peut ralentir le trafic temporairement.                                          |
| Vols         | **F** à portée d’un passant ou d’une voiture à l’arrêt. Réaction des passants, conducteur qui s’écarte, prise de contrôle et poursuite. Inès, Aya, les commerçants et la sûreté sont exclus des cibles.                                                                                                             |
| Sûreté       | Visibilité et repérage au Hangar 07 (caisses, accroupissement) ; patrouilles, poursuite à trois niveaux, perte de contact, contrôle avec amende (niveau 1), ou arrestation et transfert dans le commissariat des Docks (niveaux 2–3). Le guichet termine le contrôle et ouvre la grille.                            |
| Histoire     | Un chapitre en quatre objectifs avec deux séquences doublées et sous-titrées, trajet en ville, infiltration et choix final. La fin modifie les messages, la rémunération et le prix du café.                                                                                                                        |
| Économie     | Livraison chronométrée en deux étapes, remise à pied ou à la portière, record personnel sauvegardé ; achats au café, inventaire utilisable, tenues, stock du garage et réparations.                                                                                                                                 |
| Présentation | Heure, pluie, brume, reflets stylisés et lumière des vitrines. Guidage à pied autour des obstacles, itinéraires routiers, chevrons et flèche désactivables. Trois profils 3D et une vue Plan sans WebGL ; téléphone, boutons tactiles et carte.                                                                     |
| Reprise      | Position, monnaie, progression et fin du récit, vêtements, consommables, véhicules et dégâts, guidage, heure, course en cours. Sauvegarde v1 rétrocompatible : véhicules volés, butin déjà pris, état de l’alerte et contrôle en cours conservés. Le trafic non volé et les patrouilles reprennent leur simulation. |

## Choix d’architecture

- **WebGL 2 et Three.js déjà embarqué dans le dépôt.** Aucune construction ni dépendance réseau pour lancer la partie. Le code 3D ne se charge qu’après avoir appuyé sur Jouer.
- **Modèles originaux générés dans le moteur.** Surfaces profilées, assemblage et texture des véhicules, humanoïdes articulés et vêtements, façades texturées et mobilier à partir de descriptions reproductibles. Les modes Soigné et Cinéma chargent l’environnement HDR local en différé pour les réflexions. Le mode Éco et la vue Plan ne chargent pas ce fichier.
- **Une carte partagée.** `data.mjs` décrit le réseau, les lieux et objectifs. `world.js` instancie le quartier, son mobilier et ses volumes solides ; la carte utilise ses empreintes. `core.mjs` fournit le réseau de voies, les feux et les collisions. Les marques au sol et le trafic ne sont pas des animations indépendantes du plan.
- **États séparés.** `progress.mjs` valide la sauvegarde, les transactions, les choix et échéances. `game.js` arbitre les interactions et la simulation à pas fixe de 60 Hz. `dynamics.js` traite la circulation, les habitants et les patrouilles. `main.js` et `cartography.js` gèrent l’interface.
- **Caméra de jeu.** Le rig 3D suit la position et l’orientation de Noa avec amortissement ; le glissé suspend l’alignement automatique brièvement et V recadre. Une direction maintenue garde une base stable pour ne pas tourner sans fin lorsque la caméra la rejoint. Le recul s’adapte au format portrait et la position lissée est également testée contre les murs. La conduite garde son propre cadrage ; Plan et les plans des cinématiques ne prennent pas cette orientation.
- **Souris directe.** Un clic dans la vue 3D active `view-look.js`. La caméra suit toujours Noa en position, mais la souris contrôle son orientation sans recentrage automatique pendant ce mode. Maintenir le clic gauche fait avancer à pied dans la direction regardée. Le navigateur peut capturer le pointeur ; sans capture, les mouvements dans la vue ont le même effet et le bord de l’écran prolonge la rotation. Échap, un menu ou la perte de focus libèrent la souris et annulent les commandes maintenues. Le glissé au doigt et la vue Plan restent indépendants.
- **Vol et circulation.** Un passant d’ambiance donne du butin une seule fois par sauvegarde. Les voitures civiles ont un identifiant stable : un vol retire le véhicule du pilotage automatique, conserve un seul exemplaire dans les collisions et le transfère au modèle de conduite de Noa. Les habitacles utilisent le même modèle avec des sièges et un tableau de bord ; des vitres teintées laissent voir la pose assise. Le conducteur civil sort avec la même tenue et Noa apparaît au volant. L’occupant de la voiture active est déduit de la sauvegarde, pas enregistré comme un nouvel objet. Le véhicule peut être laissé ou repris avec E, même après rechargement, sans entrer dans le stock du garage. Les vols alimentent la même alerte que les intrusions.
- **Budget de rendu.** `district-render.js` regroupe les façades, chaussées et enseignes dans une texture tableau et des lots spatiaux. Une seconde texture tableau à deux canaux contient les pentes de relief de l’asphalte, des pavés, des façades et de la tôle ; elle est échantillonnée de près en Soigné et Cinéma. Éco garde les textures de couleur sans ce calcul. Le vitrage ne recalcule pas l’image derrière la voiture. On élimine les petits détails lointains, précalcule une partie de l’éclairage des lampes et regroupe les personnages proches en deux maillages par squelette. Les ombres dynamiques sont réservées au profil Cinéma ; le contraste de contact en Éco et Soigné repose sur le matériau et les ombres locales simplifiées. Les poses visuelles sont calculées à la cadence d’affichage, séparément des collisions et de la circulation. La simulation limite le rattrapage à dix pas par image ; après un gros blocage, elle peut donc avancer moins vite que le temps réel.
- **Réglages et repli.** Auto démarre en Éco sur le rendu logiciel détecté et sur les petits appareils ; il peut y descendre si Soigné ne tient pas son budget. La résolution 3D baisse progressivement après plusieurs images lentes et remonte après une période stable. Le profil Plan dessine en 2D les mêmes rues, volumes et acteurs avec `plan-view.js`. Il garde le nord en haut et les mêmes actions. Si WebGL 2 est indisponible, Plan prend le relais automatiquement. On peut aussi le choisir avant le démarrage pour ne pas créer de contexte WebGL.
- **Itinéraires.** `navigation.mjs` recherche un passage piéton dans une grille issue des mêmes collisions que le déplacement, puis simplifie le chemin en vérifiant les segments. En voiture, il prend les rues, rejoint les places de livraison dédiées ou indique où s’arrêter avant de continuer à pied. La carte et le radar réutilisent le même fond précalculé ; seuls les routes et marqueurs s’y redessinent. Le pointeur sélectionne le repère réellement dessiné le plus proche, dans la même projection. Le guidage ne conduit pas le joueur automatiquement.
- **Interface portuaire.** Registre de bord, plaque de la capitainerie, veille VHF, carte marine et téléphone La Traverse utilisent le même langage graphique. Le journal donne accès aux séquences terminées sans modifier la sauvegarde.
- **Habillage et gestes.** `harbor-set.js` ajoute la boiserie, les enseignes et les décors du Sillage et du belvédère aux lots du district. L’accastillage détaillé et l’intérieur sont masqués à distance. Les bouées, le navire amarré et les pavillons n’ajoutent pas d’objets physiques. `acting.mjs` règle les appuis et les gestes. Les trois personnages ont des profils de tête, de coiffure et de vêtements distincts.
- **Audio et découpage.** Les ambiances, moteurs, portières, impacts et sirènes sont synthétisés par Web Audio. Des couches distinctes donnent les impacts du talon, l’abrasion de la semelle et les éclaboussures ; le pas et la pose utilisent la même phase de marche. L’ambiance est atténuée pendant les séquences. `cinema.mjs` garde une seule piste active à la fois, synchronise les attaques de la bouche sur l’enveloppe d’amplitude et change de cadre à chaque réplique. En cas de média muet, bloqué ou indisponible, la lecture se poursuit au rythme des sous-titres. Le temps du jeu et les positions restent figés pendant la scène, même si les deux modèles prennent d’autres marques pour le cadrage. Un choix final ne se fait jamais automatiquement. Voir [le dossier du doublage](voice/README.md) pour VoiceStudio et les crédits.

## Mesure 0.1 → 0.2

Chromium 140, ANGLE SwiftShader (logiciel), fenêtre 1152 × 720, pluie, son coupé, Noa à l’arrêt au départ. Comparaison Éco avec la même caméra et le même tampon **651 × 406** ; puis vue Plan dans les mêmes conditions de jeu. Mesures échantillonnées pendant environ huit secondes par essai.

| Version, mode               | Soumissions de rendu / image | Triangles / image | Images/s lors du test |
| --------------------------- | ---------------------------: | ----------------: | --------------------: |
| 0.1, Éco                    |                          382 |           196 951 |                   4,2 |
| 0.2, Éco à résolution égale |                           96 |           106 419 |                   7,1 |
| 0.2, Plan 2D                |                            — |                 — |                  17,2 |

La scène 3D de départ coûte donc environ **75 % de soumissions en moins** à résolution égale. Le débit sur ce moteur logiciel est variable et la 3D peut encore saccader ; la vue Plan est l’option la plus légère. Ces mesures ne prédisent pas les images/s d’un PC ou d’un téléphone donné.

### Budget après l’habillage de la 0.3

Même procédure, comparaison dédiée entre les deux versions (même caméra et tampon en Éco). La plupart des ajouts de décor sont dans les secteurs existants ou ne sont visibles qu’à courte distance.

| Version / mode | Soumissions / image | Triangles / image | Images/s dans ce test |
| -------------- | ------------------: | ----------------: | --------------------: |
| 0.2 / Éco      |                  96 |           106 557 |                   6,9 |
| 0.3 / Éco      |                  98 |           108 915 |                   6,5 |
| 0.3 / Plan     |                   — |                 — |                  17,0 |

La 0.3 retrouve à peu près le budget géométrique de la 0.2 au départ malgré l’habillage (+2 soumissions). La 3D logicielle demeure lente dans ce test ; le mode Plan reste recommandé si Éco est trop lent. Aucun MP3 ni HDR n’a été chargé lors de la mesure en jeu.

### Contrôle du budget 0.5

Sur un essai SwiftShader de 8 s au départ, fixé à 651 × 406 en Éco (pluie, son coupé), le passage de la 0.4 à la 0.5 représente **98 → 100 soumissions** et **113 450 → 114 248 triangles** par image en moyenne. Les débits observés étaient de 6,5 et 7,7 i/s ; un seul passage en rendu logiciel ne permet pas de conclure à un gain sur un appareil réel. Plan a donné 15,1 i/s dans cet environnement, à 678 × 424. Aucun nouvel asset audio ni modèle externe n’est chargé.

## Corrections ciblées en 0.5

- **Marche arrière :** l’impulsion du premier pas de 60 Hz était inférieure au seuil d’arrêt sur l’Estuaire V2. Ce seuil ne s’applique qu’au freinage et à la décélération sans accélération. Essais aussi avec dégâts, pluie et frein à main.
- **Appuis :** le pied restait levé si le personnage s’arrêtait au milieu d’un pas. L’amplitude de levée décroît maintenant avec la foulée ; pas de bruit de pas en glissant contre un mur ou à l’arrêt.
- **Carte :** l’archive pouvait être sélectionnée à travers un marqueur invisible. Le clic utilise les mêmes points que le dessin et la taille CSS réelle de la carte. Les raccourcis incluent les deux points de livraison.
- **Tactile et audio :** les commandes appartiennent à un identifiant de pointeur, pour qu’un relâchement n’annule pas un autre doigt. Un échec de création du graphe Web Audio laisse le jeu jouable en silence.

## Ajouts ciblés en 0.6

- **Passages piétons.** Les dimensions des zébras et la ligne d’arrêt sont communes au décor, à Plan et aux trajets simulés. Le freinage se calcule depuis l’avant du véhicule, plaque comprise. Le déplacement de chaque pas est plafonné à la distance restante jusqu’à la ligne d’arrêt. Si le véhicule est déjà engagé, il ne s’arrête pas à cause du feu derrière lui. Le passage non régulé du Sillage est aussi traité dans les deux sens ; les piétons y attendent que la voie soit dégagée avant de traverser.
- **Commissariat.** Quand le contrôle aboutit à une arrestation, un court fondu marque le transfert jusque dans la pièce de retenue. L’accueil, les cloisons, la grille et le portail s’appuient sur les mêmes collisions en 3D et en Plan. La retenue est une donnée facultative du format v1, indépendante de l’histoire, du guidage et des véhicules. L’amende de sortie est prélevée une seule fois et ne peut pas dépasser le solde ; le chrono de livraison reste suspendu jusqu’à la fin du contrôle. La voiture de Noa, si elle était au volant, reste à l’endroit de l’interpellation.
- **Caméras et habitacles.** Vue subjective à hauteur des yeux, y compris accroupie. En voiture, l’œil est attaché à la caisse avec regard latéral borné et recentrage **V**. La vue intérieure masque le corps du conducteur et atténue la teinte de son propre vitrage, pas celui du trafic. Plancher, sièges, contre-portes et console sont modélisés ; les cadrans et le volant suivent la vitesse et le braquage. Pas de passe de réflexion supplémentaire pour les rétroviseurs. Le choix de vue n’altère ni Plan ni les cadrages du récit.

## Vérification

```sh
node --test tools/meridien.test.mjs
node tools/check.mjs
python3 tools/serve.py 8000 /game/meridien/
```

Le parcours Chromium optionnel vérifie le chapitre du quai au choix final en faisant avancer la vraie simulation. Il couvre aussi le décodage MP3 et l’enchaînement automatique, l’arrêt et la reprise des répliques, le choix annulé puis validé, le rejeu sans modifier l’histoire, la reprise, les commerces, les points de livraison et le record, la poursuite au hangar, la pluie, le passage de 3D à Plan sans recharger, la caméra à l’épaule (suivi, glissé, recadrage et murs), la souris directe avec capture et en aperçu intégré sans capture, le centrage du réticule et son retrait dans les menus, les repères cartographiques cliquables et tactiles, les trajectoires de sons synthétisés, la présence des conducteurs à l’arrêt, la sortie et la reprise avec ou sans occupant, les arrêts en amont des zébras et la priorité piétonne, la vue subjective avec compteur, souris directe, retour après une cinématique et transfert vers Plan, l’arrestation après un vol, la sauvegarde en retenue, le retour à la rue, les commandes tactiles dans l’habitacle à 320 × 568 et le repli tactile sans WebGL (relâchement distinct des pointeurs). Le serveur doit être démarré avant le test. Cette dépendance n’est pas nécessaire pour jouer :

```sh
npm install --prefix /tmp/meridien-test playwright
node /tmp/meridien-test/node_modules/playwright/cli.js install chromium
PLAYWRIGHT_MODULE=/tmp/meridien-test/node_modules/playwright/index.mjs node tools/meridien.browser.mjs
```

On peut fournir un autre `MERIDIEN_URL`, un `CHROMIUM_EXECUTABLE` ou `WEBGL_SOFTWARE=1` pour Chromium sans GPU matériel.

Parcours manuel : test des commandes, du son et de l’entrée en ville. Suivre le café puis le Hangar 07 ; essayer une approche accroupie et une approche qui déclenche l’alerte. Copier le registre, sortir par l’entrée principale, choisir une fin auprès d’Aya et relire les messages. Accepter une livraison auprès de Jo, passer par les Verrières puis la Balise Nord. Acheter une veste, un café et un véhicule ; vérifier leur état et le solde après rechargement. Tester le guidage libre et le réglage pluie/brume depuis la pause. Près du Sillage, vérifier que saluer et voler un passant sont deux actions distinctes. Prendre une voiture arrêtée, rouler, puis recharger la sauvegarde.

Les polices Barlow Condensed et IBM Plex Mono sont embarquées avec leurs licences OFL, dans `art/fonts/`. Il n’y a pas de serveur de comptes ni de télémétrie ajoutés par le jeu.

## Ce qui vient après

1. **Consolider ce quartier** : mesurer sur des GPU modestes réels et sur plusieurs navigateurs, enrichir les réglages d’accessibilité, les carrefours et les animations.
2. **Étendre le district plutôt que copier des îlots** : pont mobile et rive industrielle puis quartier résidentiel aux tracés propres ; chargement par secteurs, budgets d’objets et nouvelles activités liées aux lieux.
3. **Poursuivre l’histoire** : les conséquences du choix du chapitre 01 ouvrent deux pistes qui convergent au deuxième acte. Approfondir la direction de comédiens et l’animation du visage avant d’élargir la distribution et les séquences.
4. **Enrichir les véhicules et la simulation** : motos, poids lourds, châssis avec suspensions par roue, lignes de circulation secondaires et interactions dans les habitacles. La version actuelle n’implémente ni ces catégories ni un système d’armes. Toute mécanique d’action future doit d’abord servir l’enquête, pas seulement remplir une liste.

Ce lot constitue un premier chapitre autonome, pas une ville AAA intégrale. Une production de cette ampleur demanderait de nombreux cycles supplémentaires de création artistique, de contenu et de tests.
