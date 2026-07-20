#!/usr/bin/env python3
"""Convertit un fichier .docx en HTML pour l'aperçu web (mise en page HERMES)."""

from __future__ import annotations

import base64
import html
import re
import sys
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
REL_NS = "{http://schemas.openxmlformats.org/package/2006/relationships}"
V = "{urn:schemas-microsoft-com:vml}"
WP = "{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
PIC = "{http://schemas.openxmlformats.org/drawingml/2006/picture}"

STYLE_RULES: dict[str, str] = {
    "Titel-Projektbezeichnung1": "font-size:26pt;font-weight:700;color:#1e3a5f;margin:0 0 6px;line-height:1.15;",
    "Titel-Projektbezeichnung2": "font-size:20pt;font-weight:700;color:#2563eb;margin:0 0 14px;line-height:1.2;",
    "Projektidentifikation": "font-weight:700;font-size:10pt;color:#1e293b;background:#eef2f7;",
    "AbsatzTab12Pt1-1": "font-size:12pt;margin:2px 0;",
    "AbsatzTab12Pt1-1Kur": "font-size:12pt;margin:2px 0;",
    "AbsatzTab12PtTitel": "font-size:12pt;font-weight:700;margin:2px 0;",
    "AbsatzTab11Pt1-1": "font-size:11pt;margin:2px 0;",
    "AbsatzTab10Pt1-1KurFett": "font-size:10pt;font-weight:700;margin:2px 0;",
    "Absatz0Pt": "margin:0;height:4px;",
    "Absatz": "font-size:11pt;margin:4px 0;line-height:1.35;",
    "berschrift1": "font-size:16pt;font-weight:700;color:#1e3a5f;margin:18px 0 8px;border-bottom:1px solid #cbd5e1;padding-bottom:4px;",
    "berschrift2": "font-size:13pt;font-weight:700;color:#334155;margin:14px 0 6px;",
    "Aufzhlungspunkt1n0Pt": "font-size:11pt;margin:2px 0 2px 18px;",
    "Beschriftung": "font-size:9pt;color:#64748b;font-style:italic;",
    "Inhaltsverzeichnis": "font-size:11pt;margin:2px 0;",
    "Inhaltsverzeichnis12": "font-size:12pt;margin:2px 0;",
    "Verzeichnis1": "font-size:11pt;margin:2px 0;",
    "Verzeichnis2": "font-size:11pt;margin:2px 0 2px 16px;",
    "Tab-Abstand0": "margin:0;",
}


def _style_attr(style_id: str | None) -> str:
    if not style_id:
        return ""
    css = STYLE_RULES.get(style_id, "font-size:11pt;margin:4px 0;line-height:1.35;")
    return f' style="{css}"'


def _load_relationships(zip_file: zipfile.ZipFile, rels_path: str) -> dict[str, str]:
    try:
        root = ET.fromstring(zip_file.read(rels_path))
    except KeyError:
        return {}
    return {
        rel.get("Id", ""): rel.get("Target", "")
        for rel in root.findall(f"{REL_NS}Relationship")
    }


def _resolve_media_path(base_dir: str, target: str) -> str:
    if target.startswith("/"):
        return target.lstrip("/")
    base = Path(base_dir)
    return str((base / target).as_posix()).replace("\\", "/")


def _media_data_uri(zip_file: zipfile.ZipFile, media_path: str) -> str | None:
    try:
        data = zip_file.read(media_path)
    except KeyError:
        return None
    mime = "image/png"
    if media_path.lower().endswith((".jpg", ".jpeg")):
        mime = "image/jpeg"
    elif media_path.lower().endswith(".gif"):
        mime = "image/gif"
    encoded = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def _text_from_element(elem: ET.Element) -> str:
    parts: list[str] = []
    if elem.tag == f"{W}t":
        parts.append(elem.text or "")
        if elem.tail:
            parts.append(elem.tail)
        return "".join(parts)
    for child in elem:
        parts.append(_text_from_element(child))
        if child.tail:
            parts.append(child.tail)
    return "".join(parts)


def _run_html(
    run: ET.Element,
    zip_file: zipfile.ZipFile | None = None,
    rels: dict[str, str] | None = None,
    rels_base: str = "word",
) -> str:
    parts: list[str] = []
    for child in run:
        if child.tag == f"{W}t":
            text = child.text or ""
            if text:
                parts.append(html.escape(text))
        elif child.tag == f"{W}pict" and zip_file and rels:
            parts.append(_render_pict(child, zip_file, rels, rels_base))
        elif child.tag == f"{W}drawing" and zip_file and rels:
            parts.append(_render_drawing(child, zip_file, rels, rels_base))

    if not parts:
        return ""

    inner = "".join(parts)
    rpr = run.find(f"{W}rPr")
    if rpr is None:
        return inner

    if rpr.find(f"{W}b") is not None:
        inner = f"<strong>{inner}</strong>"
    if rpr.find(f"{W}i") is not None:
        inner = f"<em>{inner}</em>"
    if rpr.find(f"{W}u") is not None:
        inner = f"<u>{inner}</u>"
    color = rpr.find(f"{W}color")
    if color is not None and color.get(f"{W}val") not in (None, "auto"):
        val = color.get(f"{W}val", "")
        if val and val != "auto":
            inner = f'<span style="color:#{val.lstrip("#")}">{inner}</span>'
    return inner


