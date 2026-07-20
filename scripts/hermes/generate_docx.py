#!/usr/bin/env python3
"""Génère un document Word (.docx) à partir d'un gabarit HERMES 5.1 (.dotx)."""

from __future__ import annotations

import json
import re
import sys
import zipfile
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[2]
TEMPLATES_DIR = ROOT / "reference-data" / "hermes" / "word-templates"
BRAND_DIR = ROOT / "reference-data" / "brand"

# Référence SVG horizontale (icône + texte PROJECTOR)
LOGO_SVG = BRAND_DIR / "projector-logo.svg"


def _write_png(width: int, height: int, pixels: bytes) -> bytes:
    """Écrit un PNG RGB minimal sans dépendance externe (compatible Word)."""
    import struct
    import zlib

    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    raw = b"".join(
        b"\x00"
        + pixels[y * width * 3 : (y + 1) * width * 3]
        for y in range(height)
    )
    compressed = zlib.compress(raw, 9)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", compressed)
        + chunk(b"IEND", b"")
    )


def _lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def _projector_color(t: float) -> tuple[int, int, int, int]:
    """Dégradé cyan → indigo → violet (logo PROJECTOR)."""
    if t < 0.5:
        u = t / 0.5
        return (_lerp(0x7D, 0x81, u), _lerp(0xD3, 0x8C, u), _lerp(0xFC, 0xF8, u), 255)
    u = (t - 0.5) / 0.5
    return (_lerp(0x81, 0xA8, u), _lerp(0x8C, 0x55, u), _lerp(0xF8, 0xF7, u), 255)


def _png_dimensions(data: bytes) -> tuple[int, int] | None:
    import struct

    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    return struct.unpack(">II", data[16:24])


def _set_pixel(pixels: bytearray, width: int, x: int, y: int, rgba: tuple[int, int, int, int]) -> None:
    if x < 0 or y < 0:
        return
    idx = (y * width + x) * 3
    if idx + 2 >= len(pixels):
        return
    r, g, b, a = rgba
    if a == 0:
        return
    if a >= 255:
        pixels[idx : idx + 3] = (r, g, b)
        return
    # Alpha compositing sur fond blanc
    alpha = a / 255
    pixels[idx] = int(r * alpha + pixels[idx] * (1 - alpha))
    pixels[idx + 1] = int(g * alpha + pixels[idx + 1] * (1 - alpha))
    pixels[idx + 2] = int(b * alpha + pixels[idx + 2] * (1 - alpha))


def _draw_thick_line(
    pixels: bytearray,
    width: int,
    height: int,
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    thickness: float,
    color_fn,
) -> None:
    steps = int(max(abs(x1 - x0), abs(y1 - y0), 1) * 2)
    for i in range(steps + 1):
        t = i / max(steps, 1)
        x = x0 + (x1 - x0) * t
        y = y0 + (y1 - y0) * t
        for dy in range(-int(thickness), int(thickness) + 1):
            for dx in range(-int(thickness), int(thickness) + 1):
                if dx * dx + dy * dy <= thickness * thickness:
                    _set_pixel(pixels, width, int(x + dx), int(y + dy), color_fn(t))


def _draw_ring(
    pixels: bytearray,
    width: int,
    height: int,
    cx: float,
    cy: float,
    radius: float,
    thickness: float,
    dash_on: float,
    dash_off: float,
    opacity: float,
) -> None:
    circumference = 2 * 3.14159265 * radius
    dash_len = dash_on + dash_off
    steps = max(int(circumference * 2), 8)
    for i in range(steps):
        angle = (i / steps) * 2 * 3.14159265
        pos = (angle / (2 * 3.14159265)) * circumference
        if (pos % dash_len) > dash_on:
            continue
        x = cx + radius * __import__("math").cos(angle)
        y = cy + radius * __import__("math").sin(angle)
        t = (i / steps) % 1.0
        r, g, b, _ = _projector_color(t)
        for dy in range(-int(thickness), int(thickness) + 1):
            for dx in range(-int(thickness), int(thickness) + 1):
                if dx * dx + dy * dy <= thickness * thickness:
                    _set_pixel(
                        pixels,
                        width,
                        int(x + dx),
                        int(y + dy),
                        (r, g, b, int(255 * opacity)),
                    )


# Glyphes 5×7 pour PROJECTOR (barres pleines)
_GLYPHS: dict[str, list[str]] = {
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "J": ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
}


