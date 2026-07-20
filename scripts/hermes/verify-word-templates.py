#!/usr/bin/env python3
"""Vérifie la présence des gabarits Word HERMES référencés dans template-registry.json."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEMPLATES_DIR = ROOT / "reference-data" / "hermes" / "word-templates"
REGISTRY = ROOT / "reference-data" / "hermes" / "template-registry.json"


def main() -> int:
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    expected = sorted(
        {entry["wordFile"] for entry in registry.get("templates", []) if entry.get("wordFile")}
    )

    present = {p.name for p in TEMPLATES_DIR.glob("*.dotx")} | {
        p.name for p in TEMPLATES_DIR.glob("*.docx")
    }

    missing = [name for name in expected if name not in present]
    extra = sorted(present - set(expected))

    print(f"Dossier : {TEMPLATES_DIR}")
    print(f"Attendus (registre) : {len(expected)}")
    print(f"Présents            : {len(present)}")

    if missing:
        print("\nManquants :")
        for name in missing:
            print(f"  - {name}")

    if extra:
        print("\nFichiers supplémentaires (non référencés) :")
        for name in extra[:20]:
            print(f"  + {name}")
        if len(extra) > 20:
            print(f"  … et {len(extra) - 20} autres")

    if missing:
        print("\nCopiez vos modèles Word dans ce dossier ou exécutez :")
        print("  npm run hermes:templates:install")
        return 1

    print("\nTous les gabarits HERMES référencés sont disponibles.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
