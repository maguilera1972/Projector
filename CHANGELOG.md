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
- Session : l'utilisateur est relu en base à chaque requête — un changement de rôle, de permissions ou une suspension s'applique immédiatement, sans reconnexion.
- Notifications stockées avec des paramètres et traduites à l'affichage dans la langue du destinataire (les anciennes restent en français).
- Documents HERMES générés et Word : libellés (scénario, phase, approche, statuts, titres) dans la langue du projet ; corps de modèles en anglais pour l'italien, l'espagnol et l'allemand.

### Ajouté

- Classeur documentaire par projet : dossier « Général / Toutes les phases » et un sous-dossier par phase HERMES de l'approche du projet, créés automatiquement (et complétés pour les projets existants), avec statut de phase (terminée / en cours / à venir) et ouverture par défaut sur la phase en cours.
- Sous-dossiers personnalisés (un niveau) dans le dossier général ou un dossier de phase : création, renommage, suppression s'ils sont vides.
- Documents annexes par projet : dépôt (PDF, Office, images, zip, txt…, 25 Mo par défaut via `PROJECTOR_UPLOAD_MAX_MB`), titre, description, catégorie (contrat, offre, compte-rendu, spécification, autre), phases concernées, dossier de classement ; filtres, versions successives avec historique, téléchargement par version, modification des métadonnées, suppression logique tracée dans le journal d'audit.
- Livrables HERMES générés affichés dans le dossier de leur phase, distingués des annexes ; classeur visible sur la fiche projet et dans Documents > projet ; index Documents listant tous les projets avec le nombre de livrables et d'annexes.
- Création de projet : dépôt facultatif de documents annexes initiaux (classés dans la phase Initialisation).
- Console multilingue : français (par défaut), anglais, italien, espagnol et allemand (`src/lib/i18n/`) — navigation, en-tête, connexion, tableau de bord, projets, fiche projet, tâches, profil, paramètres, administration, notifications, e-mails.
- Sélecteur de langue dans le menu latéral (et sur les pages de connexion / invitation) : bascule immédiate, choix mémorisé (cookie + préférence du profil).
- Langue par projet (création et fiche projet) : tâches, modules, scénarios, quality gates et titres de documents HERMES traduits (`reference-data/hermes/i18n.json`).
- Invitations de personnes internes ou externes avec rôle, permissions, langue et message personnel ; page publique `/invitation/<jeton>` pour créer le compte ; renvoi, révocation, lien copiable si l'e-mail ne part pas.
- Nouveau rôle « Invité externe » (lecture seule par défaut).
- Envoi d'e-mails via Microsoft Graph (`Mail.Send`) : invitations, notifications (désactivables dans le profil) et e-mail de test depuis l'administration.
- Connexion « Se connecter avec Microsoft » (Entra ID, OIDC code + PKCE, validation du jeton par JWKS, iss, aud, nonce, expiration) ; la connexion locale reste disponible.
- Liaison des comptes Entra (oid, puis e-mail/UPN, puis invitation en attente) et attribution des rôles : rôle fixé par un admin > correspondance App Role / groupe Entra > rôle d'invitation > politique pour les inconnus (refus ou compte en attente d'approbation).
- Administration : panneau Entra (URI de redirection, politique, table des correspondances), badge « Entra » et option « rôle fixé manuellement », journal d'audit des connexions Entra et changements de rôle.
- Script `scripts/publish-to-gitlab.sh` (jeton `GITLAB_TOKEN` ou `~/.config/gitlab/personal_access_token`, option `--dry-run`, staging ciblé via `-- chemins`, exclusions des secrets et données runtime).
- Ce fichier `CHANGELOG.md`.

### Sécurité

- Identifiants Entra / Graph uniquement dans `.env.local` (non versionné) ; `.env.example` ne contient que des valeurs fictives.
- Documents annexes : téléchargement uniquement authentifié, `Content-Disposition: attachment`, `nosniff`, CSP sandbox ; noms de fichiers nettoyés et stockage sous noms générés (`uploads/annexes/<projet>/<document>/`), aucune traversée de chemin possible ; extensions autorisées en liste blanche ; dossier `uploads/` ignoré par Git.
- Jetons d'invitation stockés sous forme d'empreinte SHA-256, à usage unique, valables 7 jours (`PROJECTOR_INVITATION_TTL_DAYS`).

## 2026-07-20

### Ajouté

- Publication complète de l'application PROJECTOR HERMES5 pour déploiement : sources, documentation d'installation, `.env.example`, unité systemd `deploy/projector.service`, référentiel HERMES et modèles Word (sans secrets ni données runtime).
- Workflow de publication à la demande vers Gitea (`scripts/publish-to-gitea.sh`, règle Cursor associée).

### Modifié

- E-mail de l'administrateur initial rendu générique via la variable `PROJECTOR_ADMIN_EMAIL` (documentation).

## 2026-07-14

### Ajouté

- Squelette initial PROJECTOR HERMES5 (Next.js + TypeScript).
