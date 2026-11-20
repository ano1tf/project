# Méridien 0.12 — Les deux rives, en jeu

[Ouvrir le jeu](./) · [Trajectoire de développement](EXECUTION.md) · [Lot éditable des Grèves](../../editor/?atelier=greves)

## Trois parcours à essayer

1. **Deux rives.** Depuis le Sillage, ouvrez la carte et choisissez **Atelier des Grèves**. Le pont fixe relie le quai des Marées au quai des Calfats ; les cheminements latéraux permettent de le prendre à pied. Pour faire le trajet comme livreur, ouvrez **La Traverse → Applications → Fret**, signez un bordereau des **Grèves**, puis chargez à la **Balise Nord** avec le véhicule inscrit. Immobilisez ce même véhicule dans la baie jaune de l’atelier et utilisez **E**. Vous pouvez sauvegarder sur la route, sur le pont ou à l’arrivée. Le stock de la Balise baisse au chargement ; le règlement et le stock de l’atelier ne changent qu’à la remise.
2. **Littoral habité.** Entrez à pied dans l’atelier, par la façade côté baie. Mina contrôle les pièces de **07:30 à 11:45** et de **14:00 à 19:15** ; entre les permanences elle relève les jauges dehors, et Nadir passe sur les quais selon sa tournée. Au banc, soustrayez le zéro du comparateur de la cote brute et choisissez le joint qui respecte la tolérance. Le lot change avec le jour ; l’atelier règle **62 €** une seule fois par jour, sur sa caisse disponible. Le registre ordinaire de fret continue avec ou sans Noa sur la rive. L’atelier, la baie et le registre restent accessibles hors permanence. En cas de fermeture du banc, le bouton d’attente annonce l’heure et avance explicitement l’horloge ; il n’est pas offert pendant un bordereau, une course ou un contrôle.
3. **Le Cahier de la passe.** Après l’une ou l’autre fin de *Fréquences de veille*, retrouvez Salomé aux Ondes (le Journal peut guider). Suivez l’embarcadère des Marées pour obtenir le plan des amers à bord de la **navette des Sondes**. Départs horaires de **07:20 à 20:20** côté Marées, de **07:44 à 20:44** côté Grèves. Embarquement au guichet dans les six minutes qui précèdent le départ, trajet de douze minutes de jeu et descente automatique à l’arrivée. Si vous manquez un départ, le guichet montre le suivant, même le lendemain ; le pont reste disponible. La navette prend les piétons seulement : le véhicule et son chargement restent à quai. Le billet ordinaire coûte **8 €** ; la place liée au dossier est prise en charge. À terre, comparez le plan et le registre dans l’atelier et choisissez où déposer le tracé. L’affiche ou la pochette restent en place, et le Journal garde la trace de la décision. Ni la publication initiale ni la bande originale ne changent.

En **Plan**, les trois parcours ont les mêmes collisions, horaires, règles et sauvegardes. Le contrôle est au **banc**, le dépôt du dossier au **registre** : ce sont deux actions à l’intérieur du bâtiment, pas dans la baie de fret.

## Carnets et technique

- Au premier enregistrement, le jeu écrit un **carnet v2 séparé**. Les trois emplacements relisent leurs anciens v1 si aucun v2 n’existe ; les octets v1 ne sont jamais réécrits. Revenir à une ancienne build ne peut donc pas écraser le v2. Revenir ensuite à la 0.12 reprend le v2, sans fusionner les deux historiques. Un carnet illisible n’est remplacé qu’après confirmation.
- La carte emploie une emprise visuelle élargie, mais la circulation interroge l’union de deux secteurs et du tablier. Le quadrillage d’itinéraires de Port-Lumière ne change pas. En mer, seul un billet valide et l’horloge peuvent placer le passager sur la navette ; le carnet conserve l’embarcadère de départ et l’horaire, pas une position libre dans l’eau.
- Le lot `.kreo-asset.json` du banc, de la réserve et de l’armoire est chargé près de l’atelier en 3D. La géométrie est regroupée par finition et libérée en s’éloignant. La source validée reste en mémoire ; on ne la télécharge pas à chaque visite. Le jeu installe les volumes, l’accès et les interactions avant tout téléchargement, avec des meubles de secours si le lot est indisponible. Plan ne demande pas le fichier. Les deux habitués ne font pas tourner un trafic hors champ : leur pose est échantillonnée à l’heure de jeu près du quai.

