# API Copilot PROJECTOR et connecteur Microsoft Graph

PROJECTOR s'intègre à Microsoft 365 Copilot de deux façons complémentaires :

| Brique | Rôle | Fraîcheur |
| --- | --- | --- |
| **Connecteur Microsoft Graph** `projectorprojects` | Indexe projets, décisions de phase, révisions budgétaires et rapports de statut dans Microsoft Search / Copilot (recherche plein texte, ACL par utilisateur). | Synchronisation périodique (tâche planifiée) |
| **API Copilot** `https://projector.aguilera.ch/api/copilot` | API REST (OpenAPI 3.0.3) utilisée par l'agent déclaratif « PROJECTOR » (plugin d'API) et par tout autre agent IA : lecture temps réel et actions. | Temps réel |

Les fichiers du paquet Teams/Copilot se trouvent dans `teams-app/copilot/` :
`declarativeAgent.json` (agent déclaratif v1.4), `ai-plugin.json` (plugin d'API v2.2) et `openapi.json`.

---

## 1. Configuration Microsoft Entra (inscription `f5f1bb90-afec-4e0d-9500-2f6e970ef5a9`)

1. **Exposer une API**
   - URI d'ID d'application : `api://f5f1bb90-afec-4e0d-9500-2f6e970ef5a9`
     (l'audience `api://projector.aguilera.ch/f5f1bb90-…` est aussi acceptée si vous utilisez ce format).
   - Portée déléguée : `access_as_user` (consentement : administrateurs et utilisateurs).
2. **Rôles d'application** (types de membres autorisés : *Applications*) :
   - `Projector.Read.All` — lecture seule de tous les projets (démons, agents IA) ;
   - `Projector.ReadWrite.All` — réservé ; aujourd'hui traité comme lecture seule (les actions exigent un utilisateur délégué).
3. **Manifeste** : `"accessTokenAcceptedVersion": 2` recommandé (jetons v2, `aud` = ID client). Les jetons v1
   (`aud` = `api://…`, émetteur `sts.windows.net`) restent acceptés.
4. **Plugin Copilot (OAuth)** : dans le portail des développeurs Teams → *Outils → Inscription du client OAuth*,
   créer une inscription avec l'ID client et un secret de cette application, l'URL d'autorisation
   `https://login.microsoftonline.com/c4691421-eeae-4c7e-bd67-17849bca6c78/oauth2/v2.0/authorize`,
   l'URL de jeton `…/oauth2/v2.0/token`, la portée `api://f5f1bb90-afec-4e0d-9500-2f6e970ef5a9/access_as_user offline_access`
   et l'URL de base `https://projector.aguilera.ch/api/copilot`. L'ID de référence obtenu remplace
   `{{OAUTH_REFERENCE_ID}}` dans `ai-plugin.json` lors de l'empaquetage.
   Ajouter l'URI de redirection **Web** `https://teams.microsoft.com/api/platform/v1.0/oAuthRedirect` à l'inscription Entra.
5. **Clients pré-autorisés** (facultatif, évite l'écran de consentement pour `access_as_user`) :
   Teams bureau/mobile `1fec8e78-bce4-4aaf-ab1b-5451cc387264`, Teams web `5e3ce6c0-2b1f-4285-8d4b-75ee78787346`.
   Pour l'authentification unique Entra des plugins Copilot (au lieu d'OAuth), suivre la procédure Microsoft
   « Microsoft Entra SSO pour les plugins d'API » (inscription SSO dans le portail des développeurs).
6. **Permissions Graph de l'application** (connecteur, consentement administrateur) :
   `ExternalConnection.ReadWrite.OwnedBy` et `ExternalItem.ReadWrite.OwnedBy`.

L'API Copilot doit être activée dans *Paramètres → Administration → Microsoft Teams & Copilot* (fonctionnalité
« API Copilot ») ; sinon toutes les routes répondent `503`.

---

## 2. Authentification

Chaque appel porte `Authorization: Bearer <jeton d'accès Entra>`. Le jeton est validé (signature JWKS du locataire,
émetteur v1/v2 du locataire `c4691421-…`, audience PROJECTOR, claim `tid`).

| Type de jeton | Condition | Droits |
| --- | --- | --- |
| Délégué | `scp` contient `access_as_user` | Ceux de l'utilisateur PROJECTOR lié par `oid` (compte Microsoft déjà connecté à PROJECTOR et actif). Actions autorisées selon les règles PROJECTOR (mandant, chef de projet, assigné…). |
| Application | `roles` contient `Projector.Read.All` (ou `Projector.ReadWrite.All`), sans `scp` | Lecture seule de **tous** les projets ; décisions en attente de tous les projets. Actions refusées (`403 delegated_user_required`). |
| Session PROJECTOR | Cookie de session (tests depuis le navigateur) | Ceux de l'utilisateur connecté. |

Codes d'erreur : `401` (jeton absent ou invalide, en-tête `WWW-Authenticate: Bearer`), `403` (`user_not_linked`,
`insufficient_scope`, `insufficient_role`, `delegated_user_required`, ou droit métier manquant), `404`, `400`, `503`
(`feature_disabled`, `not_configured`). Le corps est toujours `{ "error": "...", "code": "..." }`.

