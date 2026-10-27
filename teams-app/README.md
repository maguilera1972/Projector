# Application Microsoft Teams PROJECTOR

Paquet d'application Teams (manifeste v1.19) : onglet personnel « Mes tâches », onglet configurable
(canaux, conversations, réunions), bot, extension de messagerie (recherche + aperçu des liens) et,
en option, l'agent déclaratif Copilot.

| Fichier | Rôle |
| --- | --- |
| `manifest.json` | Manifeste de base (sans `copilotAgents`, injecté à la construction) |
| `color.png` / `outline.png` | Icônes 192×192 et 32×32 (blanc + transparence), générées |
| `copilot/` | Agent déclaratif, plug-in API et OpenAPI (lot Copilot) |

```bash
# Régénérer les icônes depuis le logo
node scripts/teams/generate-icons.mjs

# Paquet de base → dist/teams-app/projector-teams.zip
bash scripts/teams/build-teams-app.sh

# Avec l'agent Copilot (incrémenter la version à chaque nouvel envoi dans Teams)
TEAMS_APP_VERSION=1.0.1 TEAMS_OAUTH_REFERENCE_ID=<id> bash scripts/teams/build-teams-app.sh
```

Mise en place complète (Azure Bot, « Expose an API », permissions, centre d'administration Teams) :
[`docs/integration-teams-copilot.md`](../docs/integration-teams-copilot.md).