def _draw_text(
    pixels: bytearray,
    width: int,
    height: int,
    text: str,
    x0: float,
    y0: float,
    cell: float,
    gap: float,
) -> None:
    cursor = x0
    for ch in text:
        glyph = _GLYPHS.get(ch)
        if not glyph:
            cursor += cell * 3 + gap
            continue
        for row, pattern in enumerate(glyph):
            for col, bit in enumerate(pattern):
                if bit != "1":
                    continue
                px = int(cursor + col * cell)
                py = int(y0 + row * cell)
                t = (cursor + col * cell) / max(width, 1)
                r, g, b, _ = _projector_color(min(max(t, 0), 1))
                for dy in range(int(cell)):
                    for dx in range(int(cell)):
                        _set_pixel(pixels, width, px + dx, py + dy, (r, g, b, 255))
        cursor += len(glyph[0]) * cell + gap


# Dimensions cibles du logo dans l'en-tête Word (ratio 320:48 du SVG de marque).
LOGO_DISPLAY_WIDTH_PX = 250.0
LOGO_DISPLAY_HEIGHT_PX = 37.5
LOGO_RENDER_WIDTH = 320
LOGO_RENDER_HEIGHT = 48


def _logo_render_size(width: int, height: int) -> tuple[int, int]:
    """Génère le logo en haute résolution pour les petits PNG HERMES des gabarits."""
    if width <= LOGO_RENDER_WIDTH and height <= LOGO_RENDER_HEIGHT:
        return LOGO_RENDER_WIDTH, LOGO_RENDER_HEIGHT
    return width, height


def _enlarge_header_logo(xml: str) -> str:
    """Agrandit le logo dans l'en-tête tout en conservant la mise en page du tableau."""
    return re.sub(
        r'style="width:[^;"]+;height:[^;"]+"',
        f'style="width:{LOGO_DISPLAY_WIDTH_PX}px;height:{LOGO_DISPLAY_HEIGHT_PX}px"',
        xml,
        count=1,
    )


def _convert_template_package_xml(xml: str) -> str:
    """Convertit les métadonnées .dotx en .docx pour ouverture dans Word."""
    return xml.replace(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
    )


def render_projector_logo(width: int, height: int) -> bytes:
    """Logo PROJECTOR : icône concentrique + texte (aligné sur la barre latérale)."""
    pixels = bytearray(width * height * 3)
    for i in range(0, len(pixels), 3):
        pixels[i : i + 3] = (255, 255, 255)

    scale = min(height / LOGO_RENDER_HEIGHT, width / LOGO_RENDER_WIDTH)
    icon_cx = 24 * scale
    icon_cy = height / 2

    for ring, opacity in ((20, 0.95), (15, 0.85), (10, 0.7)):
        _draw_ring(
            pixels,
            width,
            height,
            icon_cx,
            icon_cy,
            ring * scale,
            max(1.0, 1.1 * scale),
            26 * scale,
            8 * scale,
            opacity,
        )

    import math

    for angle in (math.pi / 2, 0, -math.pi / 2, math.pi):
        x1 = icon_cx + 20 * scale * math.cos(angle)
        y1 = icon_cy - 20 * scale * math.sin(angle)
        x2 = icon_cx + 12 * scale * math.cos(angle)
        y2 = icon_cy - 12 * scale * math.sin(angle)
        _draw_thick_line(
            pixels,
            width,
            height,
            x1,
            y1,
            x2,
            y2,
            max(1.0, scale),
            lambda t: _projector_color(0.5),
        )

    center_r = 4.5 * scale
    for y in range(height):
        for x in range(width):
            if (x - icon_cx) ** 2 + (y - icon_cy) ** 2 <= center_r * center_r:
                _set_pixel(pixels, width, x, y, _projector_color(0.5))

    cell = max(1.2, 3.6 * scale)
    gap = max(1.0, 1.4 * scale)
    text_y = icon_cy - (7 * cell) / 2
    _draw_text(pixels, width, height, "PROJECTOR", 58 * scale, text_y, cell, gap)

    return _write_png(width, height, bytes(pixels))