### Jeton d'application (démon, agent IA autonome)

1. Créer une inscription d'application pour l'agent, lui ajouter *Autorisations d'API → Mes API → PROJECTOR →
   Autorisations d'application → `Projector.Read.All`*, puis accorder le consentement administrateur.
2. Obtenir un jeton (flux « client credentials ») :

```bash
TOKEN=$(curl -s -X POST \
  "https://login.microsoftonline.com/c4691421-eeae-4c7e-bd67-17849bca6c78/oauth2/v2.0/token" \
  -d client_id="$AGENT_CLIENT_ID" \
  -d client_secret="$AGENT_CLIENT_SECRET" \
  -d scope="api://f5f1bb90-afec-4e0d-9500-2f6e970ef5a9/.default" \
  -d grant_type=client_credentials | jq -r .access_token)
```

### Jeton délégué (script interactif)

Avec Azure CLI (si l'application Azure CLI est pré-autorisée ou consentie) :

```bash
TOKEN=$(az account get-access-token \
  --scope "api://f5f1bb90-afec-4e0d-9500-2f6e970ef5a9/access_as_user" --query accessToken -o tsv)
```

Ou flux « device code » / « authorization code » MSAL avec la portée
`api://f5f1bb90-afec-4e0d-9500-2f6e970ef5a9/access_as_user`.

---

## 3. Points de terminaison

Base : `https://projector.aguilera.ch/api/copilot`. Paramètre commun facultatif `locale=fr|en|de|it|es`
(langue des libellés ; défaut : langue de l'utilisateur, sinon français).

| Méthode | Chemin | operationId | Description |
| --- | --- | --- | --- |
| GET | `/openapi.json` | — | Spécification OpenAPI (publique, sans authentification). |
| GET | `/me` | `getMe` | Appelant, nombre de tâches ouvertes / en retard, décisions en attente. |
| GET | `/projects?q=&status=&weather=&limit=` | `listProjects` | Projets visibles (statut, phase, avancement, météo, chef, mandant, lien). `status` : `planifie`, `en_cours`, `en_pause`, `termine`, `active` ; `weather` : `green`, `orange`, `red`, `neutral`. |
| GET | `/projects/{id}` | `getProject` | Détail : météo par dimension et motifs, compteurs de tâches, tâches en retard, décisions en attente, prochaines échéances. |
| GET | `/projects/{id}/tasks?status=&mine=true` | `listProjectTasks` | Tâches du projet (`a_faire`, `en_cours`, `termine`, `bloque`, `open`, `overdue`). |
| GET | `/projects/{id}/status-report?locale=fr` | `getProjectStatusReport` | Rapport de statut en Markdown (JSON `{ markdown, … }` ; `format=markdown` ou `Accept: text/markdown` → texte brut). |
| GET | `/tasks/mine` | `listMyTasks` | Mes tâches ouvertes (délégué uniquement). |
| GET | `/decisions/pending` | `listPendingDecisions` | Quality gates et révisions budgétaires en attente de l'utilisateur en tant que mandant (toutes pour un jeton d'application). |
| POST | `/tasks/{id}/complete` | `completeTask` | Marquer une tâche terminée. |
| POST | `/tasks/{id}/comments` | `commentTask` | Corps `{ "text": "…" }`. |
| POST | `/projects/{id}/phase-gate/approve` | `approvePhaseGate` | Corps `{ "signatureText": "Prénom Nom" }` (défaut : nom de l'utilisateur). Mandant uniquement. |
| POST | `/projects/{id}/phase-gate/reject` | `rejectPhaseGate` | Corps `{ "comment": "motif" }` (obligatoire). Mandant uniquement. |
| POST | `/budget-revisions/{id}/approve` | `approveBudgetRevision` | Corps `{ "signatureText": "…" }`. Mandant uniquement. |
| POST | `/budget-revisions/{id}/reject` | `rejectBudgetRevision` | Corps `{ "comment": "motif" }` (obligatoire). Mandant uniquement. |

Les actions passent par la même couche d'autorisation que l'interface web et Teams (`src/lib/integrations/actions.ts`) ; les décisions (quality gates, révisions budgétaires) et les commentaires sont journalisés
dans l'historique du projet.

### Exemples

```bash
API=https://projector.aguilera.ch/api/copilot

curl -s -H "Authorization: Bearer $TOKEN" "$API/me" | jq
curl -s -H "Authorization: Bearer $TOKEN" "$API/projects?weather=red" | jq '.projects[] | {name, weatherLabel, url}'
curl -s -H "Authorization: Bearer $TOKEN" "$API/projects/$PROJECT_ID" | jq '.health'
curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: text/markdown" "$API/projects/$PROJECT_ID/status-report?locale=fr"

# Actions (jeton délégué)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"text":"Livrable transmis au mandant."}' "$API/tasks/$TASK_ID/comments" | jq .message
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"comment":"Analyse des risques incomplète."}' "$API/projects/$PROJECT_ID/phase-gate/reject" | jq .message
```

---

## 4. Utilisation par d'autres agents IA

- **Spécification** : `https://projector.aguilera.ch/api/copilot/openapi.json` (publique ; l'URL du serveur suit
  `PROJECTOR_PUBLIC_URL`). Les `operationId` et descriptions sont rédigés pour les LLM.
- **Function calling** : générer les outils directement depuis la spécification (la plupart des SDK d'agents
  acceptent une spécification OpenAPI), ou les déclarer à la main, par exemple :

```json
{
  "name": "projector_list_projects",
  "description": "Liste les projets PROJECTOR visibles (statut, phase HERMES, avancement, météo green/orange/red, chef de projet, mandant, lien).",
  "parameters": {
    "type": "object",
    "properties": {
      "q": { "type": "string", "description": "Texte recherché (nom, chef de projet, mandant)" },
      "status": { "type": "string", "enum": ["planifie", "en_cours", "en_pause", "termine", "active"] },
      "weather": { "type": "string", "enum": ["green", "orange", "red", "neutral"] }
    }
  }
}
```

```json
{
  "name": "projector_status_report",
  "description": "Rapport de statut Markdown d'un projet PROJECTOR (KPI, météo, phases, retards, décisions).",
  "parameters": {
    "type": "object",
    "properties": {
      "projectId": { "type": "string", "description": "Champ id renvoyé par projector_list_projects" },
      "locale": { "type": "string", "enum": ["fr", "en", "de", "it", "es"] }
    },
    "required": ["projectId"]
  }
}
```

- **MCP** : un pont générique « OpenAPI → MCP » peut exposer chaque opération comme outil MCP à partir de l'URL de
  la spécification, avec l'en-tête `Authorization: Bearer <jeton>` injecté par le pont (jeton d'application
  `Projector.Read.All` pour un agent en lecture seule, jeton délégué pour agir au nom d'un utilisateur).
  Déployer ce pont via la plateforme MCP gouvernée de l'organisation (journalisation, contrôle d'accès) plutôt
  qu'en serveur MCP ad hoc sur un poste.
- **Bonnes pratiques** pour l'agent : toujours résoudre les identifiants via `listProjects`, `listMyTasks` ou
  `listPendingDecisions` ; demander une confirmation explicite avant toute action ; citer le champ `url`.

---

## 5. Connecteur Microsoft Graph

- **Connexion** : `projectorprojects` (variable `COPILOT_CONNECTOR_ID`), nom « PROJECTOR ». Les liens
  `https://projector.aguilera.ch/projets/{id}` sont résolus vers l'élément `project-{id}`.
- **Éléments** (contenu texte, français) :
  `project-<id>` (statut, phase, avancement, météo et motifs, budget, dates, chef/mandant, tâches en retard ou bloquées,
  décisions en attente, prochaines échéances), `decision-<validationId>` (quality gates : passage, statut, checklist,
  signature ou motif de refus), `budget-<revisionId>` (révisions budgétaires) et `report-<projectId>` (rapport de statut).
- **Schéma** : `itemType`, `title`, `projectId`, `projectName`, `projectUrl`, `status`, `phase`, `approach`, `weather`,
  `progress`, `chef`, `mandant`, `portfolio`, `startDate`, `endDate`, `budget`, `summary`, `url`, `iconUrl`,
  `createdBy`, `createdDateTime`, `lastModified`. L'enregistrement est asynchrone (quelques minutes).
- **ACL** (jamais « everyone ») :
  - mode `visibility` (défaut) : comptes PROJECTOR actifs liés à Entra (`entraOid`) qui voient le projet dans
    PROJECTOR — internes avec `projects:read`, invités externes liés au projet ;
  - mode `linked` (`COPILOT_CONNECTOR_ACL_MODE=linked`) : uniquement chef de projet, mandant, assignés, propriétaire
    et ressources du portfolio, plus les administrateurs ;
  - groupe Entra de repli `COPILOT_CONNECTOR_ADMIN_GROUP_ID` ajouté à chaque élément s'il est défini. Un projet sans
    aucun destinataire (et sans groupe de repli) n'est pas indexé ; il est signalé dans le résultat de synchronisation.
- **Synchronisation** incrémentale (empreinte SHA-256 du contenu, des propriétés et de l'ACL), suppression des éléments
  disparus, reprise automatique sur limitation Graph (`429`, `Retry-After`). Une synchronisation complète renvoie tous
  les éléments.
- **Administration** (session administrateur) : `GET /api/admin/integrations/connector` (état, statut de la connexion,
  capacité) et `POST` avec `{ "action": "setup" | "refreshSchema" | "sync" | "syncFull" | "delete" }`.
  Procédure : `setup` → attendre puis `refreshSchema` jusqu'à « Schéma prêt » → `sync` (ensuite automatique).

---

## 6. Sécurité

- Les jetons ne sont jamais journalisés ; seules les erreurs de validation (sans contenu du jeton) sont renvoyées.
- Un compte Microsoft non lié, suspendu ou en attente d'approbation n'a aucun accès (`403 user_not_linked`).
- Les jetons d'application sont strictement en lecture seule ; toutes les écritures sont faites au nom d'un
  utilisateur PROJECTOR identifié et contrôlées par les mêmes règles que l'interface web.
- Le connecteur n'indexe que pour des utilisateurs nommés (ou le groupe de repli) : retirer l'accès d'une personne
  dans PROJECTOR (suspension, rôle, lien Entra) la retire de l'ACL à la synchronisation suivante.
- Les URL d'opérations Graph stockées ne sont appelées que si elles pointent vers `graph.microsoft.com`.
- Réponses `Cache-Control: no-store` (contenu propre à l'appelant), sauf la spécification OpenAPI publique.
