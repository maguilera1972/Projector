# AGENTS.md — Règles d'architecture & conventions de code

> Fichier de pilotage pour les agents de code (Cursor, etc.). **À placer à la racine du dépôt.**
> Il accompagne le cahier des charges `cahier-des-charges-gestion-projets-hermes5.md` (la **source de
> vérité fonctionnelle**). En cas de doute fonctionnel, se référer au cahier des charges ; ce fichier
> fixe le **comment** (technique, conventions, garde-fous).
>
> *Compatibilité Cursor :* ce fichier peut être complété par des règles `.cursor/rules/*.mdc`
> (une règle par domaine). Garder AGENTS.md comme référence faîtière.

---

## 0. Règles d'or (NON négociables)

1. **HERMES 5.1 piloté par les données.** Phases, scénarios, modules, tâches, résultats, documents
   proviennent d'un **référentiel importable et versionné** — **jamais** codés en dur.
2. **Deux approches dès le départ :** **classique** (Conception→Réalisation→Déploiement) **et**
   **agile** (phase Exécution). Phases communes obligatoires : **Initialisation** et **Clôture**.
3. **100 % open-source & auto-hébergeable** sur **Debian 13 / Docker Compose**. Aucune dépendance
   propriétaire payante dans le socle (vérifier les licences, surtout pour le composant **Gantt**).
4. **PostgreSQL** comme base unique. Pas d'autre SGBD.
5. **Sécurité & audit d'abord :** RBAC à portée projet/portfolio, **journal d'audit inviolable**,
   chiffrement au repos et en transit. Voir §6.
6. **Ne jamais fabriquer de contenu HERMES officiel** ni de données métier : importer la librairie de
   modèles ; pour toute donnée manquante, insérer un **espace réservé** `[à compléter]`.
7. **Pas de données fictives en base de prod.** Les jeux d'essai vivent dans les **seeds** dédiés.
8. **Construire par incréments** en suivant l'**ordre de réalisation (§16 du cahier)** et en validant
   les **critères d'acceptation (§17)** avant d'avancer.
9. **Bilingue FR/EN** de bout en bout (UI **et** documents générés). Aucune chaîne en dur dans l'UI.
10. **Contrat API d'abord :** toute API expose un **OpenAPI** maintenu, réutilisé par l'app Teams et le
    plugin Copilot.

---

## 1. Pile technique imposée

| Couche | Choix | Remarque |
|---|---|---|
| Langage | **TypeScript** (strict) | `strict: true`, pas de `any` implicite. |
| Monorepo | **pnpm workspaces** + **Turborepo** | Cache de build, tâches partagées. |
| Backend | **NestJS** (REST + OpenAPI/Swagger) | Modulaire, DI, guards RBAC. |
| ORM | **Prisma** | Schéma typé + migrations versionnées. |
| Base de données | **PostgreSQL** | Partitionnement/réplicas pour la montée en charge. |
| Frontend | **React + Next.js** (App Router) | SSR, **PWA**, responsive. |
| UI / styles | **Tailwind CSS** + composants **accessibles** (Radix/Headless) | Cible **WCAG 2.1 AA**. |
| État serveur | **TanStack Query** | Cache, invalidation, optimistic updates. |
| Gantt | **open-source uniquement** (évaluer frappe-gantt / SVAR Gantt / vis-timeline) | **Pas** de lib sous licence commerciale en v1. |
| Jobs/queue/cache | **Redis + BullMQ** | Docs, notifications, sauvegardes, recalculs. |
| Object storage | **MinIO** (S3-compatible) | Documents, avatars, sauvegardes (chiffrés). |
| Docs → PDF | Templating **DOCX** + **LibreOffice headless** | Génération HERMES bilingue. |
| Auth tenant | **MSAL / OIDC (Entra ID)** | Membres licenciés du tenant. |
| Auth externes | **Comptes locaux (guests)** | E-mail vérifié + MFA optionnel. |
| Desktop (option) | **Tauri** | Réutilise le front web ; sync via API. |
| Conteneurs | **Docker Compose** | Postgres, Redis, MinIO, API, web, reverse-proxy. |
| Reverse-proxy/TLS | **Caddy** (ou nginx) | TLS automatique. |
| Tests | **Vitest/Jest** (unit), **Supertest** (API), **Playwright** (E2E) | CI obligatoire. |
| Qualité | **ESLint + Prettier**, **commitlint** | Conventionnel (voir §7). |

