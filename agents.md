# Agents — PROJECTOR

> **Note :** Copiez ici le contenu de votre fichier `agents.md` original pour guider les agents IA lors du développement.

## Contexte du projet

**PROJECTOR** est une plateforme de gestion de projets basée sur la méthode **HERMES5** (eCH-0054).

## Stack

- Next.js 15 + TypeScript + Tailwind CSS 4
- Conventions : App Router, composants dans `src/components/`, types dans `src/types/`

## Charte visuelle

- Sidebar : fond `#0f172a`
- Accent gradient : `#7dd3fc` → `#818cf8` → `#a855f7`
- Logo : composant `src/components/ui/logo.tsx`

## Conventions de code

- Langue UI : **français** (fr-CH)
- Nommage : camelCase (code), kebab-case (fichiers routes)
- Composants UI réutilisables dans `src/components/ui/`
- Types HERMES5 centralisés dans `src/types/index.ts`

## Modules HERMES5 à implémenter

Référencer le cahier des charges pour la priorisation :

1. Gouvernance et mandat de projet
2. Phases et jalons (Initialisation → Clôture)
3. Tâches et modules (Achat, Exigences, Qualité, Communication, Risques...)
4. Rôles (chef de projet, mandant, spécialistes)
5. Livrables / résultats documentaires
6. Rapports et indicateurs

## Instructions pour les agents

- Lire `docs/cahier-des-charges-gestion-projets-hermes5.md` avant toute implémentation
- Respecter la charte graphique PROJECTOR
- Préférer des changements minimaux et ciblés
- Ne pas sur-ingénierier — itérer par module
