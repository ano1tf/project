# Méridien · plan de transformation

## Audit de départ (0.8)

| Domaine | Fonctionnel : à préserver | Limite et point d’extension |
| --- | --- | --- |
| Locomotion | Pas fixe de 60 Hz ; mêmes collisions, routes et positions en 3D et en Plan ; souris, tactile et habitacles déjà testés | `core.mjs` et `data.mjs` supposent une grille orthogonale et un rectangle de 369 × 331 m. Étendre simplement les bornes produirait des routes, des cartes et des patrouilles incohérentes. Avant les régions : séparer le graphe de circulation des parcelles et décrire les entrées de secteur. |
| Rendu | Secteurs et atlas urbains, cache solaire, résolutions adaptatives, textures et son locaux | Le district est assemblé au lancement. Première extension : un lot Kreo chargé à proximité, constitué indépendamment des collisions et des systèmes de jeu. Pas de conversion de toute la ville ni de nouvelle dépendance réseau. |
| Vie urbaine | Feux et zébras, conducteurs, sûreté, garde à vue, deux routines locales, livraison chronométrée | Les stocks, contrats et événements doivent évoluer avec l’horloge commune, sans simuler un PNJ par transit lointain. Ne pas réutiliser le chrono de Jo pour le fret commercial. |
| Progression | *Sous la surface*, puis *Fréquences de veille* ; choix, commerce, voitures, journal et sauvegarde v1 | Un emplacement et pas de relevé d’opérations. Premier lot : trois carnets isolés dont le premier reprend la clé v1, extensions facultatives et bornées, refus des données illisibles sans écrasement implicite. Réglages partagés par le navigateur. |
| 3D | Atelier Kreo : format validé, éditeur, aperçu, assemblages et export ; un même Sémaphore est édité et joué | Concevoir le Comptoir 12 dans le format de l’Atelier, inspecter, importer et jouer le lot dans Kreo, puis réutiliser le même fichier à Port-Lumière. La logique des portes et du fret ne dépend pas de la réussite d’un chargement graphique. |

## 0.9 · Premier lot jouable : La Relève du Port

Un service commercial récurrent relie Balise Nord, les Halles et le Garage Estuaire. Les stocks arrivent, sont consommés et sont réapprovisionnés à heures fixes, même si Noa fait autre chose. Un contrat réserve une quantité et un prix ; seuls l’arrêt à la vraie baie et la voiture déclarée permettent de prendre puis de remettre le chargement. Le véhicule peut être laissé ou repris, mais le chargement ne passe pas à un deuxième véhicule. Une course de Jo et le chapitre principal restent indépendants.

Après sa première remise, Noa peut acquérir le Comptoir 12, y entrer, aménager la réserve et confier des expéditions à Jo. Stocks du port, demande des clients, frais, caisse et relation client déterminent le résultat des tournées. Aucun prélèvement automatique dans le portefeuille. Banque, Fret, Agenda, Immobilier et Actualités lisent ce même état ; les menus qui n’ont pas de mécanique ne sont pas affichés.

### Règles et limites

- Un bordereau réserve du stock, de la place chez le client et un budget. À l’arrêt, Noa charge dans la baie, puis remet le fret avec la même immatriculation. Rendre une cargaison libère le contrat sans paiement ; l’abandon après l’échéance réduit la confiance seulement si les caisses ont été chargées.
- Horloge partagée : escales à 06 h 05 et 16 h 50 ; Jo peut confier une tournée à la navette à 08 h 25 ou 18 h 50. Les navettes sont des expéditions suivies par le registre, pas des véhicules routiers autonomes supplémentaires. Seule l’escale visible déplace un bateau. La simulation ne tourne ni dans les menus ni hors du jeu.
- L’aménagement du Comptoir passe de deux à quatre caisses par tournée. Donner la priorité aux Halles contre une remise modifie le client, le prix et la confiance. Les tournées ne ponctionnent jamais automatiquement le portefeuille.
- Les carnets ajoutent des champs au format v1, sans rétro-simuler les jours avant la reprise. Si l’ancienne partie se trouvait déjà sur cette parcelle auparavant vide, Noa ou les véhicules concernés sont replacés devant le Comptoir ; leur progression, leur état et leurs comptes restent intacts. Le guidage à pied contourne aussi la première voiture personnelle stationnée lorsqu’elle coupe le départ du trajet.

### Lot Atelier · Comptoir 12

Brief : office portuaire de plain-pied (10,8 × 7,6 m), lecture à hauteur humaine. Zinc à joints debout, brique et laiton sur la façade, verre armé, établi de cerclage, grand bureau de pointage et vrais passages. Quatre groupes (`facade`, `interior`, `shutter`, `reserve`) dans un [unique lot Kreo](../../editor/atelier/exemples/comptoir-12.kreo-asset.json). Les collisions et le seuil restent disponibles sans WebGL. En 3D, l’intérieur est masqué à distance et les pièces opaques de même finition sont regroupées par état de visibilité. 75 maillages source, 8 432 triangles et 32 maillages après regroupement en jeu. Pas de rig ni de clé d’animation pour ce bâtiment ; le rideau et la réserve sont deux états persistants.

Contrôle effectué par insertion dans l’Atelier, inspection de la façade, des retours et de l’intérieur, puis vues au quai en Éco et Soigné. La première inspection a révélé un moniteur sans pied et un mur de service trop nu ; la semelle, les finitions de l’appareillage, les conduits et le panneau des manifestes font partie de la correction.

### La Traverse · interface du téléphone

`phone.css` isole l’habillage sombre du téléphone des autres dialogues, dont la caisse du Comptoir. La barre d’état reprend l’heure du jeu ; la fermeture et l’indicateur d’accueil restent à l’écran quand le contenu défile. Le bordereau du fret affiche les stocks, le véhicule déclaré, le montant et l’échéance de la partie en cours, sans changer les règles ni les sauvegardes.

### Vérifications reproductibles

- `node --test tools/meridien*.test.mjs tools/kreo-atelier.test.mjs` : réservations concurrentes (réassort, Noa et navette), minuit, échéance, restitution, caisse, carnets, registre et collisions.
- `tools/meridien.port.browser.mjs` : conduite et marche à pas fixes dans le véritable quartier, contrôle de la baie, reprise chargée, titre, caisse, navette, passage en 3D et retour Plan. Il vérifie aussi le bordereau des Halles au clavier et à 320 × 568 au tactile (onglets, retours, défilement, suivi et annulation). Les trajets de fret sont exécutés par accélération, frein et direction, pas par mutation de la position pour valider les livraisons.
- `tools/meridien.browser.mjs`, `tools/meridien.ondes.browser.mjs`, `tools/kreo-atelier.browser.mjs` pour les parcours préexistants.

Résultat du lot : 45 tests Node et 7 contrôles Arena réussis ; sous Chromium, 7 groupes fret/carnets, 17 du jeu préexistant et 3 de *Fréquences de veille*, plus l’Atelier (y compris l’insertion du Comptoir), ses exports et la galerie. L’inspection en 3D sous SwiftShader est un contrôle de rendu, pas une mesure sur GPU matériel.

## Suite après la 0.9

Le [plan d’exécution](EXECUTION.md) détaille la prochaine livraison **Deux rives**, les conditions de validation et l’ordre des lots suivants. L’île complète, l’aéroport, les aéronefs et le mode photo avancé ne font pas partie du prochain lot. Le socle doit rester jouable en Plan hors WebGL.

Les trois premiers lots ont désormais leur [parcours jouable et leur recette](LITTORAL.md).
