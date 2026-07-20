# Gabarits Word HERMES 5.1

Ce dossier contient les **modèles Word officiels** (`.dotx`) utilisés par PROJECTOR pour générer les livrables de projet.

## Remplacer par vos modèles

1. Copiez vos fichiers `.dotx` ou `.docx` HERMES 5 dans ce dossier.
2. **Conservez exactement les noms de fichiers** listés dans `../template-registry.json` (ex. `rapport_de_phase.dotx`).
3. Relancez la vérification : `npm run hermes:templates:verify`

Les gabarits organisationnels peuvent remplacer ceux fournis par défaut (téléchargés depuis [hermes.admin.ch](https://www.hermes.admin.ch/fr/downloads.html)).

## Import depuis un dossier local

```bash
npm run hermes:templates:import -- /chemin/vers/vos/modeles
```

## Fichiers attendus (36 modèles)

| Fichier | Document HERMES |
|---------|-----------------|
| `etude.dotx` | Étude |
| `mandat_dinitialisation_du_projet.dotx` | Mandat d'initialisation |
| `plan_de_gestion_du_projet.dotx` | Plan de gestion du projet |
| `rapport_de_phase.dotx` | Rapport de phase |
| `documentation_du_prototype.dotx` | Incrément livré / prototype |
| `evaluation_finale_du_projet.dotx` | Évaluation finale |
| … | voir `template-registry.json` |

## Génération

À chaque validation de phase (ou après révision par le chef de projet), PROJECTOR :

- charge le gabarit correspondant depuis **ce dossier** ;
- pré-remplit les métadonnées projet (nom, mandant, chef de projet, etc.) ;
- remplace le logo HERMES par le logo PROJECTOR ;
- produit un fichier `.docx` téléchargeable depuis la section Documents.
