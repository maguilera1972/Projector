# Journal des modifications

Toutes les modifications notables de PROJECTOR sont consignées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) :
une section par date (`## AAAA-MM-JJ`), puis les rubriques
**Ajouté**, **Modifié**, **Corrigé**, **Supprimé**, **Sécurité** selon les besoins.

Les nouvelles entrées s'ajoutent **en haut**, juste sous ce paragraphe.

## 2026-11-02

### Ajouté (Azure Bot)

- Ressource Azure Bot `projector-bot` créée dans le groupe de ressources `MAITLAB` (abonnement « Microsoft Partner Network », F0, mono-locataire) avec le canal Microsoft Teams activé ; état consigné dans le document de conception.
- Scripts de création de la ressource Azure Bot (`scripts/azure/create-azure-bot.mjs` sans Azure CLI, connexion par code d'appareil ; `scripts/azure/create-azure-bot.sh` avec Azure CLI) : groupe de ressources, bot F0 mono-locataire sur l'inscription existante, point de terminaison `https://projector.aguilera.ch/api/teams/messages`, canal Microsoft Teams ; idempotents.
- Administration : état réel du bot (date du dernier événement reçu de Teams, ou avertissement si aucun), en 5 langues.
- Paquet Teams complet (avec bot) en version 1.1.0, à importer une fois l'Azure Bot créé.
- Création de l'Azure Bot en mode principal de service (`node scripts/azure/create-azure-bot.mjs --sp`, sans interaction, la connexion par code d'appareil étant bloquée par l'accès conditionnel) ; cible par défaut : abonnement « Microsoft Partner Network », groupe de ressources existant `MAITLAB` (non recréé) ; messages explicites si le rôle Contributeur ou l'inscription du fournisseur `Microsoft.BotService` manque.

### Ajouté

- Installation automatique de l'application Teams PROJECTOR pour chaque utilisateur lié à Entra avant l'envoi d'une notification (`TeamsAppInstallation.ReadWriteSelfForUser.All`), avec mise en cache de l'état d'installation et nouvel essai unique de la notification.
- Administration : action « Installer l'app pour tous les utilisateurs Entra » avec bilan (installées, déjà installées, échecs avec motif), en 5 langues.
- Paquet Teams « sans bot » (`scripts/teams/build-teams-app.sh --without-bot` → `projector-teams-sans-bot.zip`, version 1.0.1) à utiliser tant que la ressource Azure Bot n'existe pas.

### Corrigé (Teams)

- `scripts/teams/build-teams-app.sh` : sans l'option `--without-bot`, le script s'arrêtait avant de créer l'archive (substitution évaluée en échec sous `set -e`), laissant un ancien paquet 1.0.0 ; le paquet complet 1.1.0 est désormais bien généré.
- Diagnostic des échecs Teams : l'erreur Graph `CreateThreadS2SRequest` (conversation du bot impossible à créer faute de ressource Azure Bot), l'absence de licence Teams et l'application non installée sont identifiées et expliquées, au lieu d'un message Graph brut.
- « Détecter depuis mon installation » : repli sur le catalogue de l'organisation (si `AppCatalog.Read.All` est accordée) et message explicite si l'application est introuvable ; l'ID de catalogue déjà enregistré est conservé.

### Corrigé

- Équipe : impossible de supprimer un groupe de compétences (« Groupe introuvable. » et groupe toujours affiché). Next.js embarque le store dans plusieurs bundles (pages, routes API), chacun avec son propre cache mémoire de la base : la page affichait une copie périmée. Le cache et le verrou d'écriture sont désormais partagés dans tout le processus et rechargés si le fichier change sur disque ; une base illisible n'est plus remplacée par une base vide.
- Suppression d'un groupe idempotente (un groupe déjà supprimé est traité comme un succès), avec nettoyage des niveaux de compétence associés ; masquage immédiat dans l'interface, resynchronisation après rafraîchissement, page Équipe rendue dynamiquement et erreurs de suppression de compétence affichées (messages traduits en 5 langues).

- Administration Microsoft Teams & Copilot : faux « Permissions manquantes » après un consentement administrateur — le jeton d'application Graph mis en cache (jusqu'à une heure) n'était jamais renouvelé, même avec « Revérifier ». Le jeton est désormais réutilisé 10 minutes au plus, renouvelé automatiquement si une permission semble absente, et « Revérifier les permissions » en demande toujours un nouveau.
- Message générique « Une erreur est survenue. » dans l'administration : Cloudflare remplaçait le corps des réponses HTTP 502 (échecs Graph) par du texte brut. Les routes d'intégration renvoient maintenant 424 (échec Graph) ou 409 (fonctionnalité indisponible), et l'interface affiche le statut HTTP et le message réel de l'erreur.

