# PROJECTOR

Plateforme de gestion de projets conforme à la **méthode HERMES5** (norme eCH-0054).

## Stack technique

- **Next.js 15** (App Router) + **React 19**
- **TypeScript**
- **Tailwind CSS 4**
- **Lucide React** (icônes)

## Charte graphique

| Élément | Code couleur |
|---------|-------------|
| Fond sidebar | `#0f172a` |
| Navy principal | `#1e293b` |
| Cyan (gradient) | `#7dd3fc` |
| Indigo (gradient) | `#818cf8` |
| Violet (gradient) | `#a855f7` |

Le logo SVG reprend le style labyrinthe/circuit du logo PROJECTOR avec le dégradé cyan → indigo → violet.

## Démarrage

```bash
cd projector
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Structure du projet

```
src/
├── app/              # Pages (App Router)
│   ├── page.tsx      # Tableau de bord
│   ├── projets/      # Liste et détail des projets
│   ├── taches/       # Suivi des tâches
│   └── ...
├── components/
│   ├── layout/       # Sidebar, Header, AppShell
│   ├── project/      # Composants métier projets
│   └── ui/           # Composants UI réutilisables
├── lib/              # Utilitaires et données mock
└── types/            # Types TypeScript (HERMES5)
```

## Fonctionnalités (v0.1)

- Tableau de bord avec statistiques
- Liste et détail des projets
- Timeline des phases HERMES5
- Suivi des tâches par module
- Navigation vers modules futurs (équipe, documents, rapports)

## Documentation

- `docs/cahier-des-charges-gestion-projets-hermes5.md` — Spécifications fonctionnelles
- `agents.md` — Instructions pour les agents IA de développement

## Prochaines étapes

1. Copier vos fichiers de spécification dans `docs/` et `agents.md`
2. Connecter une base de données (PostgreSQL recommandé)
3. Implémenter l'authentification
4. Développer les modules HERMES5 (Achat, Exigences, Qualité, Risques...)
5. Gestion documentaire des livrables

## Licence

Projet privé — Aguilera