def logo_for_dimensions(width: int, height: int) -> bytes:
    """Logo mis en cache par dimensions (remplace tout PNG HERMES du gabarit)."""
    render_w, render_h = _logo_render_size(width, height)
    BRAND_DIR.mkdir(parents=True, exist_ok=True)
    cache = BRAND_DIR / f"projector-logo-{render_w}x{render_h}-rgb.png"
    if cache.exists():
        return cache.read_bytes()
    data = render_projector_logo(render_w, render_h)
    cache.write_bytes(data)
    return data


def _replace_text_in_xml(xml: str, old: str, new: str, occurrence: int | None = None) -> str:
    """Remplace du texte dans les nœuds w:t, avec support d'occurrence (1-based)."""
    if not old:
        return xml
    safe_new = escape(new)
    count = 0

    def replacer(match: re.Match[str]) -> str:
        nonlocal count
        text = match.group(2)
        if text != old:
            return match.group(0)
        count += 1
        if occurrence is None or count == occurrence:
            return match.group(1) + safe_new + match.group(3)
        return match.group(0)

    return re.sub(r"(<w:t[^>]*>)([^<]*)(</w:t>)", replacer, xml)


def _set_style_paragraph_text(xml: str, style: str, text: str) -> str:
    """Remplace le texte du paragraphe portant un style Word donné."""
    safe = escape(text)
    pattern = (
        rf'(<w:p[^>]*>.*?<w:pStyle w:val="{re.escape(style)}"[^>]*/>.*?<w:t[^>]*>)'
        rf"([^<]*)(</w:t>)"
    )

    def repl(match: re.Match[str], _xml=xml) -> str:
        return match.group(1) + safe + match.group(3)

    new_xml, n = re.subn(pattern, repl, xml, count=1, flags=re.DOTALL)
    if n:
        return new_xml

    # Variante sans espace dans le nom de style
    alt = style.replace(" ", "")
    if alt != style:
        return _set_style_paragraph_text(xml.replace(style, alt), alt, text)
    return xml


def _fill_content_control(xml: str, tag: str, value: str) -> str:
    safe = escape(value)
    pattern = (
        rf'(<w:tag w:val="{re.escape(tag)}"[^>]*/>.*?<w:t[^>]*>)'
        rf"([^<]*)(</w:t>)"
    )
    return re.sub(pattern, rf"\1{safe}\3", xml, count=1, flags=re.DOTALL)


def _fill_empty_cell_after_label(xml: str, label: str, value: str) -> str:
    """Remplit la cellule vide à droite d'un libellé dans le tableau de couverture."""
    if not value or value == "—":
        return xml
    safe = escape(value)
    pattern = (
        rf'(<w:t[^>]*>{re.escape(label)}</w:t></w:r></w:p></w:tc><w:tc[^>]*>.*?<w:p[^>]*>'
        rf"(?:<w:pPr>.*?</w:pPr>)?)(</w:p>)"
    )
    inject = rf'\1<w:r><w:rPr><w:lang w:val="fr-CH"/></w:rPr><w:t>{safe}</w:t></w:r>\2'
    return re.sub(pattern, inject, xml, count=1, flags=re.DOTALL)


def _inject_after_heading(
    xml: str,
    heading: str,
    content: str,
    heading_style: str = "berschrift1",
) -> str:
    """Injecte du contenu éditorial après un titre de section HERMES."""
    if not content.strip():
        return xml
    safe = escape(content.strip())

    # Cas 1 : paragraphe Absatz d'instruction juste après le titre.
    pattern_absatz = (
        rf"(<w:p[^>]*>.*?<w:pStyle w:val=\"{re.escape(heading_style)}\"[^>]*/>.*?"
        rf"<w:t[^>]*>{re.escape(heading)}</w:t>.*?</w:p>)"
        rf"(<w:p[^>]*>.*?<w:pStyle w:val=\"Absatz\"[^>]*/>.*?<w:t[^>]*>)"
        rf"([^<]+)(</w:t>)"
    )

    def repl_absatz(match: re.Match[str]) -> str:
        instruction = match.group(3).strip()
        if len(instruction) < 10:
            return match.group(0)
        return match.group(1) + match.group(2) + safe + match.group(4)

    new_xml, count = re.subn(pattern_absatz, repl_absatz, xml, count=1, flags=re.DOTALL)
    if count:
        return new_xml

    # Cas 2 : sous-sections sans Absatz direct (ex. Contexte du prototype).
    pattern_insert = (
        rf"(<w:p[^>]*>.*?<w:pStyle w:val=\"{re.escape(heading_style)}\"[^>]*/>.*?"
        rf"<w:t[^>]*>{re.escape(heading)}</w:t>.*?</w:p>)"
    )
    insert = (
        rf"\1<w:p><w:pPr><w:pStyle w:val=\"Absatz\"/>"
        rf"<w:rPr><w:lang w:val=\"fr-CH\"/></w:rPr></w:pPr>"
        rf"<w:r><w:rPr><w:lang w:val=\"fr-CH\"/></w:rPr><w:t>{safe}</w:t></w:r></w:p>"
    )
    return re.sub(pattern_insert, insert, xml, count=1, flags=re.DOTALL)