def _image_from_rid(
    zip_file: zipfile.ZipFile,
    rels: dict[str, str],
    rels_base: str,
    rid: str,
    width_px: int | None = None,
) -> str:
    target = rels.get(rid)
    if not target:
        return ""
    media_path = _resolve_media_path(rels_base, target)
    uri = _media_data_uri(zip_file, media_path)
    if not uri:
        return ""
    style = ""
    if width_px:
        style = f' style="max-width:{width_px}px;height:auto;"'
    return f'<img src="{uri}" alt=""{style} />'


def _render_pict(
    pict: ET.Element,
    zip_file: zipfile.ZipFile,
    rels: dict[str, str],
    rels_base: str,
) -> str:
    for imagedata in pict.iter(f"{V}imagedata"):
        rid = imagedata.get(f"{R}id")
        if not rid:
            continue
        width = 140
        shape = pict.find(f".//{V}shape")
        if shape is not None:
            style = shape.get("style", "")
            m = re.search(r"width:\s*([\d.]+)px", style)
            if m:
                width = int(float(m.group(1)))
        return _image_from_rid(zip_file, rels, rels_base, rid, width)
    return ""


def _render_drawing(
    drawing: ET.Element,
    zip_file: zipfile.ZipFile,
    rels: dict[str, str],
    rels_base: str,
) -> str:
    for blip in drawing.iter(f"{A}blip"):
        rid = blip.get(f"{R}embed")
        if rid:
            extent = drawing.find(f".//{WP}extent")
            width = None
            if extent is not None:
                cx = extent.get("cx")
                if cx:
                    width = max(40, int(int(cx) / 914400 * 96))
            return _image_from_rid(zip_file, rels, rels_base, rid, width)
    return ""


def _paragraph_style(paragraph: ET.Element) -> str | None:
    ppr = paragraph.find(f"{W}pPr")
    if ppr is None:
        return None
    pstyle = ppr.find(f"{W}pStyle")
    if pstyle is None:
        return None
    return pstyle.get(f"{W}val")


def _render_paragraph(
    paragraph: ET.Element,
    zip_file: zipfile.ZipFile,
    rels: dict[str, str],
    rels_base: str,
) -> str:
    style_id = _paragraph_style(paragraph)
    inner: list[str] = []

    for child in paragraph:
        tag = child.tag
        if tag == f"{W}r":
            inner.append(_run_html(child, zip_file, rels, rels_base))
        elif tag == f"{W}hyperlink":
            for run in child.findall(f"{W}r"):
                inner.append(_run_html(run, zip_file, rels, rels_base))
        elif tag == f"{W}pict":
            inner.append(_render_pict(child, zip_file, rels, rels_base))
        elif tag == f"{W}drawing":
            inner.append(_render_drawing(child, zip_file, rels, rels_base))

    content = "".join(inner).strip()
    if not content:
        return f"<p{_style_attr(style_id)}>&nbsp;</p>"
    return f"<p{_style_attr(style_id)}>{content}</p>"


def _render_table_cell(
    cell: ET.Element,
    zip_file: zipfile.ZipFile,
    rels: dict[str, str],
    rels_base: str,
) -> str:
    parts: list[str] = []
    for child in cell:
        if child.tag == f"{W}p":
            parts.append(_render_paragraph(child, zip_file, rels, rels_base))
        elif child.tag == f"{W}tbl":
            parts.append(_render_table(child, zip_file, rels, rels_base))
        elif child.tag == f"{W}sdt":
            parts.append(_render_sdt(child, zip_file, rels, rels_base))
    return f"<td>{''.join(parts)}</td>"


def _render_table_row(
    row: ET.Element,
    zip_file: zipfile.ZipFile,
    rels: dict[str, str],
    rels_base: str,
) -> str:
    cells: list[str] = []
    for cell in row:
        if cell.tag == f"{W}tc":
            cells.append(_render_table_cell(cell, zip_file, rels, rels_base))
        elif cell.tag == f"{W}sdt":
            for tc in cell.iter(f"{W}tc"):
                cells.append(_render_table_cell(tc, zip_file, rels, rels_base))
                break
    return f"<tr>{''.join(cells)}</tr>"


