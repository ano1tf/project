# 🎮 Plan de la Landing Page — Éditeur de Jeux Web

> **Nom choisi : KREO** ✅ (logo : `assets/kreo-logo.png`)
> **Objectif :** Donner envie d'utiliser l'éditeur (100% web, sans installation) et de rejoindre le serveur Discord.
> **Public :** Tout le monde — débutants curieux comme créateurs expérimentés.
> **Date :** 15 novembre 2026
>
> ⚠️ **Note :** les informations techniques sur l'éditeur (à venir) ne seront PAS intégrées à la landing page — elles serviront directement à l'éditeur, construit plus tard.

---

## 1. Proposition de noms (à valider)

| # | Nom | Esprit | Pourquoi ça marche |
|---|-----|--------|-------------------|
| ⭐ 1 | **ForgePlay** | Création + jeu | « Forger » son jeu, clair immédiatement, gaming, facile à prononcer en FR/EN |
| 2 | **Ludia** | Ludique, français | Court, brandable, évoque « ludique », parfait pour tout le monde |
| 3 | **PixelForge** | Rétro + pro | Évoque le pixel art et la fabrication, très gaming |
| 4 | **PlayCraft** | Artisanat du jeu | « Fabrique ton jeu », convivial, proche de Minecraft/Roblox |
| 5 | **Noova** | Nouveau, nova | Moderne, tech, court, domaine disponible probablement |
| 6 | **Kreo** | Créer | Minimaliste, SaaS moderne (type Linear, Notion) |

**👉 Ma recommandation : `ForgePlay`** — il dit en 2 syllabes ce que fait le produit, il sonne bien sur Discord (« Rejoins ForgePlay ») et il se décline facilement en logo (une enclume + un play).

*On peut partir sur un nom provisoire et changer plus tard sans casser le design.*

---

## 2. Style visuel recommandé

**Thème : Sombre moderne + accent électrique**

- **Fond :** noir profond (`#0A0A0F`) — fait ressortir les jeux, esprit Discord / gaming
- **Accent principal :** dégradé violet → cyan (`#7C3AED → #06B6D4`) — énergie, créativité, tech
- **Texte :** blanc cassé sur fond sombre, très lisible
- **Typographie :** titre bold et arrondi (type *Space Grotesk* / *Clash Display*), corps lisible (*Inter*)
- **Effets :** glassmorphism (cartes translucides), glow sur les boutons, animations douces au scroll, grille pixel subtile en arrière-plan
- **Pourquoi sombre ?** C'est le langage visuel de Discord, Twitch et des éditeurs (Unity, Unreal). Pour « tout le monde », on garde des formes arrondies et des couleurs vives pour rester accueillant, pas intimidant.

---

## 3. Structure de la page (section par section)

### 🔝 1. Header (fixe)
- Logo + nom
- Liens : Fonctionnalités · Galerie · Tarifs · FAQ
- Boutons : **« Rejoindre le Discord »** (secondaire) + **« Commencer à créer »** (primaire, dégradé)
- Sur mobile : menu burger

### 🎯 2. Hero — la première impression (la plus importante)
- **Titre fort :** « Crée ton jeu. Directement dans ton navigateur. »
- **Sous-titre :** « Aucune installation, aucun code obligatoire. Dessine, programme en blocs, publie et partage ton jeu en quelques minutes. »
- **2 CTA :**
  - Primaire : **« ▶ Commencer à créer — gratuit »**
  - Secondaire : **« Rejoindre le Discord »** (avec icône Discord)
- **Preuve sociale :** « +X créateurs · X jeux publiés · 100% gratuit pour débuter »
- **Visuel :** maquette animée de l'éditeur (canvas, blocs, bouton « Publier ») — on fera une fausse interface stylisée en CSS/JS, pas une capture

### 🏆 3. Bandeau de confiance
- Logos / mentions : « Inspiré par les meilleurs » ou chiffres clés animés (compteurs)
- Ex : « 0 installation · 5 min pour ton premier jeu · 1 lien à partager »

### ✨ 4. Fonctionnalités (grille bento)
6 cartes, chacune avec une mini-illustration :
1. **100% Web** — aucun téléchargement, ça marche partout
2. **Blocs visuels** — programme sans coder (drag & drop)
3. **Éditeur de niveaux** — dessine tes maps au pinceau
4. **Assets intégrés** — sprites, sons, effets prêts à l'emploi
5. **Publication en 1 clic** — un lien jouable à partager
6. **Multiplayer** — joue avec tes amis en ligne

### 🛠️ 5. Comment ça marche (3 étapes)
1. **Crée** — ouvre l'éditeur dans ton navigateur
2. **Construis** — glisse-dépose, dessine, programme en blocs
3. **Publie** — partage ton lien, reçois des joueurs

### 🎮 6. Galerie / Showcase
- 4 à 6 jeux créés avec l'éditeur (cartes avec image, genre, auteur, bouton « Jouer »)
- Donne envie : « Des jeux comme ceux-ci, créés par des joueurs comme toi »

### 💬 7. Communauté Discord (section dédiée — ton objectif n°2)
- Présentation du serveur : entraide, défis hebdo, partage de jeux, feedback
- **Widget Discord** (membres en ligne, bouton « Rejoindre »)
- Témoignages courts de membres (captures de messages)

### 💰 8. Tarifs (simple, rassurant)
- **Gratuit** — tout pour débuter, jeux illimités
- **Pro** — assets premium, multiplayer, statistiques
- Message clé : « Gratuit pour toujours pour les créateurs »

### ❓ 9. FAQ (accordéon)
- Faut-il savoir coder ? Non.
- Ça marche sur téléphone ? Oui, dans le navigateur.
- Mes jeux m'appartiennent ? Oui, à 100%.
- C'est vraiment gratuit ? Oui.
- Comment rejoindre le Discord ? 1 clic.

### 🚀 10. CTA final
- Grand titre : « Ton premier jeu t'attend. »
- Bouton géant : **« Commencer à créer »** + lien Discord
- Fond dégradé animé

### 🦶 11. Footer
- Logo, liens, réseaux (Discord en premier), copyright, « Fait avec ❤️ pour les créateurs »

---

## 4. Parcours utilisateur visé

```
Visiteur → Hero (comprend en 5 sec) → Fonctionnalités (convaincu)
  → Galerie (envie de créer) → Discord (communauté) OU "Commencer" (éditeur)
  → Retour sur Discord pour partager son jeu
```

**Hiérarchie des CTA (partout sur la page) :**
1. **« Commencer à créer »** — objectif principal (utiliser l'éditeur)
2. **« Rejoindre le Discord »** — objectif secondaire (communauté)

---

## 5. Technique envisagée

- **Page unique** (single page), responsive mobile-first
- **Stack légère :** HTML/CSS/JS moderne (ou React si on veut évoluer vers l'éditeur ensuite)
- **Animations :** scroll reveal, compteurs animés, hero interactif
- **Performance :** chargement < 2 sec, images optimisées
- **SEO de base :** titre, description, Open Graph pour les partages Discord

---

## 6. Prochaines étapes

- [ ] **Valider le nom** (ForgePlay ou autre)
- [ ] **Valider le style** (sombre + violet/cyan)
- [ ] Construire la landing page (Header → Footer)
- [ ] Brancher les vrais liens (éditeur + Discord)
- [ ] Tester sur mobile et desktop

---

*Document de travail — à ajuster ensemble avant de coder.*