### Modifié

- Contrôle des capacités : les permissions équivalentes ou plus larges sont acceptées (par ex. `TeamsTab.ReadWriteForTeam.All`, `TeamsAppInstallation.ReadWriteSelfForTeam.All`, `Sites.ReadWrite.All`, `Group.ReadWrite.All`), et les capacités sont confirmées par des appels Graph réels en lecture seule (équipes, applications d'équipe, calendrier de l'organisateur, connexion du connecteur).
- Panneau d'administration : liste repliable des permissions présentes dans le jeton, date d'émission, d'expiration et de lecture du jeton, permission qui satisfait chaque exigence et résultat des appels de contrôle (5 langues).

## 2026-10-27

### Ajouté

- **Microsoft Teams & Copilot** — document de conception et de mise en place `docs/integration-teams-copilot.md` (architecture, diagrammes de séquence, modèle de données, permissions accordées / à ajouter, sécurité, procédure d'administration, plan de tests, limites, déploiement progressif).
- Notifications PROJECTOR dans le **flux d'activité Teams** (`TeamsActivity.Send`) pour les mêmes événements que les e-mails, avec lien profond vers l'onglet PROJECTOR ; installation automatique de l'app personnelle si l'ID de catalogue est connu ; nouveaux événements « tâche en retard » (contrôle quotidien) et « rapport disponible ».
- Profil : choix du canal de notification (e-mail, Teams, les deux, aucun).
- **Réunions Teams** depuis la fiche projet : séance de quality gate (décideurs présélectionnés, ordre du jour, lien vers le dossier de phase) ou point de situation récurrent, créées dans le calendrier de l'organisateur ; lien « Rejoindre », annulation, invitation à consigner la décision et le PV après la séance.
- **Espace Teams par projet** (option à la création et bouton sur la fiche) : équipe dédiée avec un canal par phase HERMES ou canal(aux) dans une équipe existante, aperçu (simulation), synchronisation des membres (comptes Entra internes ; invités et comptes non liés signalés), onglets PROJECTOR et synchronisation SharePoint conditionnés aux permissions `TeamsTab.Create` / `Sites.Selected`.
- **Bot PROJECTOR** (`/api/teams/messages`, protocole Bot Framework sans SDK) : commandes multilingues (« mes tâches », « état <projet> », « décisions en attente », « aide »), cartes adaptatives 1.5 pour approuver / refuser les quality gates et révisions budgétaires, terminer ou commenter une tâche (droits PROJECTOR appliqués via l'objet Entra), messages proactifs dans les canaux projet (changement de phase, météo au rouge, synthèse hebdomadaire), extension de messagerie (recherche projets / tâches / documents) et aperçu des liens projector.aguilera.ch.
- **Copilot** : connecteur Microsoft Graph `projectorprojects` (projets, statut, décisions, budgets, rapports, ACL calquées sur la visibilité PROJECTOR, synchronisation incrémentale) et API `/api/copilot/*` (jetons Entra `access_as_user` ou rôles d'application `Projector.Read.All`) décrite en OpenAPI, avec agent déclaratif et plugin API sous `teams-app/copilot/` ; documentation `docs/api-copilot.md` (usage par d'autres agents IA).
- Application Teams (`teams-app/manifest.json` v1.19, onglet personnel « Mes tâches », onglet configurable par projet avec SSO Teams, bot, extension de messagerie), icônes générées depuis le logo et script `scripts/teams/build-teams-app.sh` → `dist/teams-app/projector-teams.zip`.
- Administration : section « Microsoft Teams & Copilot » (permissions présentes dans le jeton d'application, bot, app Teams, connecteur), activation par fonctionnalité, tests (notification Teams, réunion de test créée puis supprimée, tâches planifiées, connecteur).
- Tâches planifiées (`/api/integrations/jobs/run` protégé par `PROJECTOR_CRON_SECRET`, timer systemd `deploy/projector-integrations.timer` ou intervalle `PROJECTOR_JOBS_INTERVAL_MIN`).

- **Rapports** : nouveau module dans la section Rapports avec cinq rapports au visuel PROJECTOR — avancement projet (phases, tâches, jalons, écarts au baseline, météo vert/orange/rouge), budget (initial, révisé, demandé, historique des révisions, valeur acquise estimée, alertes), décisions & quality gates (journal des validations, décisions en attente, PV à signer), portefeuille (santé, budget agrégé, retards, prochaines décisions) et ressources & charge (charge et retards par personne). Filtres par projet, portfolio ou ensemble des projets, période et langue du rapport (FR, EN, IT, ES, DE) ; aperçu à l'écran avec graphiques. Export PDF (logo, en-tête, pagination, accents) et envoi par e-mail via Microsoft Graph aux personnes assignées (présélectionnées, ajout ou retrait possible, message personnel, langue de chaque destinataire), PDF en pièce jointe ou lien sécurisé au-delà de 3 Mo ; envois tracés dans le journal d'audit. Accès réservé à la permission « Rapports » ; les invités externes ne voient que leurs projets.
- **E-mails aux couleurs de PROJECTOR** — Tous les e-mails (invitations, notifications, e-mail de test, envoi de rapports) utilisent désormais un gabarit unique reprenant le visuel du site : bandeau navy avec logo, liseré dégradé, bouton d'action, tableau récapitulatif (projet, phase, montant…), pied de page avec lien vers le portail et les préférences de notification ; responsive, mode sombre, compatible Outlook ; textes en FR/EN/IT/ES/DE et contenu utilisateur échappé. Aperçu admin via `/api/admin/email-preview` et script `scripts/render-email-previews.mjs`.
- Envoi d'e-mails configuré en production avec l'expéditeur `michel@aguilera.ch` (Microsoft Graph, `Mail.Send` ; paramètres uniquement dans `.env.local`).
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

### Modifié

- Dépôt principal migré vers GitLab : `https://gitlab.aguilera.ch/Aguilera_Lab/Projector` (remote `origin`). Gitea reste disponible comme remote secondaire `gitea` (miroir facultatif).
- Règle Cursor `publish-gitlab.mdc` : après toute modification demandée, mise à jour du changelog, commit et push vers GitLab par défaut (sauf « sans publier », « ne pousse pas », « local only »).
- README et unité systemd (`Documentation=`) pointent vers GitLab.
- Session : l'utilisateur est relu en base à chaque requête — un changement de rôle, de permissions ou une suspension s'applique immédiatement, sans reconnexion.
- Notifications stockées avec des paramètres et traduites à l'affichage dans la langue du destinataire (les anciennes restent en français).
- Documents HERMES générés et Word : libellés (scénario, phase, approche, statuts, titres) dans la langue du projet ; corps de modèles en anglais pour l'italien, l'espagnol et l'allemand.

### Sécurité

- Validation des jetons Bot Framework (métadonnées OpenID, émetteur, audience, endorsements, serviceUrl) et liste blanche des serviceUrl ; validation des jetons Entra de l'API Copilot et du SSO Teams (JWKS, émetteur, audience, locataire, scope / rôles).
- En-tête `Content-Security-Policy: frame-ancestors` limitant l'affichage de PROJECTOR en cadre à Microsoft Teams / Microsoft 365.
- Protection CSRF : les mutations d'API portant le cookie de session et marquées `Sec-Fetch-Site: cross-site`/`same-site` sont refusées (cookie de l'onglet Teams en `SameSite=None`).
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