> Toute alternative équivalente proposée par l'agent doit **préserver** : TypeScript, PostgreSQL,
> open-source, auto-hébergeable Debian 13, intégrations M365.

---

## 2. Structure du monorepo (cible)

```
/
├─ AGENTS.md
├─ cahier-des-charges-gestion-projets-hermes5.md
├─ docker-compose.yml
├─ .cursor/rules/                 # règles MDC optionnelles, une par domaine
├─ packages/
│  ├─ shared/                     # types partagés, schémas Zod, i18n keys, utils
│  ├─ hermes-engine/              # moteur HERMES (data-driven) : phases, gates, scénarios
│  └─ scheduler/                  # ordonnancement : dépendances, calendriers, chemin critique
├─ apps/
│  ├─ api/                        # NestJS (REST + OpenAPI), Prisma, RBAC, jobs
│  ├─ web/                        # Next.js (PWA, FR/EN, responsive)
│  ├─ teams/                      # app Teams (onglet + bot, Teams Toolkit)
│  └─ desktop/                    # Tauri (option) — réutilise apps/web
├─ prisma/                        # schema.prisma + migrations + seeds
├─ reference-data/hermes/         # librairie HERMES 5.1 importable (FR/EN, versionnée)
└─ infra/                         # scripts déploiement Debian, backup/restore, CI
```

**Règles de dépendances :** `apps/*` dépend de `packages/*`, jamais l'inverse. La logique métier
HERMES vit dans `packages/hermes-engine` (testable hors HTTP). `apps/web` ne contient pas de logique
métier dupliquée — il consomme l'API.

---

## 3. Conventions de code

- **TypeScript strict** ; pas de `any` (préférer `unknown` + validation). Types partagés dans
  `packages/shared`.
