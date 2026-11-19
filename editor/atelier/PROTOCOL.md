# Atelier Arena — contrat d’échange KREO v1

## Aller-retour

1. Dans l’éditeur, ouvrir **Connexion à Arena**. Décrire le modèle, ses dimensions et ce qui doit bouger. Le prompt peut inclure, au choix, jusqu’à 30 repères de la sélection ou du niveau actif (noms, positions, tailles). Le choix par défaut n’en partage aucun.
2. Copier le prompt dans **Arena → mode Agent**. Avec un dépôt déjà connecté, l’agent peut lire ce contrat et travailler sur les fichiers de sa branche selon les autorisations existantes. Sans dépôt, lui demander de renvoyer un bloc JSON ; le brief local `.kreo-request.json` peut être joint au message.
3. Production attendue : `creation.kreo-asset.json`, un seul **lot additif**, pas un projet complet. Si le dépôt est disponible, valider le fichier depuis le terminal du mode Agent :

   ```sh
   node tools/kreo-atelier.mjs validate chemin/creation.kreo-asset.json
   ```

4. Dans l’Atelier, ouvrir la réponse ou coller son JSON, **Vérifier le JSON**, orbiter dans l’aperçu, lire ou déplacer le curseur de temps, puis **Ajouter au niveau**. KREO insère un groupe au sol, sous le point visé par la caméra, dans le niveau actif. `Ctrl/Cmd+Z` annule l’ajout en une fois. Les maillages restent éditables ; la pose au repos reste celle de l’éditeur. **Jouer**, la sauvegarde et les exports de jeu conservent les animations.

Pour demander **des changements au projet** plutôt qu’un asset : utiliser un dépôt déjà autorisé ou exporter volontairement le projet `.kreo3d.json` depuis le bouton **Exporter** et le joindre dans Arena. Ce fichier complet peut inclure des scripts et modèles ; vérifier son contenu avant de le partager. Le prompt de l’Atelier, lui, ne transmet pas ce fichier.

Le lien de la « face technique » ouvre la documentation, **pas le contenu du projet**. Il n’authentifie personne. Aucun serveur d’édition, exécution de commande à distance, accès à `localStorage`, ajout de jeton, publication automatique ou transfert de projet n’est déclenché par ce bouton. L’atelier ne fait pas d’appel à un modèle : la génération se fait dans la session Arena ouverte par l’utilisateur.

## Lot `.kreo-asset.json`

Champs racine : `format: "kreo.asset"`, `version: 1`, `name`, `objects` et `description` facultative. `objects` contient des `group` (pivots) et des `mesh`. Au moins un maillage. Pour un lot portable, travaille autour de `[0, 0, 0]`, en mètres, axe **Y** vers le haut. Rotations **XYZ** en degrés.

| Champ d’objet | Convention |
| --- | --- |
| `id`, `name`, `type` | ID unique dans le lot : `a-z`, `0-9`, `_`, `-` (48 caractères max, commence par une lettre ou un chiffre). `name` libre (80 caractères max). `type` : `group` ou `mesh`. |
| `parent` | ID d’un `group` du même lot. Facultatif, sans cycle. La position, la rotation et l’échelle sont locales au parent. |
| `position`, `rotation`, `scale` | Triplets, défauts `[0,0,0]`, `[0,0,0]` et `[1,1,1]`. Le pivot est l’origine du maillage, choisie pendant la modélisation. |
| `primitive` **ou** `mesh` | Pour les `mesh` seulement. Primitives : `box` (cube unitaire), `plane` (plan XZ de 2 m), `cylinder` (rayon 0,6 m, hauteur 2 m), `cone`, `icoSphere`, `uvSphere`, `torus`. Sinon, `mesh: {"verts": [[x,y,z],…], "faces": [[0,1,2],…]}`. Indices à base zéro, ordre cohérent, 3 à 16 sommets par face. Triangles ou polygones **convexes** (triangulés en éventail). |
| `material` | Maillage uniquement. `color` et `emissive` sont des `#RRGGBB`. `roughness`, `metalness`, `opacity` dans `[0,1]` (opacité ≥ 0,08). Pas de texture ou de lien externe dans ce format. |
| `collidable` | Défaut `false`. À réserver aux volumes statiques ; interdit sur tout élément animé ou enfant d’un pivot animé. |
| `motion` | Au choix sur un `group` ou un `mesh`. Voir ci-dessous. |

**Animation.** `motion.duration` en secondes (0,1 à 90). `loop` : `repeat` (défaut), `once` (maintient la pose finale), `pingpong`. `ease` : `linear` (défaut), `smooth` (entrée/sortie douce sur chaque segment), `step` (paliers). Chaque piste facultative `position`, `rotation`, `scale` contient des clés `[t, x, y, z]` en temps strictement croissant, de `0` à `duration`. Chaque piste a de 2 à 80 clés, dont la première à `0` et la dernière à `duration`. Il faut au moins une piste. `position` et `rotation` sont des **décalages** de la pose de base, `scale` un **multiplicateur** par axe. Les angles ne sont pas réduits modulo 360 : `[0,0,0,0]` → `[6,0,360,0]` fait bien un tour en 6 secondes. Pour un mécanisme articulé, anime un groupe de pivot et mets le maillage décalé dessous.

**Exemple minimal :**

```json
{
  "format": "kreo.asset",
  "version": 1,
  "name": "Girouette",
  "objects": [
    {
      "id": "pivot",
      "type": "group",
      "position": [0, 2, 0],
      "motion": { "duration": 6, "rotation": [[0, 0, 0, 0], [6, 0, 360, 0]] }
    },
    {
      "id": "bras",
      "parent": "pivot",
      "type": "mesh",
      "primitive": "box",
      "position": [0.6, 0.05, 0],
      "scale": [1.5, 0.12, 0.3],
      "material": { "color": "#c09354", "metalness": 0.3 }
    }
  ]
}
```

**Budgets du validateur.** 384 Kio par fichier, 96 objets, 8 niveaux de parenté, 2 400 sommets et 3 000 faces par maillage, 24 000 triangles / 900 clés par lot. Pas de code JavaScript, noms de fichiers à ouvrir, modèles distants, scripts, ni changements d’autres objets. Un rejet ne modifie pas la scène. L’import de projets KREO complets, qui peuvent contenir du code écrit par leur auteur, est un autre outil : ne pas l’utiliser pour une réponse de l’Atelier.

## Fichiers utiles

- [`exemples/semaphore.kreo-asset.json`](exemples/semaphore.kreo-asset.json) — même fichier dans l’aperçu, l’éditeur et le quartier du Sillage de Méridien.
- `asset-format.mjs` — validation pure, commune au terminal et au navigateur.
- `animation.mjs` — lecture et assemblage hiérarchique, embarqués par l’export autonome.
- `assembly.js` — montage et lecture depuis les données dans un hôte Three.js, utilisé par l’aperçu et Méridien.
