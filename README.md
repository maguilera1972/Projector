# PROJECTOR

Plateforme de gestion de projets conforme à la **méthode HERMES 5.1** (norme eCH-0054).

**Dépôt :** [https://git.aguilera.ch/Aguilera_Lab/Projector](https://git.aguilera.ch/Aguilera_Lab/Projector)

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
git clone https://git.aguilera.ch/Aguilera_Lab/Projector.git
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

# Mot de passe du compte admin créé au premier démarrage (optionnel)
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

Au premier démarrage (base absente), un administrateur est créé :

| Champ | Valeur |
|--------|--------|
| E-mail | `michel@aguilera.ch` |
| Mot de passe | variable `PROJECTOR_ADMIN_PASSWORD`, sinon valeur par défaut du code |

Changez ce mot de passe après la première connexion (Profil).

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
git clone https://git.aguilera.ch/Aguilera_Lab/Projector.git
cd Projector
git pull origin main
npm install
npm run build
```

## Publier des changements vers Gitea

Sur la machine de développement, le script `scripts/publish-to-gitea.sh` pousse la branche `main` vers  
`https://git.aguilera.ch/Aguilera_Lab/Projector.git`.

Prérequis (jeton **non versionné**) :

```bash
mkdir -p .local
echo 'VOTRE_JETON_GITEA' > .local/gitea-token
chmod 600 .local/gitea-token
# ou : export GITEA_TOKEN=...
```

```bash
./scripts/publish-to-gitea.sh "Message de commit"
```

Avec l’agent Cursor : ajoutez à votre demande de modification une phrase du type  
« et publie sur Gitea » / « mets à jour le dépôt » — la publication est alors faite automatiquement en fin de tâche.

## Licence

Aguilera Lab — usage selon les règles de l’organisation.