def _inject_after_toc_entry(xml: str, label: str, content: str) -> str:
    """Injecte du contenu après l'entrée « Description » du sommaire HERMES."""
    if not content.strip():
        return xml
    safe = escape(content.strip())
    pattern = (
        rf"(<w:p[^>]*>.*?<w:pStyle w:val=\"Inhaltsverzeichnis12\"[^>]*/>.*?"
        rf"<w:t[^>]*>{re.escape(label)}</w:t>.*?</w:p>)"
        rf"(<w:p[^>]*>.*?<w:pStyle w:val=\"Absatz\"[^>]*/>.*?<w:t[^>]*>)"
        rf"([^<]+)(</w:t>)"
    )

    def repl(match: re.Match[str]) -> str:
        instruction = match.group(3).strip()
        if len(instruction) < 10:
            return match.group(0)
        return match.group(1) + match.group(2) + safe + match.group(4)

    return re.sub(pattern, repl, xml, count=1, flags=re.DOTALL)


def _strip_footer_filename(xml: str) -> str:
    """Retire le champ FILENAME et les références au gabarit .dotx d'origine."""
    xml = re.sub(
        r"<w:fldSimple w:instr=\"[^\"]*FILENAME[^\"]*\"[^>]*>.*?</w:fldSimple>",
        "",
        xml,
        flags=re.DOTALL,
    )
    xml = re.sub(
        r"<w:p[^>]*>(?:(?!</w:p>).)*FILENAME(?:(?!</w:p>).)*</w:p>",
        "<w:p><w:pPr><w:pStyle w:val=\"Fuzeile\"/></w:pPr></w:p>",
        xml,
        flags=re.DOTALL,
    )
    xml = re.sub(
        r"<w:t[^>]*>[^<]*\.dotx</w:t>",
        "<w:t></w:t>",
        xml,
        flags=re.IGNORECASE,
    )
    return xml


def _remove_footer_logo(xml: str) -> str:
    """Retire le logo HERMES du pied de page (barre grise + image)."""
    xml = re.sub(r"<w:drawing>.*?</w:drawing>", "", xml, flags=re.DOTALL)
    xml = re.sub(r"<w:pict>.*?</w:pict>", "", xml, flags=re.DOTALL)
    xml = re.sub(
        r"<w:tr[^>]*>(?:(?!</w:tr>).)*<w:drawing>(?:(?!</w:tr>).)*</w:tr>",
        "",
        xml,
        flags=re.DOTALL,
    )
    return xml


def _clean_footer(xml: str) -> str:
    return _remove_footer_logo(_strip_footer_filename(xml))


def _fill_modification_row(xml: str, version: str, date: str, author: str) -> str:
    xml = _replace_text_in_xml(xml, "0.1", version, occurrence=2)
    # Première ligne du tableau modifications après "Auteur" header
    return xml


