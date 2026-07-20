# Cahier des charges — Plateforme de gestion de projets informatiques (méthode HERMES 5)

> **Document destiné à Cursor.** Il sert d'amorce (« project brief / PRD ») au développement assisté.
> Lis-le intégralement avant de générer du code. Construis l'application **par incréments** en
> suivant l'ordre de réalisation décrit en §16. Ne crée jamais de données fictives en base de
> production : utilise les jeux de données de *seed* prévus à cet effet.

- **Version du document :** 1.1 — 2026-06-27
- **Auteur / mandant :** Michel Aguilera (Aguilera Lab)
- **Méthodologie de référence :** **HERMES 5.1** (standard ouvert de la Confédération suisse, eCH-0054) — utiliser la **librairie de modèles la plus récente** disponible sur <https://www.hermes.admin.ch> · <https://www.bk.admin.ch/en/hermes-project-management-method>
- **Statut :** spécification consolidée (décisions d'arbitrage §18 intégrées).

---

## 1. Objectif et vision

Concevoir une application web (avec client lourd optionnel) de **pilotage de projets informatiques**
structurée autour de la méthode **HERMES 5**, permettant :

- la gestion d'un **portfolio** regroupant plusieurs projets ;
- le **partage de ressources** entre projets, avec recalcul dynamique des impacts lors des
  modifications de dates (au niveau projet **et** portfolio) ;
- des vues **Gantt** et **orientées tâches**, avec suivi d'avancement multi-représentation ;
- la **génération automatique des documents HERMES 5** à la validation de chaque phase ;
- l'intégration à l'écosystème **Microsoft 365** (Entra ID, Teams, Microsoft Graph, Copilot) tout
  en restant **auto-hébergeable** sur une VM Debian 13 ;
- l'invitation de **parties prenantes externes** au tenant Microsoft 365 ;
- une interface **bilingue (FR/EN)** et **responsive** (PC, smartphone, tablette iOS/Android).

### Principe directeur pour Cursor
La **fidélité à HERMES 5** (phases, jalons/quality gates, rôles, résultats, documents) est le cœur
métier. Modélise la méthode comme un **moteur configurable piloté par les données** (scénarios,
modules, tâches, activités, résultats, documents) plutôt qu'en la codant « en dur ». Cela permet
les évolutions de version (HERMES 5.1 / 2022) sans réécriture.

---

## 2. Glossaire HERMES 5 (vérifié sur hermes.admin.ch)

| Terme | Définition retenue |
|---|---|
| **Cycle de vie** | Début de projet → Développement de la solution → Fin de projet. |
| **Phases (approche classique)** | **Initialisation** → **Conception** → **Réalisation** → **Déploiement** → **Clôture**. (L'approche agile remplace Conception/Réalisation/Déploiement par une phase **Exécution** unique.) |
| **Jalon / Quality gate** | Point de décision en début et fin de chaque phase. Le **mandant libère** (release) les ressources de la phase suivante. Jalons typiques : *Mandat d'initialisation du projet, Libération de la phase, Décision sur l'option, Réception préliminaire, Réception, Mise en exploitation, Clôture du projet*. |
| **Module** | Regroupement réutilisable de tâches/résultats (ex. *Système informatique*, *Migration*, *Sécurité de l'information et protection des données (SIPD/ISDS)*, *Pilotage du projet*, *Bases du projet*). |
| **Tâche** | Unité de travail produisant un ou plusieurs **résultats**, composée d'**activités**. |
| **Résultat (outcome)** | Livrable produit (document ou produit). Ex. *Étude, Plan de gestion de projet, Charte de projet, Rapport de phase, Rapport d'état, Concept SIPD, Architecture du système, Rapport de réception, Évaluation finale du projet*. |
| **Rôle** | Responsabilité standardisée. Rôles **obligatoires** : **Mandant**, **Chef de projet**, **Représentant des utilisateurs**. Autres : *Comité de pilotage, Responsable qualité & risques, Comité spécialisé, Chef de sous-projet, Spécialistes, Support de projet*. |
| **Scénario** | Préconfiguration de la méthode adaptée à un type de projet (sélectionne les modules/résultats/documents pertinents). |
| **Organisation permanente** | Direction, Centre de compétences gestion de projet, Organes de prescription et de contrôle de gestion. |

> ⚠️ **Version cible figée : HERMES 5.1.** La liste exacte des scénarios, modules et résultats doit
> être importée depuis la **librairie officielle de modèles la plus récente** (FR/EN) téléchargeable
> sur hermes.admin.ch. Le moteur doit donc être **alimenté par un référentiel importable**, pas par
> des constantes en dur. Respecter les conditions d'utilisation du standard ouvert (attribution).
> *Note : HERMES 5.1 introduit l'approche agile (phase **Exécution**) en complément de l'approche
> classique. **Les deux approches sont dans le périmètre dès la v1** ; le moteur de phases doit donc
> gérer nativement le cycle **classique** (Conception/Réalisation/Déploiement) **et** le cycle
> **agile** (phase Exécution unique). Phases communes obligatoires dans les deux cas : **Initialisation**
> et **Clôture**.*

---

## 3. Périmètre fonctionnel (résumé)

```
Portfolio (n projets)
 ├─ Ressources partagées (personnes, groupes de compétences)
 ├─ Tableau de bord consolidé + heatmap de charge inter-projets
 └─ Projet (cycle HERMES 5)
     ├─ Scénario HERMES sélectionné → modules → tâches → activités → résultats
     ├─ Plan (Gantt + vue tâches) : dépendances, calendriers, chemin critique, baselines
     ├─ Affectations ressources (% allocation, avancement)
     ├─ Jalons / Quality gates → validation + signature mandant
     ├─ Génération documents HERMES (FR/EN) à chaque validation de phase
     ├─ Risques, problèmes, décisions, PV de comité de pilotage
     ├─ Notifications (in-app / e-mail SMTP ou Graph / Teams)
     ├─ Archivage (lecture seule) + Journal de projet
     └─ Sauvegarde / restauration granulaire (projet, portfolio)
```

---

## 4. Acteurs et rôles (personas)

| Persona | Origine | Besoins clés |
|---|---|---|
| **Administrateur de la plateforme** | Interne | Console d'admin : validation des inscriptions, préférences, permissions, accès projets, suppression/**remplacement** d'utilisateur (reprise automatique des tâches & permissions). |
| **Mandant (sponsor)** | Interne / décideur | Révision de phase, **acceptation et signature** du passage de phase (soumis par le chef de projet), conclusion finale du projet. |
| **Chef de projet** | Interne | Découpage HERMES, planification, affectations, suivi, **soumission** des demandes de validation au mandant, génération des documents. |
| **Membre de comité de décision / Comité de pilotage** | Interne / externe | Consultation, décisions, PV, validations. |
| **Spécialiste / corps de métier IT** | Interne / externe | Réalisation des tâches, mise à jour de l'avancement. |
| **Représentant des utilisateurs** | Interne / externe | Validation fonctionnelle, réception. |
| **Partie prenante externe invitée** | Externe au tenant | Accès restreint via invitation, authentification dédiée. |

> Le modèle de **groupes de ressources par compétences** (corps de métier IT, décisionnaires,
> mandant & membres de comité, etc.) doit être **paramétrable** : créer/éditer des groupes et y
> rattacher des personnes, avec une **matrice de compétences**.

---

## 5. Exigences fonctionnelles détaillées

### 5.1 Portfolio & projets
- **F-01** Créer/éditer/archiver des **portfolios** contenant 0..n projets.
- **F-02** Créer un **projet** en sélectionnant un **scénario HERMES** qui pré-instancie phases,
  modules, tâches, résultats et documents attendus.
- **F-03** Tableau de bord **portfolio** : statut consolidé (vert/jaune/rouge), échéances,
  jalons à venir, **heatmap de charge des ressources** partagées, dépendances inter-projets.
- **F-04** Tableau de bord **projet** : avancement global, jalon courant, risques, prochains livrables.

### 5.2 Ressources & groupes
- **F-05** Référentiel de **personnes** (internes Entra ID + externes invités).
- **F-06** **Groupes de ressources** par type de compétence ; **matrice de compétences** (niveau).
- **F-07** Ressources **partagées** entre projets d'un même portfolio.
- **F-08** **Calendriers de disponibilité** par ressource (jours ouvrés, congés, taux d'occupation).
- **F-09** **Détection de sur-allocation** et conflits, au niveau projet et portfolio.
- **F-10** **Coût/taux** par ressource alimentant le **suivi budgétaire** (voir §5.14) : comparaison
  planifié vs réel, en **heures** et/ou en montant.

### 5.3 Planification (Gantt + tâches)
- **F-11** **Vue Gantt** : tâches, jalons, dépendances (FD/DD/FF/DF), décalages (lag), calendriers.
- **F-12** **Vue orientée tâches** (liste/kanban/tableau filtrable et triable).
- **F-13** **Recalcul dynamique** : toute modification de date propage l'impact sur les tâches
  dépendantes, les ressources et le portfolio (moteur d'ordonnancement, **chemin critique**).
- **F-14** **Baselines** : capture du plan au moment de la libération d'une phase ; suivi des écarts
  (planifié vs réel : délai, charge, coût) — aligné sur le **Rapport d'état HERMES**.
- **F-15** Affectation d'**activités/tâches** aux ressources/groupes avec **% d'allocation**.

### 5.4 Suivi d'avancement (multi-vues)
- **F-16** Avancement d'une tâche en **pourcentage**.
- **F-17** Avancement par **agrégation des activités** (une tâche divisée en activités : avancement
  pondéré par l'avance de chaque activité).
- **F-18** Vues alternatives : par jalon, par phase, par ressource, par module HERMES.
- **F-19** (Suggéré) Capture des **réalisés** (charge consommée) pour alimenter F-14 et les rapports.

### 5.5 Méthode HERMES 5 (cœur métier)
- **F-20** **Référentiel importable** scénarios/modules/tâches/résultats/documents (FR+EN, versionné),
  basé sur la **librairie HERMES 5.1 la plus récente**.
- **F-21** Progression par **phases** avec **quality gates** ; verrouillage du passage de phase tant
  que les résultats requis ne sont pas produits/validés. Le moteur supporte **les deux approches
  HERMES 5.1 dès la v1** : **classique** (Initialisation → Conception → Réalisation → Déploiement →
  Clôture) **et** **agile** (Initialisation → Exécution → Clôture, avec **libérations intermédiaires**
  optionnelles comme jalons). Le **choix de l'approche** se fait lors de l'Initialisation (décision sur
  l'option) et conditionne les phases, modules et résultats instanciés.
- **F-22** **Génération automatique des documents HERMES** à la validation de phase, pré-remplis à
  partir des données du projet (voir §8). Langue du document = langue cible choisie.
- **F-23** **Workflow de validation de phase** : le **chef de projet soumet** → le **mandant
  valide/signe/confirme** → libération de la phase suivante (voir §9). La liste de contrôle du quality
  gate inclut, le cas échéant, la **validation du budget** (initial avant initialisation, ou révisé en
  cours de projet — voir §5.14, F-49/F-50).
- **F-24** **Registre des risques**, **journal des problèmes (issues)**, **journal des décisions**,
  **PV de comité de pilotage** (gabarit HERMES « Steering Committee Meeting »).

### 5.6 Identité, authentification, invitations
- **F-25** **Page de login initiale** avec formulaire d'authentification ; toute partie prenante
  passe par cette page pour rejoindre un projet/portfolio.
- **F-26** **SSO Entra ID** (OIDC/MSAL) pour les membres du tenant Microsoft 365.
- **F-27** **Invitation de parties prenantes externes** : toute personne **hors tenant** Microsoft 365
  (non enregistrée et sans licence) est traitée comme **invité (guest)** via la **création d'un compte
  local** (e-mail vérifié, MFA optionnel — voir §10). Le **message de validation d'enregistrement**
  envoyé à l'invité **recommande explicitement d'utiliser la version web** de l'application.
- **F-28** **Reconnaissance visuelle** des personnes via **Gravatar** (avec **upload d'avatar local**
  en alternative, pour la protection des données — voir §11).

### 5.7 Administration
- **F-29** Console d'admin : **valider les inscriptions**, gérer **préférences**, **permissions
  d'action**, **accès à un ou plusieurs projets** simultanément.
- **F-30** **Supprimer** un utilisateur.
- **F-31** **Remplacer** un utilisateur : reprise **automatique** de toutes ses tâches, affectations,
  rôles et permissions par le remplaçant (avec traçabilité et option de revue avant application).
- **F-32** Gestion des **rôles HERMES** ↔ **jeux de permissions** (RBAC, voir §7).

### 5.8 Notifications
- **F-33** À la **validation d'inscription** d'un membre et à toute **attribution** (tâche, rôle,
  jalon), envoyer des **notifications** aux personnes concernées.
- **F-34** Canaux : **in-app**, **e-mail** (SMTP **ou** Microsoft Graph pour les utilisateurs validés
  du tenant), et **Teams** (suggéré). Configuration du canal e-mail au niveau plateforme/projet.
- **F-35** Préférences de notification par utilisateur ; digest et escalade (suggéré).

### 5.9 Archivage & journal de projet
- **F-36** **Archiver** un projet terminé : **consultable mais non modifiable** (lecture seule,
  intégrité garantie par empreinte/hash).
- **F-37** À la clôture, **générer le Journal de projet** : descriptifs d'étapes, documents de
  validation de phase, décisions, signatures, et **conclusion validée par le mandant** (export PDF).

### 5.10 Sauvegarde / restauration
- **F-38** Solution **backup/restore** de toute l'application et de ses données.
- **F-39** **Granularité** : sauvegarde/restauration au niveau **portfolio** et **projet** (export
  logique : données + documents + journal d'audit), **et** sauvegarde physique complète de la base.
- **F-40** Restauration sûre : intégrité référentielle, gestion des conflits, remappage d'identifiants,
  chiffrement des sauvegardes, politique de rétention, **restauration testée**.

### 5.11 Internationalisation
- **F-41** Interface **FR/EN** commutable par utilisateur ; formats locaux (dates CH, nombres, CHF).
- **F-42** **Documents générés bilingues** : le gabarit utilisé suit la **langue cible**.
- **F-43** (Suggéré) Architecture i18n prête pour **DE/IT** (langues officielles suisses).

### 5.12 Intégrations Microsoft 365
- **F-44** **Application Teams** (onglet + bot) pour consulter/agir sur projets depuis Teams.
- **F-45** **Microsoft Graph** : envoi d'e-mails, notifications Teams, lecture profils/présence.
- **F-46** **Microsoft 365 Copilot** capable d'**analyser les données** de l'application et
  d'**interagir dans Teams** (voir §12 : connecteur Graph + agent/API plugin).

### 5.13 Responsive & multi-supports
- **F-47** Interface adaptative **PC / smartphone / tablette** (iOS, Android) ; **PWA** installable.

### 5.14 Budget & suivi financier
- **F-48** **Budget de projet** avec **provisionnement initial par forfait** : un **carnet d'heures
  établi au préalable** (nombre d'heures forfaitaires), convertible en montant via les taux ressources (F-10).
- **F-49** **Validation du budget global estimé par le mandant** : **avant l'initialisation** du projet,
  le montant estimé global doit être **accepté et validé par le mandant** (intégré au quality gate
  d'entrée — même mécanisme de confirmation que la signature de phase, §9).
- **F-50** **Révision du budget en cours de projet** : le budget peut être **modifié au fil de
  l'évolution** du projet. **Toute modification du budget devient un point à valider par le mandant
  avant le passage à la phase suivante** (ajoutée à la liste de contrôle du quality gate concerné).
- **F-51** **Suivi de consommation** : heures/coûts **planifiés vs réels** par phase, module et
  ressource (aligné sur les rubriques *Coûts* et *Charge (manpower)* du Rapport d'état HERMES) ;
  alertes de dépassement.
- **F-52** **Historique budgétaire** : conservation des versions du budget, de leurs montants, de
  l'auteur de la demande et de la validation du mandant (horodatées, auditées).

---

## 6. Exigence optionnelle — Client lourd
- **O-01** Application **desktop Windows/macOS** offrant les **mêmes fonctionnalités** que le web,
  se **connectant au serveur** pour **synchroniser** les informations des projets.
- **Recommandation Cursor :** **Tauri** (réutilise le frontend web, binaire léger, multiplateforme)
  plutôt qu'Electron. Synchronisation via la même API REST/GraphQL ; cache local + file d'attente
  hors-ligne en option (phase ultérieure).

---

## 7. Modèle de permissions (RBAC) — proposition

- **Rôles plateforme :** `SuperAdmin`, `Admin`, `Utilisateur`, `Invité externe`.
- **Rôles projet (HERMES) :** `Mandant`, `ChefDeProjet`, `ComitePilotage`, `ResponsableQualiteRisques`,
  `RepresentantUtilisateurs`, `ChefSousProjet`, `Specialiste`, `SupportProjet`, `Observateur`.
- **Permissions** = couples *(action, ressource)*, ex. `task.update`, `phase.submit`,
  `phase.sign`, `document.generate`, `project.archive`, `portfolio.manage`, `user.replace`.
- **Portée :** chaque attribution de rôle est **scoping** à un projet et/ou portfolio (un utilisateur
  peut avoir plusieurs accès simultanés — F-29).
- **Règles métier clés :** seul `ChefDeProjet` peut **soumettre** une validation de phase ; seul
  `Mandant` peut **signer/accepter** (F-23, §9).

---

## 8. Moteur de génération documentaire HERMES — exigences

1. **Référentiel de gabarits** FR/EN versionné (importé de la librairie HERMES), chaque gabarit
   décrit ses **champs/placeholders** et leur **mapping** vers le modèle de données.
2. **Moteur de fusion** : remplit le gabarit à partir des données projet (organisation, rôles,
   planning, jalons, risques, statut planifié/réel, etc.).
3. **Déclenchement** : à la **validation d'une phase**, génère les résultats/documents requis par le
   scénario pour cette phase (ex. *Initialisation* → Étude, Mandat d'initialisation ; *Conception* →
   Plan de gestion de projet, Architecture, Concept SIPD ; chaque fin de phase → **Rapport de phase**).
4. **Sorties** : stockage versionné + **export PDF** (et formats source éditables si pertinent).
5. **Langue** : la génération suit la **langue cible** (F-42) ; gabarits maintenus dans les 2 langues.
6. **Traçabilité** : chaque document généré porte version, locale, auteur, horodatage, jalon associé,
   et lien vers la **signature** d'acceptation le cas échéant.

> **Implémentation suggérée :** gabarits en **DOCX** (placeholders type `{{champ}}`) rendus via une
> librairie de templating DOCX, puis conversion **PDF** côté serveur (LibreOffice headless). Stocker
> les binaires dans l'object storage (§14), les métadonnées en base.

---

## 9. Validation et signature de phase — exigences

- **Flux :** `ChefDeProjet` prépare la fin de phase (résultats produits + éventuelle révision de
  budget) → **soumet** la demande de libération au `Mandant` → le `Mandant` **révise**, **signe** et
  **confirme** → la phase suivante est **libérée** ; refus = retour au chef de projet avec commentaires.
- **Signature — approche simple (retenue) :** un **champ de signature** (saisie du nom/signature du
  mandant) accompagné d'un **bouton « Phase confirmée »**. L'action enregistre : identité du
  signataire, **horodatage**, contenu du champ et **statut « confirmée »**, dans le **journal d'audit**.
- **Preuve de confirmation** conservée et exportée dans le **Journal de projet** (F-37).
- *Évolution possible (hors périmètre v1) :* remplacer le champ par une signature électronique
  renforcée/qualifiée (eIDAS/SCSE) ; concevoir la brique de signature comme un **adaptateur** isolé
  pour faciliter ce remplacement ultérieur.

---

## 10. Architecture d'identité — recommandation

| Population | Mécanisme |
|---|---|
| Membres du tenant M365 (enregistrés + licenciés) | **Entra ID** via **OIDC** (MSAL). |
| Parties prenantes externes (hors tenant) = **invités (guest)** | **Comptes locaux** (e-mail vérifié + mot de passe + **MFA optionnel**), validés par l'admin (F-29). Le **message de validation d'inscription recommande l'usage de la version web** (F-27). |

- Toute connexion passe par la **page de login** (F-25), qui propose « Se connecter avec Microsoft »
  **et** le formulaire local.
- **Décision retenue :** les externes sont gérés en **comptes locaux/guests** (et **non** en invités
  Entra External ID B2B). L'accès riche Teams/Copilot reste réservé aux membres du tenant.
- Gestion de sessions sécurisées (JWT courte durée + refresh, ou sessions serveur), CSRF, rotation.

---

## 11. Protection des données & conformité (à intégrer dès la conception)

- Contexte suisse + parties prenantes externes → respecter la **nLPD (FADP)** et, le cas échéant, le
  **RGPD**. L'auto-hébergement Debian facilite la **résidence des données**.
- **Gravatar :** transmet une empreinte de l'e-mail à un tiers → proposer l'**avatar local** par
  défaut ou un **consentement explicite** ; documenter ce traitement.
- Fonctions attendues : **consentement**, **droit d'accès/effacement**, **registre des traitements**,
  **journal d'audit**, minimisation des données. Relier au **Concept SIPD/ISDS** de HERMES.
- Chiffrement **au repos** (base, sauvegardes, object storage) et **en transit** (TLS).

---

## 12. Intégration Microsoft 365 Copilot & Teams — architecture cible

Trois briques **distinctes** à ne pas confondre :

1. **Connecteur Microsoft Graph (Graph connector)** : indexe les éléments portfolio/projet/tâches
   dans **Microsoft Search / Copilot** pour le **grounding** (Copilot « connaît » les données).
2. **Agent déclaratif / API plugin (OpenAPI)** : permet à Copilot d'**interroger en direct** et
   d'**agir** via l'API de l'application (actions, requêtes temps réel).
3. **Application Teams** (Teams Toolkit) : **onglet** (UI web embarquée) + **bot** pour notifications
   et commandes dans Teams.

> Pré-requis à signaler à l'utilisateur : **licences Microsoft 365 Copilot**, **permissions Graph**
> (consentement admin), enregistrement d'app **Entra ID** (client ID/secret/redirect URIs).
> L'API doit exposer un **contrat OpenAPI** propre — Cursor le générera et le maintiendra.

---

## 13. Exigences non fonctionnelles

- **Performance / montée en charge :** base **PostgreSQL** (gratuite, open-source, scalable :
  partitionnement, réplicas en lecture). File de jobs asynchrones pour générations/notifications/backups.
- **Disponibilité & exploitation :** conteneurisation **Docker Compose**, reverse-proxy **Caddy/nginx**
  + **TLS**, **healthchecks**, journaux centralisés, métriques (Prometheus/Grafana en option).
- **Sécurité :** OWASP ASVS, MFA, rate-limiting, gestion des secrets, scan de dépendances, RBAC strict.
- **Accessibilité :** viser **WCAG 2.1 AA** (pertinent en contexte administratif suisse).
- **Compatibilité :** navigateurs récents ; **PWA** ; responsive PC/tablette/smartphone.
- **Observabilité & audit :** **journal d'audit inviolable** (qui a validé/signé/modifié quoi, quand).
- **Internationalisation :** i18n complet (UI + documents), prêt pour DE/IT.

---

## 14. Pile technique recommandée (à confirmer avec Cursor)

| Couche | Choix recommandé | Justification |
|---|---|---|
| Langage | **TypeScript** (monorepo) | Écosystème commun front/back, intégrations M365/Teams matures en TS. |
| Backend | **NestJS** (REST + OpenAPI) | Structuré, modulaire, adapté au RBAC et aux jobs. |
| ORM | **Prisma** | Schéma typé, migrations, lisible par Cursor. |
| Base de données | **PostgreSQL** | Gratuit, open-source, **montée en charge** (F demandée). |
| Frontend | **React + Next.js** | SSR/SEO, PWA, responsive. |
| UI | **Tailwind + bibliothèque de composants** accessible | Responsive + WCAG. |
| Gantt | Évaluer **frappe-gantt**, **SVAR Gantt**, **vis-timeline** (open-source) | Éviter les libs sous licence commerciale en v1. |
| File de jobs / cache | **Redis + BullMQ** | Notifications, génération docs, sauvegardes planifiées. |
| Stockage fichiers | **MinIO** (S3-compatible, open-source) | Documents/avatars/sauvegardes chiffrés. |
| Docs → PDF | Templating DOCX + **LibreOffice headless** | Génération HERMES bilingue + PDF. |
| Auth | **MSAL** (Entra) + comptes locaux (Passport/Auth maison) | §10. |
| Desktop (option) | **Tauri** | Réutilise le front web, léger, Win/macOS. |
| Déploiement | **Docker Compose** sur **Debian 13** | Auto-hébergement demandé. |

> Ces choix sont des **recommandations argumentées** ; Cursor peut proposer des alternatives
> équivalentes mais doit conserver : **PostgreSQL**, **open-source**, **auto-hébergeable Debian 13**,
> **intégrations M365**.

---

## 15. Modèle de données (entités principales — à raffiner)

`Portfolio`, `Project`, `HermesScenario`, `Phase`, `Milestone`, `Module`, `Task`, `Activity`,
`Result/Deliverable`, `DocumentTemplate`, `GeneratedDocument`, `Person/User`, `ResourceGroup`,
`Skill`, `Assignment` (personne↔tâche, %), `Allocation`/`Availability`, `RoleAssignment` (rôle HERMES
scoping projet/portfolio), `Permission`, `Risk`, `Issue`, `Decision`, `SteeringMeeting`,
`Baseline`, `Notification`, `Signature`, `AuditLog`, `Backup`, `ArchiveRecord`, `ProjectJournal`,
`Budget`, `BudgetRevision`, `BudgetApproval` (validation mandant), `CostEntry`/`TimeEntry`.

Relations clés : `Portfolio 1—n Project` ; `Project 1—n Phase 1—n Module 1—n Task 1—n Activity` ;
`Task n—n Person via Assignment` ; ressources **partagées** = `Person n—n Project` ;
`Phase 1—n Milestone` ; `Phase 1—n GeneratedDocument` ; `Milestone 1—1 Signature` (acceptation).

---

## 16. Ordre de réalisation conseillé pour Cursor (incrémental)

> Construis **étape par étape**, avec tests à chaque jalon. Ne passe à l'étape suivante qu'une fois
> les **critères d'acceptation** (§17) de l'étape courante satisfaits.

1. **Socle** : monorepo, Docker Compose (Postgres, Redis, MinIO), CI, lint/test, schéma Prisma initial.
2. **Identité & RBAC** : page de login, Entra OIDC + comptes locaux, validation admin, rôles/permissions.
3. **Portfolios & projets** : CRUD, sélection de **scénario HERMES**, instanciation phases/modules/tâches.
4. **Ressources & groupes** : personnes, groupes de compétences, matrice, disponibilités, partage.
5. **Planification** : modèle tâches/dépendances/calendriers ; **recalcul dynamique** + chemin critique.
6. **Vues** : **Gantt** + **vue tâches** ; avancement % et par agrégation d'activités ; baselines.
7. **Moteur HERMES** : référentiel importable (5.1), **approches classique ET agile** (phase Exécution
   + libérations intermédiaires), quality gates, **workflow validation + signature simple** ; **budget**
   (provisionnement forfait/carnet d'heures, validation mandant avant initialisation, révision validée
   avant changement de phase — §5.14).
8. **Génération documentaire** : gabarits FR/EN, fusion, export PDF, versionnement.
9. **Notifications** : in-app, e-mail (SMTP **et** Graph), préférences ; (Teams ensuite).
10. **Admin avancée** : suppression/**remplacement** d'utilisateur avec reprise des tâches/permissions.
11. **Archivage & Journal de projet** : lecture seule + intégrité ; génération du journal.
12. **Sauvegarde/restauration** : exports granulaires portfolio/projet + dump complet + restauration testée.
13. **Intégrations M365** : app Teams (onglet+bot), **Graph connector**, **API plugin Copilot**.
14. **i18n complet** + responsive/PWA finitions + accessibilité.
15. **Option** : client **Tauri** avec synchronisation.

---

## 17. Critères d'acceptation (exemples vérifiables)

- Modifier la date d'une tâche **décale automatiquement** les tâches dépendantes et **met à jour** la
  charge des ressources concernées dans le projet **et** le portfolio.
- À la **validation d'une phase**, les **documents HERMES requis** sont **générés** dans la **langue
  choisie**, versionnés et exportables en PDF.
- Le **chef de projet** peut **soumettre** une fin de phase ; **seul le mandant** peut **signer** via
  le **champ de signature + bouton « Phase confirmée »** ; l'action est **horodatée** et **auditée**.
- **Avant l'initialisation**, le projet ne démarre qu'après **validation du budget global estimé par
  le mandant** ; toute **révision de budget** ultérieure **bloque le passage de phase** tant qu'elle
  n'est pas validée par le mandant.
- **Remplacer** un utilisateur transfère **automatiquement** ses tâches, affectations, rôles et
  permissions au remplaçant.
- Un projet **archivé** est **consultable** mais **toute écriture est refusée**.
- Une **restauration** au niveau **projet** restitue données + documents + journal sans casser
  l'intégrité référentielle des autres projets.
- À l'Initialisation, choisir l'approche **classique** ou **agile** instancie le **bon jeu de phases**
  (Conception/Réalisation/Déploiement vs Exécution) et les résultats/documents correspondants.
- L'UI bascule **FR/EN** sans rechargement et s'affiche correctement sur **mobile/tablette/PC**.

---

## 18. Analyse critique & améliorations proposées (synthèse)

Au-delà des attentes initiales, sont **ajoutés/renforcés** :

1. **Scénarios HERMES & adaptation** : instancier le projet selon un scénario (au lieu d'un cycle figé).
2. **Référentiel HERMES importable & versionné** (FR/EN) plutôt que codé en dur → évolutivité.
3. **Approches classique ET agile HERMES 5.1** (phase Exécution + libérations intermédiaires)
   gérées nativement par le moteur de phases dès la v1.
4. **Moteur d'ordonnancement** : dépendances, calendriers ouvrés, **chemin critique**, **baselines**,
   écarts planifié/réel (aligné sur le Rapport d'état HERMES).
5. **Capture des réalisés** (charge consommée) pour fiabiliser l'avancement et les rapports.
6. **RBAC formel** rôles HERMES ↔ permissions, scoping projet/portfolio.
7. **Moteur de remplacement d'utilisateur** robuste (reprise + revue + audit).
8. **Signature de phase simple** : champ de signature + bouton « Phase confirmée » (audité) ;
   adaptateur prévu pour une éventuelle QES future.
9. **Journal d'audit inviolable** transverse (gouvernance, valeur probante).
10. **Conformité nLPD/RGPD** + arbitrage **Gravatar vs avatar local** (protection des données).
11. **Notifications multi-canaux** (in-app / e-mail SMTP|Graph / Teams) + préférences/escalade.
12. **Sauvegarde** : granulaire **logique** (portfolio/projet) **et** physique (PITR/WAL), chiffrée, testée.
13. **Archivage immuable** (hash d'intégrité, lecture seule réelle).
14. **Copilot/Teams** clarifié en 3 briques (Graph connector + API plugin + app Teams) avec pré-requis.
15. **Accessibilité WCAG 2.1 AA** et **extension DE/IT** (contexte suisse).
16. **Gestion des risques/problèmes/décisions/PV** (rôles & gabarits HERMES existants).
17. **Suivi budgétaire intégré** : budget par forfait/carnet d'heures, validation du montant global par
    le mandant avant initialisation, révisions soumises à validation avant changement de phase, suivi
    planifié vs réel.
18. **Desktop Tauri** plutôt qu'Electron pour l'option client lourd.

### Arbitrages — décisions prises (intégrées à cette v1.1)
- **Externes :** ✅ **comptes locaux / guests** (pas d'Entra External ID B2B) ; message d'inscription
  recommandant la **version web**. *(F-27, §10)*
- **Version HERMES :** ✅ **HERMES 5.1**, **librairie la plus récente**. *(en-tête, §2, F-20)*
- **Signature :** ✅ **approche simple** — champ de signature + bouton « Phase confirmée ». *(§9)*
- **Budget/coûts :** ✅ **dans le périmètre** — forfait/carnet d'heures, validation mandant avant
  initialisation, révisions validées avant changement de phase. *(§5.14)*

- **Approche de développement :** ✅ **classique + agile** (phase Exécution de HERMES 5.1) **dès la
  v1**. Le choix de l'approche se fait à l'Initialisation (décision sur l'option). *(§2, F-21, §16)*

---

## 19. Consignes spécifiques à Cursor

- Crée un fichier **`AGENTS.md` / `.cursor/rules`** reprenant : pile technique imposée, conventions de
  code, structure du monorepo, et la règle « **le moteur HERMES est piloté par les données** ».
- **Génère et maintiens un contrat OpenAPI** pour toute l'API (réutilisé par l'app Teams et le plugin Copilot).
- Écris des **tests** à chaque module ; fournis des **seeds** réalistes (jamais en prod).
- Respecte l'ordre de réalisation (§16) et coche les **critères d'acceptation** (§17) avant d'avancer.
- Garde l'application **auto-hébergeable Debian 13 / Docker** et **100 % open-source** côté socle.
- Ne **fabrique pas** le contenu officiel HERMES : importe la **librairie de modèles** ; insère des
  **espaces réservés** `[à compléter]` là où une donnée manque.

---

*Fin du cahier des charges v1.0 — à enrichir au fil des arbitrages (§18).*