## Reproduire la recette

Lancez `python3 tools/serve.py 8000` sans redirection, puis exécutez dans un autre terminal :

```sh
node --test tools/meridien*.test.mjs tools/kreo-atelier.test.mjs
node tools/kreo-atelier.mjs validate editor/atelier/exemples/atelier-des-greves.kreo-asset.json
node tools/meridien.port.browser.mjs
node tools/meridien.browser.mjs
node tools/meridien.ondes.browser.mjs
node tools/kreo-atelier.browser.mjs
```

Les suites navigateur utilisent Playwright et Chromium. `MERIDIEN_PORT_TEST=legacy|rives|littoral|passage` sélectionne un groupe. Le script `node tools/meridien.rives.perf.mjs` relève trois séries synchronisées par pose et cinq allers-retours du lot intérieur. `MERIDIEN_BASELINE` peut pointer sur une copie plus ancienne de `game/meridien` pour garder résolution, profil et météo identiques. Le temps mesuré inclut la synchronisation de lecture GPU ; ce n’est pas le débit en jeu.

**Résultats.** 57 tests Node et 7 contrôles Arena réussis. Les 12 parcours navigateur de fret, d’atelier et de navette passent, dont l’aller-retour par le pont, la reprise en mer, le tactile à 320 × 568 et la livraison avec un lot 3D illisible. Les suites du chapitre initial et de *Fréquences de veille* passent également. Les trois exemples Kreo valident ; l’insertion du lot des Grèves, l’édition de ses groupes, les exports hors ligne et le lancement des démos depuis la vitrine ont été vérifiés.

## Mesures 0.9 → 0.12

Comparaison en Chromium/SwiftShader, profil Éco, temps clair, fenêtre de 960 × 600, échelle de rendu 0,82. Trois passages de 20 images par pose : les colonnes de temps donnent la médiane des trois p50 ou p95, avec lecture GPU synchronisée.

| Pose | Soumissions par image | Triangles par image | p50 (ms) | p95 (ms) |
| --- | ---: | ---: | ---: | ---: |
| Quai des Marées | 126 → 126 | 118 074 → 119 068 | 203,0 → 201,7 | 294,1 → 299,8 |
| Tisserands | 74 → 74 | 102 182 → 102 200 | 379,4 → 343,5 | 485,6 → 367,6 |
| Pont (0.12) | 29 | 25 168 | 152,1 | 174,9 |
| Parvis des Grèves (0.12) | 37 | 25 384 | 169,9 | 202,9 |
| Atelier (0.12) | 44 | 25 444 | 194,9 | 273,2 |
| Embarcadère avec navette (0.12) | 51 | 28 258 | 150,9 | 231,7 |

Du clic de départ au canevas : **5,20 → 5,57 s**. Premier montage du lot des Grèves : **0,48 s**, lecture du fichier et deux rendus synchronisés compris. Sur cinq retours, **un seul téléchargement au total** et **22 géométries du lot libérées à chaque sortie**. Les compteurs du moteur restent à 191 géométries / 10 textures à l’intérieur et reviennent à 176 / 10 au quai après chaque sortie. Le retour au banc avec le lot en cache prend de 1,19 à 1,32 s dans ce protocole, qui comprend six rendus synchronisés par pose.

Ces chiffres contrôlent le coût en **3D logicielle**, pas le débit en jeu. Certains p95 de la première série, avant les retouches de décor, dépassaient déjà +10 % au port. La cible de **+10 % maximum au p95 sur GPU intégré** reste à vérifier sur matériel réel.

**Périmètre.** Le pont est fixe et ne transporte pas un trafic IA entre les rives. La navette est la seule nouvelle ligne. Le pont mobile et le quartier résidentiel, puis l’aéroport, le pilotage, la photo avancée et la longue campagne restent hors de cette livraison.
