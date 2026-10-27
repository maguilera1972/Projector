# PROJECTOR

Plateforme de gestion de projets conforme à la **méthode HERMES 5.1** (norme eCH-0054).

**Dépôt :** [https://gitlab.aguilera.ch/Aguilera_Lab/Projector](https://gitlab.aguilera.ch/Aguilera_Lab/Projector)

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS 4
- Stockage local JSON (`data/projector.json` ou chemin configurable)
- Génération de documents Word HERMES (Python 3)

## Prérequis

- Node.js 20+ (22 recommandé)
- npm 9+
- Python 3 (pour la génération des fichiers `.docx` HERMES)

## Installation rapide

```bash
git clone https://gitlab.aguilera.ch/Aguilera_Lab/Projector.git
cd Projector
npm install
cp .env.example .env.local
```

Éditez `.env.local` :

```bash
# Obligatoire en production — générez une valeur aléatoire longue
PROJECTOR_SECRET=$(openssl rand -hex 32)

# URL publique si derrière HTTPS / reverse proxy
# PROJECTOR_PUBLIC_URL=https://projector.example.com
# PROJECTOR_COOKIE_SECURE=true

# Compte admin créé au premier démarrage (à définir)
# PROJECTOR_ADMIN_EMAIL=votre@email.example
# PROJECTOR_ADMIN_PASSWORD=ChangezMoi
```

### Mode développement

```bash
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

### Mode production

```bash
npm run build
npm run start
# ou sur le port 3001 :
npm run start:present:3001
```

### Service systemd (redémarrage auto)

Un exemple est fourni dans `deploy/projector.service`.  
Scripts utiles :

```bash
npm run service:rebuild   # build + restart (si service utilisateur installé)
npm run service:status
npm run service:restart
```

Installation typique du service utilisateur :

```bash
mkdir -p ~/.config/systemd/user
cp deploy/projector.service ~/.config/systemd/user/
# Adapter WorkingDirectory / chemins dans le fichier
systemctl --user daemon-reload
systemctl --user enable --now projector.service
loginctl enable-linger "$USER"
```

## Premier compte

Au premier démarrage (base absente), un administrateur est créé. **Définissez vous-même** l’adresse e-mail et le mot de passe dans `.env.local` avant le premier lancement :

| Champ | Valeur |
|--------|--------|
| E-mail | variable `PROJECTOR_ADMIN_EMAIL` (à définir par l’utilisateur) |
| Mot de passe | variable `PROJECTOR_ADMIN_PASSWORD` (à définir par l’utilisateur) |

Sans ces variables, des valeurs de secours génériques du code sont utilisées — changez-les immédiatement après la première connexion (Profil).

Les données sont stockées dans :

- `data/projector.json` si le dossier est accessible en écriture
- sinon `.local/projector-data/projector.json` (automatique)

Vous pouvez forcer le chemin avec `PROJECTOR_DB_FILE`.

## Templates Word HERMES

```bash
npm run hermes:templates:install   # si applicable à votre environnement
npm run hermes:templates:verify
```

Les gabarits et le référentiel sont sous `reference-data/` et `scripts/hermes/`.

## Structure

```
src/
├── app/                 # Pages et routes API
├── components/          # UI (admin, projets, tâches, …)
├── lib/                 # Auth, store JSON, HERMES, documents
└── types/               # Types TypeScript
deploy/                  # Exemples de déploiement
scripts/                 # Démarrage, HERMES, rebuild service
docs/                    # Cahier des charges
```

## Fonctionnalités principales

- Authentification, profil, administration (utilisateurs, projets, portfolios)
- Projets HERMES 5.1 (approche classique / agile), phases, quality gates
- Tâches, planning, dépendances, baselines
- Documents générés (Word / aperçu / PDF), notifications in-app
- Portfolios et affectation mandant

## Documentation

- `docs/cahier-des-charges-gestion-projets-hermes5.md` — spécifications
- `agents.md` — consignes pour agents de développement
- `.env.example` — variables d’environnement

## Cloner / mettre à jour

```bash
git clone https://gitlab.aguilera.ch/Aguilera_Lab/Projector.git
cd Projector
git pull origin main
npm install
npm run build
```

## Publier des changements vers GitLab

Le dépôt principal est sur GitLab : `https://gitlab.aguilera.ch/Aguilera_Lab/Projector.git` (remote `origin`).
Le script `scripts/publish-to-gitlab.sh` committe les changements et pousse la branche `main`.

Prérequis (jeton GitLab **non versionné**, portée `write_repository`) :

```bash
mkdir -p ~/.config/gitlab
echo 'VOTRE_JETON_GITLAB' > ~/.config/gitlab/personal_access_token
chmod 600 ~/.config/gitlab/personal_access_token
# ou : export GITLAB_TOKEN=...
```

```bash
./scripts/publish-to-gitlab.sh --dry-run "Message de commit"   # vérification
./scripts/publish-to-gitlab.sh "Message de commit"             # tout l'arbre (hors exclusions)
./scripts/publish-to-gitlab.sh "Message" -- src/x.ts CHANGELOG.md  # chemins ciblés
```

Chaque publication s'accompagne d'une entrée dans `CHANGELOG.md` (section du jour, en français).

Avec l'agent Cursor : toute modification demandée est publiée **par défaut** sur GitLab
(changelog + commit + push), sauf mention explicite « sans publier » / « ne pousse pas » / « local only ».

Gitea (`https://git.aguilera.ch/Aguilera_Lab/Projector`) reste accessible comme remote secondaire `gitea` ;
le miroir via `scripts/publish-to-gitea.sh` n'est plus requis.

## Licence

Aguilera Lab — usage selon les règles de l’organisation.