- **Validation des entrées** avec **Zod** (frontière API + formulaires). Ne jamais faire confiance au client.
- **Nommage :** `camelCase` (variables/fonctions), `PascalCase` (types/classes/composants),
  `kebab-case` (fichiers), `SCREAMING_SNAKE_CASE` (constantes d'environnement).
- **Domaine en anglais dans le code** (entités, champs, API) ; **textes utilisateur via i18n** (FR/EN).
- **Fonctions courtes, pures quand possible** ; effets de bord isolés (services/repositories).
- **Erreurs :** types d'erreur explicites + codes ; pas de `throw` de chaînes nues. Mapper vers des
  réponses HTTP normalisées (problem+json).
- **Commentaires** utiles (le *pourquoi*), pas de bruit. Respecter le style existant.
- **Pas de secrets dans le code** ni dans le dépôt : variables d'environnement + `.env.example`.

---

## 4. Architecture métier — règles spécifiques

### 4.1 Moteur HERMES (`packages/hermes-engine`)
- Représenter scénario → phases → modules → tâches → activités → résultats → documents comme des
  **données** chargées depuis `reference-data/hermes/` (version **5.1**, FR/EN).
- Un **quality gate** verrouille le passage de phase tant que : résultats requis produits/validés,
  **budget validé** si applicable, et **confirmation du mandant** obtenue.
- Le **choix d'approche** (classique/agile) à l'Initialisation conditionne les phases instanciées.
  Agile = **Initialisation → Exécution → Clôture** avec **libérations intermédiaires** optionnelles.

### 4.2 Ordonnancement (`packages/scheduler`)
- Dépendances (FD/DD/FF/DF) + décalages, **calendriers ouvrés** par ressource, **chemin critique**.
- **Recalcul dynamique** : une modification de date propage l'impact aux tâches dépendantes, aux
  ressources et au **portfolio** (recalcul asynchrone via BullMQ pour les gros plans).
- **Baselines** capturées à chaque libération de phase ; calcul des écarts planifié/réel.

### 4.3 RBAC
- Rôles plateforme (`SuperAdmin`/`Admin`/`Utilisateur`/`InviteExterne`) + rôles HERMES par projet.
- Permissions = `(action, ressource)`, **scoping** projet/portfolio. Guards NestJS + vérifs côté UI.
- **Seul `ChefDeProjet`** soumet une fin de phase ; **seul `Mandant`** confirme/signe.

### 4.4 Identités & invités
- Tenant → **Entra OIDC**. Externes → **comptes locaux/guests** validés par l'admin ; le **message de
  validation d'inscription recommande la version web**.

### 4.5 Signature de phase (simple)
- **Champ de signature** + bouton **« Phase confirmée »**. Enregistrer identité, horodatage, contenu,
  statut, dans le **journal d'audit**. Isoler en **adaptateur** (évolution QES future possible).

### 4.6 Budget
- Provisionnement initial par **forfait / carnet d'heures**. **Validation du montant global par le
  mandant avant l'Initialisation**. Toute **révision** = **point bloquant** validé par le mandant
  **avant changement de phase**. Suivi **planifié vs réel** (heures/coûts). Historique versionné/audité.

### 4.7 Génération documentaire
- Gabarits DOCX FR/EN avec placeholders mappés au modèle de données ; fusion → stockage versionné →
  export **PDF**. La langue du document suit la **langue cible**.

### 4.8 Archivage & journal
- Projet archivé = **lecture seule réelle** (toute écriture refusée) + **empreinte d'intégrité**.
- **Journal de projet** auto-compilé à la clôture (étapes, validations, décisions, signatures,
  conclusion du mandant) → export PDF.

### 4.9 Sauvegarde / restauration
- **Logique granulaire** (portfolio/projet : données + documents + audit) **et** **physique** complète
  (pg_dump / PITR via WAL). Sauvegardes **chiffrées**, rétention définie, **restauration testée**.

### 4.10 Intégrations M365
- **Graph connector** (grounding Copilot), **API plugin/agent déclaratif** (actions temps réel via
  OpenAPI), **app Teams** (onglet + bot). Garder ces briques **séparées et activables**.

---

## 5. Internationalisation (i18n)
- Bibliothèque i18n (ex. `next-intl` / `i18next`). **Aucune** chaîne UI en dur.
- Clés structurées par domaine ; FR et EN maintenues en parallèle. Formats locaux (dates CH, CHF).
- Architecture prête à ajouter **DE/IT** sans refonte.

---

## 6. Sécurité (OWASP ASVS comme référence)
- TLS partout ; chiffrement **au repos** (DB, MinIO, sauvegardes).
- AuthZ vérifiée **côté serveur** sur chaque endpoint (ne jamais se fier au front).
- MFA (au moins pour externes/admin), rate-limiting, protection CSRF, en-têtes sécurisés, CORS strict.
- **Journal d'audit inviolable** : qui a créé/modifié/validé/signé quoi, quand (append-only).
- Gestion des secrets hors dépôt ; scan de dépendances en CI ; principe du moindre privilège.
- **Protection des données (nLPD/RGPD)** : consentement, droit d'accès/effacement, minimisation.
  **Gravatar** = consentement explicite **ou** avatar local par défaut.

---

## 7. Git, commits, PR
- **Conventional Commits** : `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`, `build:`.
- Branches : `feat/<scope>`, `fix/<scope>`. Pas de commit direct sur la branche par défaut.
- Chaque PR : description claire, **tests** ajoutés/à jour, CI verte (lint + types + tests + build).
- Migrations Prisma **incluses** et réversibles. Pas de changement de schéma sans migration.

---

## 8. Tests & qualité
- **Unitaire** : `packages/hermes-engine` et `packages/scheduler` couverts en priorité (logique métier).
- **API** : Supertest sur les endpoints (RBAC, gates, budget, signature).
- **E2E** : Playwright sur les parcours critiques (login, création projet, validation de phase + budget,
  génération document, archivage, restauration).
- **Critères d'acceptation (§17 du cahier)** = checklist de fin d'incrément. Ne pas avancer si rouge.

---

## 9. Workflow attendu de l'agent (Cursor)
1. Lire le **cahier des charges** puis ce fichier. Si un point fonctionnel manque → demander, ne pas
   inventer.
2. Travailler **incrément par incrément** (ordre §16). Proposer un plan court avant de coder un module.
3. Générer/mettre à jour le **schéma Prisma**, l'**OpenAPI**, les **types partagés**, puis le code.
4. Écrire les **tests** et fournir des **seeds** réalistes (jamais en prod).
5. Vérifier **lint + types + tests + build** avant de clore l'incrément.
6. Tenir à jour `reference-data/hermes/` (5.1) comme **donnée**, pas comme code.

---

*Aligné sur le cahier des charges v1.1 — HERMES 5.1, approches classique + agile, comptes locaux pour
les externes, signature simple, suivi budgétaire intégré.*
