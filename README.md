# project


## Authentification (Turso)

Système d'authentification réel : comptes, sessions en base, pages privées.

- **Base de données** : [Turso](https://turso.tech) (libSQL/SQLite distribué) via `@libsql/client`
- **Mots de passe** : `scrypt` (sel aléatoire par utilisateur, comparaison à temps constant)
- **Sessions** : jeton aléatoire 256 bits stocké **haché (sha256)** en base, cookie `httpOnly` + `SameSite=Lax` (30 jours, révocable)
- **Pages protégées** : `/app/` (espace créateur) et `/editor/` redirigent vers `/login/` sans session valide
- **Sécurité** : anti-énumération de comptes, limitation de débit par IP, validation stricte des entrées, requêtes paramétrées, fichiers sensibles jamais servis

### API

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/api/auth/register` | inscription (name, email, password ≥ 8) + session |
| POST | `/api/auth/login` | connexion + session |
| POST | `/api/auth/logout` | déconnexion (révoque la session) |
| GET | `/api/auth/me` | utilisateur courant ou 401 |
| GET | `/api/health` | santé du serveur + type de base |

### Configuration Turso

```bash
turso db create kreo
turso db show kreo --url        # → libsql://kreo-xxxxx.turso.io
turso db tokens create kreo     # → jeton d'authentification
```

Variables d'environnement (voir `.env.example`) :

```
TURSO_DATABASE_URL=libsql://kreo-xxxxx.turso.io
TURSO_AUTH_TOKEN=...
PORT=8000
NODE_ENV=production
```

En développement local (aucune variable requise) : le serveur utilise un
fichier SQLite local `./data/kreo.db`.

## Déploiement (Render)

1. Créer un **Web Service** Node connecté au repo GitHub
2. **Build Command** : `yarn` (ou `npm install`)
3. **Start Command** : `yarn start` (ou `npm start`)
4. Ajouter les variables `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `NODE_ENV=production`
5. Redéployer : chaque push sur `main` déploie automatiquement

```bash
node server/index.js                # site + auth sur le port 8000
node server/index.js --redirect /app/   # instance « espace créateur »
```