def _render_table(
    table: ET.Element,
    zip_file: zipfile.ZipFile,
    rels: dict[str, str],
    rels_base: str,
) -> str:
    rows: list[str] = []
    for row in table.findall(f"{W}tr"):
        rows.append(_render_table_row(row, zip_file, rels, rels_base))
    return (
        '<table class="hermes-table"><tbody>'
        + "".join(rows)
        + "</tbody></table>"
    )


def _render_sdt(
    sdt: ET.Element,
    zip_file: zipfile.ZipFile,
    rels: dict[str, str],
    rels_base: str,
) -> str:
    content = sdt.find(f"{W}sdtContent")
    if content is None:
        return ""
    return _render_block(content, zip_file, rels, rels_base)


def _render_block(
    block: ET.Element,
    zip_file: zipfile.ZipFile,
    rels: dict[str, str],
    rels_base: str,
) -> str:
    parts: list[str] = []
    for child in block:
        tag = child.tag
        if tag == f"{W}p":
            parts.append(_render_paragraph(child, zip_file, rels, rels_base))
        elif tag == f"{W}tbl":
            parts.append(_render_table(child, zip_file, rels, rels_base))
        elif tag == f"{W}sdt":
            parts.append(_render_sdt(child, zip_file, rels, rels_base))
        elif tag == f"{W}tc":
            parts.append(_render_table_cell(child, zip_file, rels, rels_base))
    return "".join(parts)


def _render_part(
    zip_file: zipfile.ZipFile,
    part_path: str,
    wrapper_class: str,
) -> str:
    try:
        root = ET.fromstring(zip_file.read(part_path))
    except KeyError:
        return ""

    rels_path = str(Path(part_path).parent / "_rels" / f"{Path(part_path).name}.rels")
    rels = _load_relationships(zip_file, rels_path.replace("word/", "word/"))
    rels_base = str(Path(part_path).parent)

    body = _render_block(root, zip_file, rels, rels_base)
    if not body.strip():
        return ""
    return f'<div class="{wrapper_class}">{body}</div>'


def convert_docx_to_html(docx_bytes: bytes) -> str:
    with zipfile.ZipFile(BytesIO(docx_bytes)) as zf:
        doc_rels = _load_relationships(zf, "word/_rels/document.xml.rels")
        root = ET.fromstring(zf.read("word/document.xml"))
        body = root.find(f"{W}body")
        if body is None:
            raise ValueError("document.xml sans corps")

        rels_base = "word"
        main = _render_block(body, zf, doc_rels, rels_base)

        header = _render_part(zf, "word/header3.xml", "hermes-header")
        if not header:
            header = _render_part(zf, "word/header1.xml", "hermes-header")
        footer = _render_part(zf, "word/footer3.xml", "hermes-footer")

    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0;
    padding: 16px;
    background: #e2e8f0;
    font-family: Calibri, "Segoe UI", Arial, sans-serif;
    color: #0f172a;
  }}
  .hermes-page {{
    max-width: 210mm;
    margin: 0 auto;
    background: #fff;
    box-shadow: 0 4px 24px rgba(15, 23, 42, 0.12);
    padding: 18mm 20mm 22mm;
    min-height: 297mm;
  }}
  .hermes-header {{
    border-bottom: 1px solid #cbd5e1;
    margin-bottom: 16px;
    padding-bottom: 8px;
  }}
  .hermes-header table, .hermes-footer table {{
    width: 100%;
    border: none !important;
  }}
  .hermes-header table.hermes-table td,
  .hermes-footer table.hermes-table td {{
    border: none !important;
    background: transparent !important;
  }}
  .hermes-header td, .hermes-footer td {{
    border: none !important;
    padding: 2px 4px;
    vertical-align: middle;
  }}
  .hermes-footer {{
    border-top: 1px solid #cbd5e1;
    margin-top: 24px;
    padding-top: 8px;
    font-size: 9pt;
    color: #64748b;
  }}
  .hermes-body p {{ margin: 4px 0; }}
  table.hermes-table {{
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0 14px;
    font-size: 11pt;
  }}
  table.hermes-table td {{
    border: 1px solid #94a3b8;
    padding: 5px 8px;
    vertical-align: top;
  }}
  table.hermes-table tr:first-child td {{
    background: #f1f5f9;
  }}
  img {{ max-width: 100%; height: auto; vertical-align: middle; }}
  strong {{ font-weight: 700; }}
</style>
</head>
<body>
<div class="hermes-page">
{header}
<div class="hermes-body">
{main}
</div>
{footer}
</div>
</body>
</html>"""


def main() -> None:
    docx = sys.stdin.buffer.read()
    sys.stdout.write(convert_docx_to_html(docx))


if __name__ == "__main__":
    main()
