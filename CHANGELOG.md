# Journal des modifications

Toutes les modifications notables de PROJECTOR sont consignées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) :
une section par date (`## AAAA-MM-JJ`), puis les rubriques
**Ajouté**, **Modifié**, **Corrigé**, **Supprimé**, **Sécurité** selon les besoins.

Les nouvelles entrées s'ajoutent **en haut**, juste sous ce paragraphe.

## 2026-10-27

### Modifié

- Dépôt principal migré vers GitLab : `https://gitlab.aguilera.ch/Aguilera_Lab/Projector` (remote `origin`). Gitea reste disponible comme remote secondaire `gitea` (miroir facultatif).
- Règle Cursor `publish-gitlab.mdc` : après toute modification demandée, mise à jour du changelog, commit et push vers GitLab par défaut (sauf « sans publier », « ne pousse pas », « local only »).
- README et unité systemd (`Documentation=`) pointent vers GitLab.

### Ajouté

- Script `scripts/publish-to-gitlab.sh` (jeton `GITLAB_TOKEN` ou `~/.config/gitlab/personal_access_token`, option `--dry-run`, staging ciblé via `-- chemins`, exclusions des secrets et données runtime).
- Ce fichier `CHANGELOG.md`.

## 2026-07-20

### Ajouté

- Publication complète de l'application PROJECTOR HERMES5 pour déploiement : sources, documentation d'installation, `.env.example`, unité systemd `deploy/projector.service`, référentiel HERMES et modèles Word (sans secrets ni données runtime).
- Workflow de publication à la demande vers Gitea (`scripts/publish-to-gitea.sh`, règle Cursor associée).

### Modifié

- E-mail de l'administrateur initial rendu générique via la variable `PROJECTOR_ADMIN_EMAIL` (documentation).

## 2026-07-14

### Ajouté

- Squelette initial PROJECTOR HERMES5 (Next.js + TypeScript).