def build_merge_data(payload: dict[str, Any]) -> dict[str, str]:
    project = payload.get("project", {})
    validation = payload.get("validation", {})
    meta = payload.get("meta", {})

    budget = project.get("budget")
    budget_hours = project.get("budgetHours")
    budget_str = (
        f"{budget:,.0f} CHF".replace(",", "'") if budget else "—"
    )
    hours_str = f"{budget_hours} h" if budget_hours else "—"

    validation_date = (
        validation.get("approvedAt", "")[:10]
        or validation.get("sessionDate")
        or validation.get("submittedAt", "")[:10]
        or datetime.now().strftime("%Y-%m-%d")
    )

    return {
        "project_name": project.get("name") or "—",
        "project_number": project.get("code") or project.get("id", "")[:8].upper(),
        "program_name": project.get("portfolioName") or "—",
        "mandant": project.get("mandant") or "—",
        "chef_de_projet": project.get("chefDeProjet") or "—",
        "author": meta.get("generatedByName") or project.get("chefDeProjet") or "—",
        "document_version": str(meta.get("version") or "1.0"),
        "document_date": validation_date,
        "classification": meta.get("classification") or "Interne",
        "document_status": meta.get("documentStatus") or "Final",
        "description": meta.get("descriptionOverride")
        or project.get("description")
        or "",
        "contexte": meta.get("contexteOverride")
        or project.get("description")
        or "",
        "budget": budget_str,
        "budget_hours": hours_str,
        "phase_label": meta.get("phaseLabel") or "—",
        "milestone": meta.get("milestone") or "—",
        "validation_signature": validation.get("signatureText") or "—",
        "validation_date": validation_date,
        "generated_at": datetime.now().strftime("%d.%m.%Y %H:%M"),
        "tasks_list": meta.get("tasksList") or "",
        "scenario_label": meta.get("scenarioLabel") or "—",
        "approach_label": meta.get("approachLabel") or "—",
    }


def merge_template(word_file: str, merge: dict[str, str]) -> bytes:
    template_path = TEMPLATES_DIR / word_file
    if not template_path.exists():
        raise FileNotFoundError(f"Gabarit introuvable : {word_file}")

    out = BytesIO()

    def transform_xml(filename: str, xml: str) -> str:
        if filename == "word/document.xml":
            for style in (
                "Titel-Projektbezeichnung2",
                "Titel-Projektbezeichnung 2",
            ):
                xml = _set_style_paragraph_text(xml, style, merge["project_name"])

            xml = _replace_text_in_xml(
                xml, "Chef de projet", merge["chef_de_projet"], 2
            )
            xml = _replace_text_in_xml(xml, "Mandant", merge["mandant"], 2)
            xml = _replace_text_in_xml(
                xml, "0.1", merge["document_version"], 1
            )
            xml = _replace_text_in_xml(
                xml,
                "Cliquez ici pour saisir une date.",
                merge["document_date"],
            )
            xml = _replace_text_in_xml(
                xml,
                "Sélectionnez un élément.",
                merge["classification"],
                1,
            )
            xml = _replace_text_in_xml(
                xml,
                "Sélectionnez un élément.",
                merge["document_status"],
                2,
            )
            xml = _fill_empty_cell_after_label(
                xml, "Nom du programme", merge["program_name"]
            )
            xml = _fill_empty_cell_after_label(
                xml, "N°\xa0du projet", merge["project_number"]
            )
            xml = _fill_empty_cell_after_label(
                xml, "Auteur/Auteurs", merge["author"]
            )

            xml = _inject_after_heading(xml, "Contexte", merge["contexte"])
            xml = _inject_after_toc_entry(xml, "Description", merge["description"])

        if filename.startswith("word/header"):
            xml = _replace_text_in_xml(
                xml, "Nom de projet", merge["project_name"], 1
            )
            xml = _enlarge_header_logo(xml)

        if filename.startswith("word/footer"):
            xml = _clean_footer(xml)

        return xml

    with zipfile.ZipFile(template_path, "r") as zin:
        with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                data = zin.read(item.filename)

                if item.filename == "[Content_Types].xml":
                    xml = _convert_template_package_xml(data.decode("utf-8"))
                    data = xml.encode("utf-8")

                if item.filename.startswith("word/media/") and item.filename.lower().endswith(
                    (".png", ".jpg", ".jpeg")
                ):
                    dims = _png_dimensions(data)
                    if dims:
                        w, h = dims
                        data = logo_for_dimensions(w, h)
                    else:
                        data = logo_for_dimensions(LOGO_RENDER_WIDTH, LOGO_RENDER_HEIGHT)

                if item.filename.endswith(".xml") and item.filename.startswith("word/"):
                    xml = data.decode("utf-8")
                    xml = transform_xml(item.filename, xml)
                    data = xml.encode("utf-8")

                info = zipfile.ZipInfo(filename=item.filename)
                info.compress_type = zipfile.ZIP_DEFLATED
                zout.writestr(info, data)

    return out.getvalue()


def main() -> None:
    payload = json.load(sys.stdin)
    word_file = payload["wordFile"]
    merge = build_merge_data(payload)
    docx = merge_template(word_file, merge)
    sys.stdout.buffer.write(docx)


if __name__ == "__main__":
    main()
